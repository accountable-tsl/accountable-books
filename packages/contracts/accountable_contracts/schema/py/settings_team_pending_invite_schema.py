from pydantic import BaseModel
from typing import Optional
from enum import Enum
from datetime import datetime
from uuid import UUID

class RoleKeyEnum(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    STAFF = "staff"
    CLIENT_OWNER = "client_owner"
    CLIENT_ADMIN = "client_admin"
    CLIENT_USER = "client_user"

class StatusEnum(str, Enum):
    PENDING = "pending"

class SettingsTeamPendingInviteSchema(BaseModel):
    id: UUID
    email: str
    roleKey: RoleKeyEnum
    status: StatusEnum
    expiresAt: datetime
    invitedAt: Optional[datetime] = None