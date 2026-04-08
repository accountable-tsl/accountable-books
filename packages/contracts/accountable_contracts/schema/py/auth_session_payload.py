from pydantic import BaseModel, constr
from typing import Any, List, Literal, Optional, Union
from enum import Enum
from uuid import UUID

class UserCurrentCompanyOnboardingStepsItemKeyEnum(str, Enum):
    EMAIL_VERIFIED = "email_verified"
    COMPANY_DETAILS_CONFIRMED = "company_details_confirmed"
    FIRST_BANK_ACCOUNT_ADDED = "first_bank_account_added"

class UserCurrentCompanyOnboardingStepsItemScopeEnum(str, Enum):
    USER = "user"
    COMPANY = "company"

class UserCurrentCompanyCompanyTypeEnum(str, Enum):
    BUSINESS = "business"
    INDIVIDUAL = "individual"
    ACCOUNTING_FIRM = "accounting_firm"

class UserCurrentCompanyRoleKeyOption0Enum(str, Enum):
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

class UserCurrentCompanyRoleScopeOption0Enum(str, Enum):
    PLATFORM = "platform"
    FIRM = "firm"
    COMPANY = "company"

class UserCurrentCompanyAccessOriginEnum(str, Enum):
    EXPLICIT_COMPANY = "explicit_company"
    EXPLICIT_FIRM = "explicit_firm"
    DEMO = "demo"
    PLATFORM_INTERNAL = "platform_internal"
    SUPPORT_GRANT = "support_grant"
    BREAK_GLASS = "break_glass"

class UserCurrentCompanySupportAccessLevelOption0Enum(str, Enum):
    READ_ONLY = "read_only"
    COMPANY_PROFILE_WRITE = "company_profile_write"

class AuthSessionPayload(BaseModel):
    class User(BaseModel):
        class UserCurrentCompany(BaseModel):
            class UserCurrentCompanyOnboardingState(BaseModel):
                class UserCurrentCompanyOnboardingStateSteps(BaseModel):
                    company_details_confirmed: Optional[Optional[bool]] = None
                    first_bank_account_added: Optional[Optional[bool]] = None
                class UserCurrentCompanyOnboardingStateCompletedAt(BaseModel):
                    company_details_confirmed: Any
                    first_bank_account_added: Any
                steps: UserCurrentCompanyOnboardingStateSteps
                completed_at: Optional[UserCurrentCompanyOnboardingStateCompletedAt] = None
                metadata: Optional[Optional[Literal[None]]] = None
            class UserCurrentCompanyOnboarding(BaseModel):
                class UserCurrentCompanyOnboardingStepsItem(BaseModel):
                    key: UserCurrentCompanyOnboardingStepsItemKeyEnum
                    label: str
                    complete: bool
                    blocked: bool
                    optional: bool
                    scope: UserCurrentCompanyOnboardingStepsItemScopeEnum
                    orderIndex: Optional[float] = None
                isCompanyOwner: bool
                canAccessApp: bool
                userStepsComplete: bool
                nextStepToComplete: Union[UserCurrentCompanyOnboardingStepsItemKeyEnum, Literal[None]]
                steps: List[UserCurrentCompanyOnboardingStepsItem]
            id: constr(max_length=50)
            legalName: str
            displayName: Optional[str]
            assignedFirmSlug: str
            companyType: UserCurrentCompanyCompanyTypeEnum
            hasExplicitAccess: bool
            roleKey: Union[UserCurrentCompanyRoleKeyOption0Enum, Literal[None]]
            roleScope: Union[UserCurrentCompanyRoleScopeOption0Enum, Literal[None]]
            isDemoCompany: bool
            isPlatformCompany: bool
            onboardingState: Optional[Optional[UserCurrentCompanyOnboardingState]] = None
            accessOrigin: UserCurrentCompanyAccessOriginEnum
            supportAccessLevel: Union[UserCurrentCompanySupportAccessLevelOption0Enum, Literal[None]]
            supportGrantId: Union[UUID, Literal[None]]
            breakGlassSessionId: Union[UUID, Literal[None]]
            onboarding: UserCurrentCompanyOnboarding
        class UserCompaniesItem(BaseModel):
            class UserCompaniesItemOnboardingState(BaseModel):
                class UserCompaniesItemOnboardingStateSteps(BaseModel):
                    company_details_confirmed: Optional[Optional[bool]] = None
                    first_bank_account_added: Optional[Optional[bool]] = None
                class UserCompaniesItemOnboardingStateCompletedAt(BaseModel):
                    company_details_confirmed: Any
                    first_bank_account_added: Any
                steps: UserCompaniesItemOnboardingStateSteps
                completed_at: Optional[UserCompaniesItemOnboardingStateCompletedAt] = None
                metadata: Optional[Optional[Literal[None]]] = None
            id: constr(max_length=50)
            legalName: str
            displayName: Optional[str]
            assignedFirmSlug: str
            companyType: UserCurrentCompanyCompanyTypeEnum
            hasExplicitAccess: bool
            roleKey: Union[UserCurrentCompanyRoleKeyOption0Enum, Literal[None]]
            roleScope: Union[UserCurrentCompanyRoleScopeOption0Enum, Literal[None]]
            isDemoCompany: bool
            isPlatformCompany: bool
            onboardingState: Optional[Optional[UserCompaniesItemOnboardingState]] = None
            accessOrigin: UserCurrentCompanyAccessOriginEnum
            supportAccessLevel: Union[UserCurrentCompanySupportAccessLevelOption0Enum, Literal[None]]
            supportGrantId: Union[UUID, Literal[None]]
            breakGlassSessionId: Union[UUID, Literal[None]]
        id: UUID
        email: str
        firstname: str
        lastname: Optional[str] = None
        isPlatformUser: Optional[bool] = None
        platformUserKey: Optional[UserCurrentCompanyRoleKeyOption0Enum] = None
        currentCompanyId: constr(max_length=50)
        currentCompany: UserCurrentCompany
        companies: List[UserCompaniesItem]
    user: User
    csrfToken: str