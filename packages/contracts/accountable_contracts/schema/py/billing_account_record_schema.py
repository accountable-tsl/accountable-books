from pydantic import BaseModel, constr
from enum import Enum

class OwnerTypeEnum(str, Enum):
    FIRM = "firm"
    BUSINESS = "business"
    INDIVIDUAL = "individual"

class StatusEnum(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CLOSED = "closed"

class BillingAccountRecordSchema(BaseModel):
    id: constr(min_length=1, max_length=128)
    ownerCompanyId: constr(min_length=1, max_length=128)
    ownerType: OwnerTypeEnum
    invoiceCurrencyCode: constr(min_length=3, max_length=3)
    status: StatusEnum