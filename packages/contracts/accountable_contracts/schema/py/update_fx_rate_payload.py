from pydantic import BaseModel, confloat, constr

class UpdateFxRatePayload(BaseModel):
    bankTransactionId: constr(min_length=1)
    rate: confloat(gt=0)