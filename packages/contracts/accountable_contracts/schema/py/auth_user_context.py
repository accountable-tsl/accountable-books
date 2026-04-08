from pydantic import BaseModel, constr
from typing import Any, List, Literal, Optional, Union
from enum import Enum
from uuid import UUID

class CurrentCompanyOnboardingStepsItemKeyEnum(str, Enum):
    EMAIL_VERIFIED = "email_verified"
    COMPANY_DETAILS_CONFIRMED = "company_details_confirmed"
    FIRST_BANK_ACCOUNT_ADDED = "first_bank_account_added"

class CurrentCompanyOnboardingStepsItemScopeEnum(str, Enum):
    USER = "user"
    COMPANY = "company"

class CurrentCompanyCompanyTypeEnum(str, Enum):
    BUSINESS = "business"
    INDIVIDUAL = "individual"
    ACCOUNTING_FIRM = "accounting_firm"

class CurrentCompanyRoleKeyOption0Enum(str, Enum):
    SUPER_ADMIN = "super_admin"
    SYSTEM_USER = "system_user"
    SUPPORT_ADMIN = "support_admin"
    SUPPORT_AGENT = "support_agent"
    ADMIN = "admin"
    MANAGER = "manager"
    STAFF = "staff"
    CLIENT_OWNER = "client_owner"
    CLIENT_ADMIN = "client_admin"
    CLIENT_USER = "client_user"

class CurrentCompanyRoleScopeOption0Enum(str, Enum):
    PLATFORM = "platform"
    FIRM = "firm"
    COMPANY = "company"

class CurrentCompanyAccessOriginEnum(str, Enum):
    EXPLICIT_COMPANY = "explicit_company"
    EXPLICIT_FIRM = "explicit_firm"
    DEMO = "demo"
    PLATFORM_INTERNAL = "platform_internal"
    SUPPORT_GRANT = "support_grant"
    BREAK_GLASS = "break_glass"

class CurrentCompanySupportAccessLevelOption0Enum(str, Enum):
    READ_ONLY = "read_only"
    COMPANY_PROFILE_WRITE = "company_profile_write"

class AuthUserContext(BaseModel):
    class CurrentCompany(BaseModel):
        class CurrentCompanyOnboardingState(BaseModel):
            class CurrentCompanyOnboardingStateSteps(BaseModel):
                company_details_confirmed: Optional[Optional[bool]] = None
                first_bank_account_added: Optional[Optional[bool]] = None
            class CurrentCompanyOnboardingStateCompletedAt(BaseModel):
                company_details_confirmed: Any
                first_bank_account_added: Any
            steps: CurrentCompanyOnboardingStateSteps
            completed_at: Optional[CurrentCompanyOnboardingStateCompletedAt] = None
            metadata: Optional[Optional[Literal[None]]] = None
        class CurrentCompanyOnboarding(BaseModel):
            class CurrentCompanyOnboardingStepsItem(BaseModel):
                key: CurrentCompanyOnboardingStepsItemKeyEnum
                label: str
                complete: bool
                blocked: bool
                optional: bool
                scope: CurrentCompanyOnboardingStepsItemScopeEnum
                orderIndex: Optional[float] = None
            isCompanyOwner: bool
            canAccessApp: bool
            userStepsComplete: bool
            nextStepToComplete: Union[CurrentCompanyOnboardingStepsItemKeyEnum, Literal[None]]
            steps: List[CurrentCompanyOnboardingStepsItem]
        id: constr(max_length=50)
        legalName: str
        displayName: Optional[str]
        assignedFirmSlug: str
        companyType: CurrentCompanyCompanyTypeEnum
        hasExplicitAccess: bool
        roleKey: Union[CurrentCompanyRoleKeyOption0Enum, Literal[None]]
        roleScope: Union[CurrentCompanyRoleScopeOption0Enum, Literal[None]]
        isDemoCompany: bool
        isPlatformCompany: bool
        onboardingState: Optional[Optional[CurrentCompanyOnboardingState]] = None
        accessOrigin: CurrentCompanyAccessOriginEnum
        supportAccessLevel: Union[CurrentCompanySupportAccessLevelOption0Enum, Literal[None]]
        supportGrantId: Union[UUID, Literal[None]]
        breakGlassSessionId: Union[UUID, Literal[None]]
        onboarding: CurrentCompanyOnboarding
    class CompaniesItem(BaseModel):
        class CompaniesItemOnboardingState(BaseModel):
            class CompaniesItemOnboardingStateSteps(BaseModel):
                company_details_confirmed: Optional[Optional[bool]] = None
                first_bank_account_added: Optional[Optional[bool]] = None
            class CompaniesItemOnboardingStateCompletedAt(BaseModel):
                company_details_confirmed: Any
                first_bank_account_added: Any
            steps: CompaniesItemOnboardingStateSteps
            completed_at: Optional[CompaniesItemOnboardingStateCompletedAt] = None
            metadata: Optional[Optional[Literal[None]]] = None
        id: constr(max_length=50)
        legalName: str
        displayName: Optional[str]
        assignedFirmSlug: str
        companyType: CurrentCompanyCompanyTypeEnum
        hasExplicitAccess: bool
        roleKey: Union[CurrentCompanyRoleKeyOption0Enum, Literal[None]]
        roleScope: Union[CurrentCompanyRoleScopeOption0Enum, Literal[None]]
        isDemoCompany: bool
        isPlatformCompany: bool
        onboardingState: Optional[Optional[CompaniesItemOnboardingState]] = None
        accessOrigin: CurrentCompanyAccessOriginEnum
        supportAccessLevel: Union[CurrentCompanySupportAccessLevelOption0Enum, Literal[None]]
        supportGrantId: Union[UUID, Literal[None]]
        breakGlassSessionId: Union[UUID, Literal[None]]
    id: UUID
    email: str
    firstname: str
    lastname: Optional[str] = None
    isPlatformUser: Optional[bool] = None
    platformUserKey: Optional[CurrentCompanyRoleKeyOption0Enum] = None
    currentCompanyId: constr(max_length=50)
    currentCompany: CurrentCompany
    companies: List[CompaniesItem]