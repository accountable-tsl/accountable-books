from pydantic import BaseModel, conint, constr
from typing import List, Literal, Optional, Union
from enum import Enum
from datetime import datetime
from uuid import UUID

class MembersItemOption0RoleEnum(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    ACCOUNTANT = "accountant"
    BOOKKEEPER = "bookkeeper"
    VIEWER = "viewer"

class MembersItemOption0RoleKeyEnum(str, Enum):
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

class TeamMembersListResponseSchema(BaseModel):
    class MembersItemOption0(BaseModel):
        name: constr(min_length=1, max_length=256)
        email: str
        role: MembersItemOption0RoleEnum
        roleKey: Optional[MembersItemOption0RoleKeyEnum] = None
        assignedClientsCount: conint(ge=0)
        lastActiveAt: Union[datetime, Literal[None]]
        inviteSentAt: Optional[Union[datetime, Literal[None]]] = None
        status: Literal["active"]
        membershipId: UUID
        userId: UUID
    class MembersItemOption1(BaseModel):
        name: constr(min_length=1, max_length=256)
        email: str
        role: MembersItemOption0RoleEnum
        roleKey: Optional[MembersItemOption0RoleKeyEnum] = None
        assignedClientsCount: conint(ge=0)
        lastActiveAt: Union[datetime, Literal[None]]
        inviteSentAt: Optional[Union[datetime, Literal[None]]] = None
        status: Literal["invited"]
        inviteId: UUID
        membershipId: Optional[UUID] = None
        userId: Optional[UUID] = None
    class Summary(BaseModel):
        total: conint(ge=0)
        active: conint(ge=0)
        invited: conint(ge=0)
        admins: conint(ge=0)
    companyId: constr(min_length=1, max_length=50)
    members: List[Union[MembersItemOption0, MembersItemOption1]]
    summary: Optional[Summary] = None