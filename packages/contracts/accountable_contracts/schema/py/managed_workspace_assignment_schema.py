from pydantic import BaseModel, constr
from enum import Enum

class BillingIntervalEnum(str, Enum):
    MONTH = "month"
    YEAR = "year"

class ManagedWorkspaceAssignmentSchema(BaseModel):
    managedWorkspaceCompanyId: constr(min_length=1, max_length=128)
    firmBillingAccountId: constr(min_length=1, max_length=128)
    platformPlanKey: constr(min_length=1, max_length=120)
    currencyCode: constr(min_length=3, max_length=3)
    billingInterval: BillingIntervalEnum