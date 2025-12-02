import pytest
import asyncio
from uuid import UUID
from unittest.mock import AsyncMock, MagicMock, patch

from ml_engine.domains.prediction.prediction_service import PredictionService
from ml_engine.core.exceptions import PredictionServiceError
from accountable_contracts.schema import (
    EnrichedTransaction,
    MlPredictionOutput,
    GlobalIntentClassifier,
    TenantAccountRanker,
    AccountTypeKeys,
    LabelRole,
    ReasonEnum,
)

from accountable_contracts.data import latest_enriched_transaction as enriched_transaction_data


@pytest.fixture
def enriched_txn():
    return EnrichedTransaction.model_validate(enriched_transaction_data())


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
    # Use fixed UUIDs for testing
    account_id_1 = UUID("550e8400-e29b-41d4-a716-446655440620")
    
    with (
        patch.object(service.intent_classifier, "predict") as mock_model_A,
        patch.object(service.tenant_ranker, "predict") as mock_model_B,
        patch("ml_engine.domains.prediction.prediction_service.fetch_company_coa", new_callable=AsyncMock) as mock_fetch_coa,
    ):
        # Create proper GlobalIntentClassifier mock
        global_intent = GlobalIntentClassifier(
            model_name="global_intent_classifier",
            model_version="v260101-01-1.0.0",
            latency_ms=32.0,
            semantic_top1="exp_opex_software_subscriptions",
            semantic_top1_prob=0.9,
            semantic_top_k=[
                GlobalIntentClassifier.SemanticTopKItem(
                    key=AccountTypeKeys.EXP_OPEX_SOFTWARE_SUBSCRIPTIONS,
                    prob=0.9,
                    label_role=LabelRole.SEMANTIC,
                )
            ],
            shap_values={"emb_description": 0.65},
            feature_mapping_version="fmap_a_1.0",
        )
        mock_model_A.return_value = global_intent

        # Create proper TenantAccountRanker mock
        tenant_ranker = TenantAccountRanker(
            model_name="tenant_account_ranker",
            model_version="v260101-01-1.0.0",
            latency_ms=14.0,
            selected_account_id=account_id_1,
            selected_account_label="Software Expense",
            selected_account_score=0.92,
            ranking_top_k=[
                TenantAccountRanker.RankingTopKItem(
                    account_id=account_id_1,
                    account_label="Software Expense",
                    score=0.92,
                    reason=ReasonEnum.SEMANTIC_INTENT,
                )
            ],
            explanation=TenantAccountRanker.Explanation(
                reason=ReasonEnum.SEMANTIC_INTENT,
                message="Matched based on semantic intent",
            ),
            shap_values={"vendor_match_strength": 0.55},
            feature_mapping_version="fmap_b_1.0",
        )
        mock_model_B.return_value = tenant_ranker

        # fetch_company_coa returns List[Dict[str, Any]]
        mock_fetch_coa.return_value = [{"id": str(account_id_1), "label": "Software Expense", "name": "Software Expense"}]

        out: MlPredictionOutput = await service.predict(prediction_request)

        # Ensure model A was called once
        mock_model_A.assert_called_once()

        # Ensure model B was called with the output of model A
        args, kwargs = mock_model_B.call_args
        assert kwargs["company_coa"] == [{"id": str(account_id_1), "label": "Software Expense", "name": "Software Expense"}]

        # Validate final output shape
        assert out.final_posting.account_id == account_id_1
        assert out.final_posting.account_label == "Software Expense"
        assert out.global_intent_classifier.semantic_top1 == "exp_opex_software_subscriptions"
        assert out.global_intent_classifier.semantic_top1_prob == 0.9


# ------------------------------------------------------------
# COA FETCH FAILURE → fallback to None
# ------------------------------------------------------------
@pytest.mark.asyncio
async def test_prediction_service_fallback_when_coa_fails(service, prediction_request):
    # Use fixed UUIDs for testing
    account_id_2 = UUID("550e8400-e29b-41d4-a716-446655440710")
    
    with (
        patch.object(service.intent_classifier, "predict") as mock_model_A,
        patch.object(service.tenant_ranker, "predict") as mock_model_B,
        patch("ml_engine.domains.prediction.prediction_service.fetch_company_coa", new_callable=AsyncMock, side_effect=Exception("redis down")),
    ):
        # Create proper GlobalIntentClassifier mock
        global_intent = GlobalIntentClassifier(
            model_name="global_intent_classifier",
            model_version="v260101-01-1.0.0",
            latency_ms=32.0,
            semantic_top1="exp_opex_bank_fees",
            semantic_top1_prob=0.8,
            semantic_top_k=[
                GlobalIntentClassifier.SemanticTopKItem(
                    key=AccountTypeKeys.EXP_OPEX_BANK_FEES,
                    prob=0.8,
                    label_role=LabelRole.SEMANTIC,
                )
            ],
            shap_values={"emb_description": 0.60},
            feature_mapping_version="fmap_a_1.0",
        )
        mock_model_A.return_value = global_intent

        # Create proper TenantAccountRanker mock
        tenant_ranker = TenantAccountRanker(
            model_name="tenant_account_ranker",
            model_version="v260101-01-1.0.0",
            latency_ms=14.0,
            selected_account_id=account_id_2,
            selected_account_label="Bank Charges",
            selected_account_score=0.85,
            ranking_top_k=[
                TenantAccountRanker.RankingTopKItem(
                    account_id=account_id_2,
                    account_label="Bank Charges",
                    score=0.85,
                    reason=ReasonEnum.SEMANTIC_INTENT,
                )
            ],
            explanation=TenantAccountRanker.Explanation(
                reason=ReasonEnum.SEMANTIC_INTENT,
                message="Matched based on semantic intent",
            ),
            shap_values={"vendor_match_strength": 0.50},
            feature_mapping_version="fmap_b_1.0",
        )
        mock_model_B.return_value = tenant_ranker

        out = await service.predict(prediction_request)

        # COA passed to Model B must be None
        _, kwargs = mock_model_B.call_args
        assert kwargs["company_coa"] is None

        assert out.final_posting.account_id == account_id_2
        assert out.final_posting.account_label == "Bank Charges"


# ------------------------------------------------------------
# MODEL FAILURE → PredictionServiceError
# ------------------------------------------------------------
@pytest.mark.asyncio
async def test_prediction_service_raises_on_failure(service, prediction_request):
    with (
        patch.object(service.intent_classifier, "predict", side_effect=RuntimeError("model crashed")),
        patch("ml_engine.domains.prediction.prediction_service.fetch_company_coa", new_callable=AsyncMock, return_value=None),
    ):
        with pytest.raises(PredictionServiceError):
            await service.predict(prediction_request)
