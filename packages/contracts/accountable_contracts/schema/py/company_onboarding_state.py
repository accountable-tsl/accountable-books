from pydantic import BaseModel
from typing import Any, Literal, Optional

class CompanyOnboardingState2(BaseModel):
    class Steps(BaseModel):
        company_details_confirmed: Optional[Optional[bool]] = None
        first_bank_account_added: Optional[Optional[bool]] = None
    class CompletedAt(BaseModel):
        company_details_confirmed: Any
        first_bank_account_added: Any
    steps: Steps
    completed_at: Optional[CompletedAt] = None
    metadata: Optional[Optional[Literal[None]]] = None

type CompanyOnboardingState = Optional[Optional[CompanyOnboardingState]]