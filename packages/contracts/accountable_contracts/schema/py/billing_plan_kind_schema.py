from enum import Enum

class BillingPlanKindSchema(str, Enum):
    FREE = "free"
    PAID = "paid"
    CUSTOM_CONTACT = "custom_contact"