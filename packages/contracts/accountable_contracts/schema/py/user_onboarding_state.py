from pydantic import BaseModel
from typing import List, Literal, Optional, Union
from enum import Enum

class StepsItemKeyEnum(str, Enum):
    EMAIL_VERIFIED = "email_verified"
    COMPANY_DETAILS_CONFIRMED = "company_details_confirmed"
    FIRST_BANK_ACCOUNT_ADDED = "first_bank_account_added"

class StepsItemScopeEnum(str, Enum):
    USER = "user"
    COMPANY = "company"

class UserOnboardingState(BaseModel):
    class StepsItem(BaseModel):
        key: StepsItemKeyEnum
        label: str
        complete: bool
        blocked: bool
        optional: bool
        scope: StepsItemScopeEnum
        orderIndex: Optional[float] = None
    isCompanyOwner: bool
    canAccessApp: bool
    userStepsComplete: bool
    nextStepToComplete: Union[StepsItemKeyEnum, Literal[None]]
    steps: List[StepsItem]