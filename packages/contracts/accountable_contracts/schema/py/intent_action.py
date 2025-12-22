from enum import Enum

class IntentAction(str, Enum):
    APPROVE_ONLY = "approve_only"
    APPLY_AND_APPROVE = "apply_and_approve"