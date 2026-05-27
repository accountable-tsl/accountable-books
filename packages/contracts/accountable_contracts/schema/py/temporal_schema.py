from pydantic import BaseModel, confloat
from datetime import date

class TemporalSchema(BaseModel):
    class FiscalPeriod(BaseModel):
        year_start: date
        year_end: date
        quarter_start: date
        quarter_end: date
        month_start: date
        month_end: date
    day_of_week: confloat(ge=0, le=6)
    day_of_month: confloat(ge=1, le=31)
    calendar_month: confloat(ge=1, le=12)
    calendar_quarter: confloat(ge=1, le=4)
    fiscal_month: confloat(ge=1, le=12)
    fiscal_quarter: confloat(ge=1, le=4)
    fiscal_period: FiscalPeriod