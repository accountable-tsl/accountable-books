"""Prediction service for transaction categorization."""

import logging
import time
from uuid import uuid4

from ml_engine.core.exceptions import PredictionServiceError
from schema import (
    MlPredictionRequest,
    MlPredictionResponse,
)

logger = logging.getLogger(__name__)


class PredictionService:
    """Service for generating ML predictions for transaction categorization."""

    def __init__(self):
        """Initialize the prediction service."""
        # TODO: Load ML model here when implemented
        # self.model = load_model()
        # self.model_version = get_model_version()
        self.model_version = "placeholder-v0.0.0"

    async def predict(
        self, request: MlPredictionRequest
    ) -> MlPredictionResponse:
        """
        Generate predictions for transaction categorization.

        Args:
            request: ML prediction request containing enriched transaction

        Returns:
            ML prediction response with categorized journal entries

        Raises:
            PredictionServiceError: If prediction fails
        """
        start_time = time.time()
        company_id = request.enriched_transaction.ids.company_uuid
        bank_transaction_id = (
            request.enriched_transaction.ids.bank_transaction_id
        )

        logger.info(
            {
                "company_id": company_id,
                "bank_transaction_id": bank_transaction_id,
            },
            "Processing ML prediction request",
        )

        try:
            # TODO: Implement actual ML model prediction
            # Steps:
            # 1. Prepare features from enriched transaction
            # 2. Load/use ML model
            # 3. Generate predictions
            # 4. Format predictions into response structure
            # 5. Calculate confidence scores and explanations

            # Placeholder: Return empty predictions for now
            # This will be replaced with actual model inference
            predictions = []

            latency_ms = int((time.time() - start_time) * 1000)

            response = MlPredictionResponse(
                success=True,
                predictions=predictions,
                model_version=self.model_version,
                latency_ms=latency_ms,
                error=None,
                debug=None,
            )

            logger.info(
                {
                    "company_id": company_id,
                    "bank_transaction_id": bank_transaction_id,
                    "predictions_count": len(predictions),
                    "latency_ms": latency_ms,
                },
                "ML prediction completed successfully",
            )

            return response

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)

            logger.error(
                {
                    "error": str(e),
                    "company_id": company_id,
                    "bank_transaction_id": bank_transaction_id,
                    "latency_ms": latency_ms,
                },
                "ML prediction failed",
                exc_info=True,
            )

            # Raise exception - let global exception handler format the response
            raise PredictionServiceError(
                f"ML prediction failed: {str(e)}"
            ) from e


# Singleton instance
_prediction_service: PredictionService | None = None


def get_prediction_service() -> PredictionService:
    """
    Get or create the prediction service singleton.

    Returns:
        PredictionService instance
    """
    global _prediction_service
    if _prediction_service is None:
        _prediction_service = PredictionService()
    return _prediction_service

