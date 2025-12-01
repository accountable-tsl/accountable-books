from pydantic import BaseModel, conint

class BaseRollingStats(BaseModel):
    transaction_count: conint(ge=0)
    amount_native_sum: float
    avg_amount_native: float
    stddev_amount_native: float