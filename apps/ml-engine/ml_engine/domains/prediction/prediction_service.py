"""Prediction service for transaction categorization."""

import logging
import time

from ml_engine.core.exceptions import PredictionServiceError
from ml_engine.models.categorization.global_intent_classifier import (
    get_global_intent_classifier,
)
from ml_engine.models.categorization.tenant_account_ranker import (
    get_tenant_account_ranker,
)
from ml_engine.models.registry import get_model_registry
from ml_engine.services.coa_client import fetch_company_coa
from accountable_contracts.schema import (
    MlPredictionOutput,
    EnrichedTransaction,
    FinalPosting,
)

logger = logging.getLogger(__name__)


class PredictionService:
    """Service for generating ML predictions for transaction categorization."""

    def __init__(self):
        registry = get_model_registry()

        self.intent_classifier = get_global_intent_classifier(
            model_config=registry.get_model_config("global_intent_classifier")
        )
        self.tenant_ranker = get_tenant_account_ranker(
            model_config=registry.get_model_config("tenant_account_ranker")
        )
        self.model_version = self.intent_classifier.model_version

    async def predict(self, request: EnrichedTransaction) -> MlPredictionOutput:
        start = time.time()
        etx = request

        company_id = etx.ids.company_uuid
        bank_txn_id = etx.ids.bank_transaction_id

        logger.info(
            "Processing ML prediction",
            extra={"company_id": company_id, "bank_transaction_id": bank_txn_id},
        )

        snapshot_version = etx.context.coa_snapshot_version
        try:
            company_coa = await fetch_company_coa(company_id, snapshot_version)
        except Exception as err:
            logger.warning(
                "COA fetch failed, using defaults",
                extra={
                    "company_id": company_id,
                    "snapshot_version": snapshot_version,
                    "error": str(err),
                },
            )
            company_coa = None

        try:
            global_intent = self.intent_classifier.predict(etx)

            ranker_output = self.tenant_ranker.predict(
                etx,
                global_intent,
                company_coa=company_coa,
            )

            latency = int((time.time() - start) * 1000)
            logger.info(
                "ML prediction completed",
                extra={
                    "company_id": company_id,
                    "bank_transaction_id": bank_txn_id,
                    "latency_ms": latency,
                },
            )

            return MlPredictionOutput(
                final_posting=FinalPosting(
                    account_id=ranker_output.selected_account_id,
                    account_label=ranker_output.selected_account_label,
                ),
                global_intent_classifier=global_intent,
                tenant_account_ranker=ranker_output,
            )

        except Exception as e:
            latency = int((time.time() - start) * 1000)
            logger.error(
                "ML prediction failed",
                extra={
                    "company_id": company_id,
                    "bank_transaction_id": bank_txn_id,
                    "latency_ms": latency,
                    "error": str(e),
                },
                exc_info=True,
            )
            raise PredictionServiceError("ML prediction failed") from e


# Singleton instance
_prediction_service: PredictionService | None = None


def get_prediction_service() -> PredictionService:
    global _prediction_service
    if _prediction_service is None:
        _prediction_service = PredictionService()
    return _prediction_service
