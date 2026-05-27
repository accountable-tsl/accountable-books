from enum import Enum

class BillingIntervalSchema(str, Enum):
    MONTH = "month"
    YEAR = "year"