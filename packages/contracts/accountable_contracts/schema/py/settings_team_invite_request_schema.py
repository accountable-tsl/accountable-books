from pydantic import BaseModel, constr
from enum import Enum

class RoleKeyEnum(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    STAFF = "staff"
    CLIENT_OWNER = "client_owner"
    CLIENT_ADMIN = "client_admin"
    CLIENT_USER = "client_user"

class SettingsTeamInviteRequestSchema(BaseModel):
    email: constr(min_length=1)
    roleKey: RoleKeyEnum