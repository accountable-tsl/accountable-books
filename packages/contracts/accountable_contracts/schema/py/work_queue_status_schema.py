from enum import Enum

class WorkQueueStatusSchema(str, Enum):
    OPEN = "open"
    CLOSED = "closed"