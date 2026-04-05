from pydantic import BaseModel
from typing import List, Optional
from enum import Enum
from datetime import datetime
from uuid import UUID

class MembersItemRoleKeyEnum(str, Enum):
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

class MembersItemRoleScopeEnum(str, Enum):
    PLATFORM = "platform"
    FIRM = "firm"
    COMPANY = "company"

class PendingInvitesItemRoleKeyEnum(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    STAFF = "staff"
    CLIENT_OWNER = "client_owner"
    CLIENT_ADMIN = "client_admin"
    CLIENT_USER = "client_user"

class PendingInvitesItemStatusEnum(str, Enum):
    PENDING = "pending"

class SettingsTeamSnapshotSchema(BaseModel):
    class MembersItem(BaseModel):
        userId: UUID
        email: str
        firstname: Optional[str] = None
        lastname: Optional[str] = None
        roleKey: MembersItemRoleKeyEnum
        roleScope: MembersItemRoleScopeEnum
    class PendingInvitesItem(BaseModel):
        id: UUID
        email: str
        roleKey: PendingInvitesItemRoleKeyEnum
        status: PendingInvitesItemStatusEnum
        expiresAt: datetime
        invitedAt: Optional[datetime] = None
    members: List[MembersItem]
    pendingInvites: List[PendingInvitesItem]