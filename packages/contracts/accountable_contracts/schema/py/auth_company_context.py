from pydantic import BaseModel, constr
from typing import Any, Literal, Optional, Union
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

class RoleKeyOption0Enum(str, Enum):
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

class RoleScopeOption0Enum(str, Enum):
    PLATFORM = "platform"
    FIRM = "firm"
    COMPANY = "company"

class AccessOriginEnum(str, Enum):
    EXPLICIT_COMPANY = "explicit_company"
    EXPLICIT_FIRM = "explicit_firm"
    DEMO = "demo"
    PLATFORM_INTERNAL = "platform_internal"
    SUPPORT_GRANT = "support_grant"
    BREAK_GLASS = "break_glass"

class SupportAccessLevelOption0Enum(str, Enum):
    READ_ONLY = "read_only"
    COMPANY_PROFILE_WRITE = "company_profile_write"

class AuthCompanyContext(BaseModel):
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
    displayName: Optional[str]
    assignedFirmSlug: str
    companyType: CompanyTypeEnum
    workspaceClass: WorkspaceClassEnum
    hasExplicitAccess: bool
    roleKey: Union[RoleKeyOption0Enum, Literal[None]]
    roleScope: Union[RoleScopeOption0Enum, Literal[None]]
    isDemoCompany: bool
    isPlatformCompany: bool
    onboardingState: Optional[Optional[OnboardingState]] = None
    accessOrigin: AccessOriginEnum
    supportAccessLevel: Union[SupportAccessLevelOption0Enum, Literal[None]]
    supportGrantId: Union[UUID, Literal[None]]
    breakGlassSessionId: Union[UUID, Literal[None]]