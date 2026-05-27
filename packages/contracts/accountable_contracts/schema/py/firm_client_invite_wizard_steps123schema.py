from pydantic import BaseModel, Field, confloat, constr
from typing import Literal, Optional, Union
from enum import Enum
from uuid import UUID

DEFAULT_TIMEZONE_REGEX = r"^[A-Za-z]+\/[A-Za-z_]+$"

class CompanyOption0AccountingBasisEnum(str, Enum):
    MODIFIED_CASH_BASIS = "modified_cash_basis"
    MODIFIED_ACCRUAL_BASIS = "modified_accrual_basis"

class CompanyOption0ReportingFrameworkEnum(str, Enum):
    IFRS = "ifrs"
    US_GAAP = "us_gaap"

class FirmClientInviteWizardSteps123Schema(BaseModel):
    class Invite(BaseModel):
        email: constr(min_length=1)
        primaryContactName: Optional[constr(max_length=256)] = None
        invitedCompanyRole: Literal["client_owner"] = Field(default="client_owner")
        note: Optional[constr(max_length=500)] = None
    class CompanyOption0(BaseModel):
        type: Literal["business"]
        legalName: constr(min_length=2, max_length=256)
        countryId: UUID
        reportingCurrencyId: UUID
        yearEndDay: confloat(ge=1, le=31)
        yearEndMonth: confloat(ge=1, le=12)
        accountingBasis: CompanyOption0AccountingBasisEnum
        displayName: Optional[constr(max_length=256)] = None
        website: Optional[constr(max_length=256)] = None
        revenue: Optional[constr(max_length=256)] = None
        teamSize: Optional[constr(max_length=256)] = None
        address: Optional[constr(max_length=512)] = None
        description: Optional[constr(max_length=2000)] = None
        registrationNumber: Optional[constr(max_length=256)] = None
        taxId: Optional[constr(max_length=256)] = None
        defaultTimezone: Optional[constr(pattern=DEFAULT_TIMEZONE_REGEX)] = None
        reportingFramework: CompanyOption0ReportingFrameworkEnum
        industry: constr(min_length=1, max_length=256)
    class CompanyOption1(BaseModel):
        type: Literal["individual"]
        legalName: constr(min_length=2, max_length=256)
        countryId: UUID
        reportingCurrencyId: UUID
        yearEndDay: confloat(ge=1, le=31)
        yearEndMonth: confloat(ge=1, le=12)
        accountingBasis: CompanyOption0AccountingBasisEnum
        displayName: Optional[constr(max_length=256)] = None
        website: Optional[constr(max_length=256)] = None
        revenue: Optional[constr(max_length=256)] = None
        teamSize: Optional[constr(max_length=256)] = None
        address: Optional[constr(max_length=512)] = None
        description: Optional[constr(max_length=2000)] = None
        registrationNumber: Optional[constr(max_length=256)] = None
        taxId: Optional[constr(max_length=256)] = None
        defaultTimezone: Optional[constr(pattern=DEFAULT_TIMEZONE_REGEX)] = None
        reportingFramework: Optional[CompanyOption0ReportingFrameworkEnum] = None
        industry: Optional[constr(max_length=256)] = None
    assigneeUserId: Optional[UUID] = None
    invite: Invite
    company: Union[CompanyOption0, CompanyOption1]