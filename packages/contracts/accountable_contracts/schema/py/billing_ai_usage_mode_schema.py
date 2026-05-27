from enum import Enum

class BillingAiUsageModeSchema(str, Enum):
    PAID = "paid"
    FREE_TIER = "free_tier"
    DISABLED = "disabled"
    NOT_APPLICABLE = "not_applicable"