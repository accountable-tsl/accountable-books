from pydantic import BaseModel, confloat, constr
from typing import Any, Optional
from enum import Enum
from uuid import UUID

class CompanyTypeEnum(str, Enum):
    BUSINESS = "business"
    INDIVIDUAL = "individual"
    ACCOUNTING_FIRM = "accounting_firm"

class ReportingFrameworkEnum(str, Enum):
    IFRS = "ifrs"
    US_GAAP = "us_gaap"

class AccountingBasisEnum(str, Enum):
    MODIFIED_CASH_BASIS = "modified_cash_basis"
    MODIFIED_ACCRUAL_BASIS = "modified_accrual_basis"

class FirmTypeEnum(str, Enum):
    FREELANCER = "freelancer"
    CA_CPA = "ca_cpa"
    TAX_PREPARER = "tax_preparer"
    INTERNATIONAL = "international"

class UpdateCompanyPayload(BaseModel):
    legalName: Optional[constr(min_length=2, max_length=256)] = None
    companyType: Optional[CompanyTypeEnum] = None
    yearEndDay: Optional[confloat(ge=1, le=31)] = None
    yearEndMonth: Optional[confloat(ge=1, le=12)] = None
    countryId: Optional[UUID] = None
    displayName: Optional[Any] = None
    address: Optional[Any] = None
    addressLine1: Optional[Any] = None
    addressLine2: Optional[Any] = None
    city: Optional[Any] = None
    stateRegion: Optional[Any] = None
    postalCode: Optional[Any] = None
    description: Optional[Any] = None
    website: Optional[Any] = None
    industry: Optional[Any] = None
    companySize: Optional[Any] = None
    revenue: Optional[Any] = None
    companyRegistrationNumber: Optional[Any] = None
    companyTaxId: Optional[Any] = None
    reportingFramework: Optional[Optional[ReportingFrameworkEnum]] = None
    accountingBasis: Optional[AccountingBasisEnum] = None
    assignedFirmId: Any
    defaultTimezone: Any
    slug: Any
    firmType: Optional[FirmTypeEnum] = None