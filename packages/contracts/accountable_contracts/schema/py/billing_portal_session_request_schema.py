from pydantic import BaseModel
from typing import Optional

class BillingPortalSessionRequestSchema(BaseModel):
    returnUrl: Optional[str] = None