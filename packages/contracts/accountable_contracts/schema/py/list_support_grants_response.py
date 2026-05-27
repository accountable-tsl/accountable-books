from pydantic import BaseModel, constr
from typing import List, Literal, Union
from enum import Enum
from datetime import datetime
from uuid import UUID

class GrantsItemSupportUserRoleKeyEnum(str, Enum):
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

class GrantsItemSupportAccessLevelEnum(str, Enum):
    READ_ONLY = "read_only"
    COMPANY_PROFILE_WRITE = "company_profile_write"

class GrantsItemStatusEnum(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"

class ListSupportGrantsResponse(BaseModel):
    class GrantsItem(BaseModel):
        id: UUID
        companyId: constr(min_length=1, max_length=50)
        supportUserId: UUID
        supportUserEmail: str
        supportUserRoleKey: GrantsItemSupportUserRoleKeyEnum
        grantedByUserId: UUID
        supportAccessLevel: GrantsItemSupportAccessLevelEnum
        status: GrantsItemStatusEnum
        reason: str
        expiresAt: datetime
        createdAt: datetime
        updatedAt: datetime
        revokedAt: Union[datetime, Literal[None]]
        revokedByUserId: Union[UUID, Literal[None]]
        revokeReason: Union[str, Literal[None]]
    grants: List[GrantsItem]