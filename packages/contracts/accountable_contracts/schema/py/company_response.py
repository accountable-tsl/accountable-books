from pydantic import BaseModel, confloat, constr
from typing import Any, Literal, Optional
from enum import Enum
from uuid import UUID

class CompanyTypeEnum(str, Enum):
    BUSINESS = "business"
    INDIVIDUAL = "individual"
    ACCOUNTING_FIRM = "accounting_firm"

class WorkspaceClassEnum(str, Enum):
    CUSTOMER = "customer"
    DEMO = "demo"
    PLATFORM = "platform"
    PARTNER = "partner"

class ReportingFrameworkEnum(str, Enum):
    IFRS = "ifrs"
    US_GAAP = "us_gaap"

class AccountingBasisEnum(str, Enum):
    MODIFIED_CASH_BASIS = "modified_cash_basis"
    MODIFIED_ACCRUAL_BASIS = "modified_accrual_basis"

class CompanyResponse(BaseModel):
    class Verification(BaseModel):
        class VerificationLegalName(BaseModel):
            verifiedAt: Any
        class VerificationAddress(BaseModel):
            verifiedAt: Any
        class VerificationRegistrationNumber(BaseModel):
            verifiedAt: Any
        class VerificationTaxId(BaseModel):
            verifiedAt: Any
        legalName: VerificationLegalName
        address: VerificationAddress
        registrationNumber: VerificationRegistrationNumber
        taxId: VerificationTaxId
    class OnboardingState(BaseModel):
        class OnboardingStateSteps(BaseModel):
            company_details_confirmed: Optional[Optional[bool]] = None
            first_bank_account_added: Optional[Optional[bool]] = None
        class OnboardingStateCompletedAt(BaseModel):
            company_details_confirmed: Any
            first_bank_account_added: Any
        steps: OnboardingStateSteps
        completed_at: Optional[OnboardingStateCompletedAt] = None
        metadata: Optional[Optional[Literal[None]]] = None
    id: constr(max_length=50)
    legalName: str
    companyType: CompanyTypeEnum
    workspaceClass: WorkspaceClassEnum
    yearEndDay: confloat(ge=1, le=31)
    yearEndMonth: confloat(ge=1, le=12)
    countryId: UUID
    reportingCurrencyId: UUID
    createdById: UUID
    createdAt: Any
    defaultTimezone: str
    verification: Verification
    displayName: Optional[str]
    address: Optional[str]
    companyLogo: Optional[str]
    companyLogoKey: Optional[str]
    description: Optional[str]
    website: Optional[str]
    industry: Optional[str]
    companySize: Optional[str]
    revenue: Optional[str]
    companyRegistrationNumber: Optional[str]
    companyTaxId: Optional[str]
    isPlatform: bool
    countryCode: Optional[str]
    countryName: Optional[str]
    countryPhoneCode: Optional[str]
    countryFlag: Optional[str]
    countryContinent: Optional[str]
    reportingFramework: Optional[ReportingFrameworkEnum]
    accountingBasis: AccountingBasisEnum
    onboardingState: Optional[Optional[OnboardingState]] = None
    isDemoCompany: bool
    reportingCurrencyCode: str
    reportingCurrencyName: str
    reportingCurrencySymbol: Optional[str]
    assignedFirmId: Optional[UUID]
    assignedFirmName: Optional[str]
    assignedFirmSlug: Optional[str]
    assignedFirmIsPlatform: Optional[bool]
    assignedFirmLogo: Optional[str]