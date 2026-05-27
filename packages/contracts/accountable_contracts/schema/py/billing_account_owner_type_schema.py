from enum import Enum

class BillingAccountOwnerTypeSchema(str, Enum):
    FIRM = "firm"
    BUSINESS = "business"
    INDIVIDUAL = "individual"