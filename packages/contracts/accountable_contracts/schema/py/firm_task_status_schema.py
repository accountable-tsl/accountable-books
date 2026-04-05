from enum import Enum

class FirmTaskStatusSchema(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"