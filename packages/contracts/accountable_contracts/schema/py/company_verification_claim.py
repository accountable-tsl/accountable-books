from pydantic import BaseModel
from typing import Any

class CompanyVerificationClaim(BaseModel):
    verifiedAt: Any