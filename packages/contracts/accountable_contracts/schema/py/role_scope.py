from enum import Enum

class RoleScope(str, Enum):
    PLATFORM = "platform"
    FIRM = "firm"
    COMPANY = "company"