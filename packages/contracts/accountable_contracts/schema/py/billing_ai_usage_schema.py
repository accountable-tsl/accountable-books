from pydantic import BaseModel, conint, constr
from typing import Any, Optional, Union
from enum import Enum
from datetime import datetime

class FirmWorkflowOption0ModeEnum(str, Enum):
    PAID = "paid"
    FREE_TIER = "free_tier"

class FirmWorkflowOption1ModeEnum(str, Enum):
    DISABLED = "disabled"
    NOT_APPLICABLE = "not_applicable"

class BillingAiUsageSchema(BaseModel):
    class FirmWorkflowOption0(BaseModel):
        class FirmWorkflowOption0Usage(BaseModel):
            used: conint(ge=0)
            included: Optional[conint(ge=0)]
            remaining: Optional[conint(ge=0)]
            unitLabel: constr(min_length=1, max_length=64)
            periodStartAt: Optional[datetime] = None
            periodEndAt: Optional[datetime] = None
        mode: FirmWorkflowOption0ModeEnum
        usage: FirmWorkflowOption0Usage
    class FirmWorkflowOption1(BaseModel):
        mode: FirmWorkflowOption1ModeEnum
        usage: Optional[Any] = None
    class ClientExperienceOption0(BaseModel):
        class ClientExperienceOption0Usage(BaseModel):
            used: conint(ge=0)
            included: Optional[conint(ge=0)]
            remaining: Optional[conint(ge=0)]
            unitLabel: constr(min_length=1, max_length=64)
            periodStartAt: Optional[datetime] = None
            periodEndAt: Optional[datetime] = None
        mode: FirmWorkflowOption0ModeEnum
        usage: ClientExperienceOption0Usage
    class ClientExperienceOption1(BaseModel):
        mode: FirmWorkflowOption1ModeEnum
        usage: Optional[Any] = None
    firmWorkflow: Optional[Union[FirmWorkflowOption0, FirmWorkflowOption1]] = None
    clientExperience: Optional[Union[ClientExperienceOption0, ClientExperienceOption1]] = None