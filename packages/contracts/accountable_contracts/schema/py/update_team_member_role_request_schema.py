from pydantic import BaseModel
from enum import Enum
from uuid import UUID

class RoleEnum(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    ACCOUNTANT = "accountant"
    BOOKKEEPER = "bookkeeper"
    VIEWER = "viewer"

class UpdateTeamMemberRoleRequestSchema(BaseModel):
    membershipId: UUID
    role: RoleEnum