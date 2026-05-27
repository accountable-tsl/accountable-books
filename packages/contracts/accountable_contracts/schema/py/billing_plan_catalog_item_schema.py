from pydantic import BaseModel, constr
from enum import Enum

class PlanFamilyEnum(str, Enum):
    FIRM = "firm"
    BUSINESS = "business"
    INDIVIDUAL = "individual"

class PlanKindEnum(str, Enum):
    FREE = "free"
    PAID = "paid"
    CUSTOM_CONTACT = "custom_contact"

class BillingPlanCatalogItemSchema(BaseModel):
    planKey: constr(min_length=1, max_length=120)
    planFamily: PlanFamilyEnum
    planKind: PlanKindEnum
    displayName: constr(min_length=1, max_length=160)
    isActive: bool