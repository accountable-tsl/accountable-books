from pydantic import BaseModel, constr
from enum import Enum

UNIT_AMOUNT_MINOR_REGEX = r"^\d+$"

class BillingIntervalEnum(str, Enum):
    MONTH = "month"
    YEAR = "year"

class BillingCatalogPriceSummarySchema(BaseModel):
    currencyCode: constr(min_length=3, max_length=3)
    billingInterval: BillingIntervalEnum
    unitAmountMinor: constr(pattern=UNIT_AMOUNT_MINOR_REGEX)