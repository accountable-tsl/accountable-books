from enum import Enum

class FirmTaskActionabilityStateSchema(str, Enum):
    ACTIONABLE_NOW = "actionable_now"
    BLOCKED_BY_CLIENT = "blocked_by_client"
    BLOCKED_BY_DEPENDENCY = "blocked_by_dependency"
    INFORMATIONAL = "informational"