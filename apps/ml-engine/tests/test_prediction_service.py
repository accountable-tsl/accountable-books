import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from ml_engine.domains.prediction.prediction_service import PredictionService
from ml_engine.core.exceptions import PredictionServiceError
from accountable_contracts.schema import (
    EnrichedTransaction,
    MlPredictionOutput,
)
from accountable_contracts.data import latest_enriched_transaction as test_data


@pytest.fixture
def enriched_txn():
    return EnrichedTransaction.model_validate(test_data())


@pytest.fixture
def prediction_request(enriched_txn):
    return enriched_txn


@pytest.fixture
def service():
    return PredictionService()


# ------------------------------------------------------------
# HAPPY PATH
# ------------------------------------------------------------
@pytest.mark.asyncio
async def test_prediction_service_happy_path(service, prediction_request):
    with (
        patch.object(service.intent_classifier, "predict") as mock_model_A,
        patch.object(service.tenant_ranker, "predict") as mock_model_B,
        patch("ml_engine.services.coa_client.fetch_company_coa") as mock_fetch_coa,
    ):
        # Mock outputs
        mock_model_A.return_value = {"intent": "software", "score": 0.9}

        mock_model_B.return_value = MagicMock(
            selected_account_id="6200",
            selected_account_label="Software Expense",
        )

        mock_fetch_coa.return_value = {"6200": {"label": "Software Expense"}}

        out: MlPredictionOutput = await service.predict(prediction_request)

        # Ensure model A was called once
        mock_model_A.assert_called_once()

        # Ensure model B was called with the output of model A
        args, kwargs = mock_model_B.call_args
        assert kwargs["company_coa"] == {"6200": {"label": "Software Expense"}}

        # Validate final output shape
        assert out.final_posting.account_id == "6200"
        assert out.final_posting.account_label == "Software Expense"
        assert out.global_intent_classifier == {"intent": "software", "score": 0.9}


# ------------------------------------------------------------
# COA FETCH FAILURE → fallback to None
# ------------------------------------------------------------
@pytest.mark.asyncio
async def test_prediction_service_fallback_when_coa_fails(service, prediction_request):
    with (
        patch.object(service.intent_classifier, "predict") as mock_model_A,
        patch.object(service.tenant_ranker, "predict") as mock_model_B,
        patch("ml_engine.services.coa_client.fetch_company_coa", side_effect=Exception("redis down")),
    ):
        mock_model_A.return_value = {"intent": "bank_fee", "score": 0.8}

        mock_model_B.return_value = MagicMock(
            selected_account_id="7100",
            selected_account_label="Bank Charges",
        )

        out = await service.predict(prediction_request)

        # COA passed to Model B must be None
        _, kwargs = mock_model_B.call_args
        assert kwargs["company_coa"] is None

        assert out.final_posting.account_id == "7100"
        assert out.final_posting.account_label == "Bank Charges"


# ------------------------------------------------------------
# MODEL FAILURE → PredictionServiceError
# ------------------------------------------------------------
@pytest.mark.asyncio
async def test_prediction_service_raises_on_failure(service, prediction_request):
    with (
        patch.object(service.intent_classifier, "predict", side_effect=RuntimeError("model crashed")),
        patch("ml_engine.services.coa_client.fetch_company_coa", return_value=None),
    ):
        with pytest.raises(PredictionServiceError):
            await service.predict(prediction_request)
