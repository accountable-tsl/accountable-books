from enum import Enum

class BillingEstimateStatusSchema(str, Enum):
    ESTIMATED = "estimated"
    FINALIZED = "finalized"