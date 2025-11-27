from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from schema import (
    MlPredictionRequest,
    MlPredictionResponse,
)
from ml_engine.domains.prediction.prediction_service import (
    get_prediction_service,
)

router = APIRouter()

@router.exception_handler(Exception)
async def prediction_exception_handler(_: Request, exc: Exception):
    import logging
    logging.getLogger(__name__).exception("ML prediction failed")
    return JSONResponse(
        status_code=500,
        content=MlPredictionResponse(
            success=False,
            predictions=[],
            modelVersion="error",
            error="Internal server error",
        ).model_dump(),
    )


@router.post("/predict", response_model=MlPredictionResponse)
async def predict_categorization(request: MlPredictionRequest):
    """
    Accept enriched transaction and predict accounting entries using ML model.
    """
    prediction_service = get_prediction_service()
    return await prediction_service.predict(request)

