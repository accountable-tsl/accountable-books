from pydantic import BaseModel, constr
from typing import Literal, Optional
from uuid import UUID

DEFAULT_TIMEZONE_REGEX = r"^[A-Za-z]+\/[A-Za-z_]+$"

class FirmClientInviteCompanyStep2BusinessSchema(BaseModel):
    type: Literal["business"]
    legalName: constr(min_length=2, max_length=256)
    countryId: UUID
    reportingCurrencyId: UUID
    registrationNumber: Optional[constr(max_length=256)] = None
    taxId: Optional[constr(max_length=256)] = None
    defaultTimezone: Optional[constr(pattern=DEFAULT_TIMEZONE_REGEX)] = None
    industry: constr(min_length=1, max_length=256)