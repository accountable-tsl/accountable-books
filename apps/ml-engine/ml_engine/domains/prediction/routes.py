from fastapi import APIRouter, Request

from accountable_contracts.schema import (
    EnrichedTransaction,
    MlPredictionOutput,
)
from ml_engine.domains.prediction.prediction_service import (
    get_prediction_service,
)

router = APIRouter()


@router.post("/predict", response_model=MlPredictionOutput)
async def predict_categorization(request: EnrichedTransaction):
    """
    Accept enriched transaction and predict accounting entries using ML model.
    """
    prediction_service = get_prediction_service()
    return await prediction_service.predict(request)

