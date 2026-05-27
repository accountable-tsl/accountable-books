from pydantic import BaseModel
from typing import Optional

class BillingActionCapabilitiesSchema(BaseModel):
    canManageBilling: bool
    canViewBreakdownDetails: bool
    billingPortalUrl: Optional[str] = None
    breakdownDetailsAvailable: bool