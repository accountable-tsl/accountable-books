from enum import Enum

class RoleKey(str, Enum):
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