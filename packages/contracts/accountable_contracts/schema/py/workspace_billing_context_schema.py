from pydantic import BaseModel, constr
from typing import Optional
from enum import Enum
from datetime import datetime

class BillingAccountOwnerTypeEnum(str, Enum):
    FIRM = "firm"
    BUSINESS = "business"
    INDIVIDUAL = "individual"

class BillingAccountStatusEnum(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CLOSED = "closed"

class CommercialModeEnum(str, Enum):
    SELF_SERVE = "self_serve"
    FIRM_MANAGED = "firm_managed"
    FIRM_INTERNAL = "firm_internal"

class SoftwarePayerEnum(str, Enum):
    BILLING_ACCOUNT = "billing_account"
    CLIENT_BILLING_ACCOUNT = "client_billing_account"

class WorkspaceBillingContextSchema(BaseModel):
    class BillingAccount(BaseModel):
        id: constr(min_length=1, max_length=128)
        ownerCompanyId: constr(min_length=1, max_length=128)
        ownerType: BillingAccountOwnerTypeEnum
        invoiceCurrencyCode: constr(min_length=3, max_length=3)
        status: BillingAccountStatusEnum
    class ClientBillingAccount(BaseModel):
        id: constr(min_length=1, max_length=128)
        ownerCompanyId: constr(min_length=1, max_length=128)
        ownerType: BillingAccountOwnerTypeEnum
        invoiceCurrencyCode: constr(min_length=3, max_length=3)
        status: BillingAccountStatusEnum
    workspaceCompanyId: constr(min_length=1, max_length=128)
    ownershipId: constr(min_length=1, max_length=128)
    billingAccountId: constr(min_length=1, max_length=128)
    clientBillingAccountId: Optional[constr(min_length=1, max_length=128)]
    commercialMode: CommercialModeEnum
    softwarePayer: SoftwarePayerEnum
    isFirmInternalWorkspace: bool
    effectiveAt: datetime
    endedAt: Optional[datetime]
    billingAccount: BillingAccount
    clientBillingAccount: Optional[ClientBillingAccount]