from fastapi import APIRouter

router = APIRouter()

# Categorization routes
@router.post("v1/categorization/predict")
async def predict_categorization():
