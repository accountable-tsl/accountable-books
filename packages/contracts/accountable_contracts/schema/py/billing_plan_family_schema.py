from enum import Enum

class BillingPlanFamilySchema(str, Enum):
    FIRM = "firm"
    BUSINESS = "business"
    INDIVIDUAL = "individual"