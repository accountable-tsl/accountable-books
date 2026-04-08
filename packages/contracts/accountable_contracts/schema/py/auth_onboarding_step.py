from pydantic import BaseModel
from typing import Optional
from enum import Enum

class KeyEnum(str, Enum):
    EMAIL_VERIFIED = "email_verified"
    COMPANY_DETAILS_CONFIRMED = "company_details_confirmed"
    FIRST_BANK_ACCOUNT_ADDED = "first_bank_account_added"

class ScopeEnum(str, Enum):
    USER = "user"
    COMPANY = "company"

class AuthOnboardingStep(BaseModel):
    key: KeyEnum
    label: str
    complete: bool
    blocked: bool
    optional: bool
    scope: ScopeEnum
    orderIndex: Optional[float] = None