from pydantic import BaseModel
from typing import Optional
from enum import Enum
from uuid import UUID

class RoleKeyEnum(str, Enum):
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

class RoleScopeEnum(str, Enum):
    PLATFORM = "platform"
    FIRM = "firm"
    COMPANY = "company"

class SettingsTeamMemberSchema(BaseModel):
    userId: UUID
    email: str
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    roleKey: RoleKeyEnum
    roleScope: RoleScopeEnum