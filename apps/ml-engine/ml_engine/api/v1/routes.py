from fastapi import APIRouter

router = APIRouter()


@router.post("/v1/categorization/predict")
async def predict_categorization():
    # TODO: implement prediction endpoint
    return {"message": "Not implemented"}
