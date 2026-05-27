from enum import Enum

class FirmTaskPrioritySchema(str, Enum):
    URGENT = "urgent"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"