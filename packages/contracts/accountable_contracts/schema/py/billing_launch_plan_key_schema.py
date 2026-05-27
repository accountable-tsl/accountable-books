from enum import Enum

class BillingLaunchPlanKeySchema(str, Enum):
    FIRM_FREE = "firm_free"
    FIRM_STANDARD = "firm_standard"
    FIRM_CUSTOM = "firm_custom"
    BUSINESS_BASIC = "business_basic"
    BUSINESS_STANDARD = "business_standard"
    BUSINESS_PREMIUM = "business_premium"
    INDIVIDUAL_FREE = "individual_free"