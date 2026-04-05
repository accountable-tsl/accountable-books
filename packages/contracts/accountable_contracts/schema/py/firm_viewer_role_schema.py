from enum import Enum

class FirmViewerRoleSchema(str, Enum):
    STAFF = "staff"
    MANAGER = "manager"
    ADMIN = "admin"