from enum import Enum

class FiscalCalendarStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"
    LOCKED = "locked"