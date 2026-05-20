from enum import Enum

class BillingAiPayerSchema(str, Enum):
    FIRM = "firm"
    CLIENT = "client"
    DISABLED = "disabled"
    FREE_TIER = "free_tier"