from pydantic import BaseModel, constr
from typing import List, Optional
from enum import Enum
from uuid import UUID

class RoleEnum(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    ACCOUNTANT = "accountant"
    BOOKKEEPER = "bookkeeper"
    VIEWER = "viewer"

class InviteTeamMemberRequestSchema(BaseModel):
    email: constr(min_length=1)
    role: RoleEnum
    note: Optional[constr(max_length=500)] = None
    assignedClientCompanyIds: Optional[List[UUID]] = None