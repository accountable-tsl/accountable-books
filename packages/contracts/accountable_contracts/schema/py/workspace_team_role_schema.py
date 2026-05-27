from enum import Enum

class WorkspaceTeamRoleSchema(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    ACCOUNTANT = "accountant"
    BOOKKEEPER = "bookkeeper"
    VIEWER = "viewer"