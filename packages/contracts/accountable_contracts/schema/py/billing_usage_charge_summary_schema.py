from pydantic import BaseModel, conint
from typing import Optional

class BillingUsageChargeSummarySchema(BaseModel):
    amount: Optional[float] = None
    units: conint(ge=0)
    included: Optional[conint(ge=0)] = None
    remaining: Optional[conint(ge=0)] = None