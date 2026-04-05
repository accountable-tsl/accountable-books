from pydantic import BaseModel, conint

class FirmClientTransactionStatsSchema(BaseModel):
    today: conint(ge=0)
    week: conint(ge=0)
    month: conint(ge=0)
    todayPrev: conint(ge=0)
    weekPrev: conint(ge=0)
    monthPrev: conint(ge=0)