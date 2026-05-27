from enum import Enum

class StatementLineTone(str, Enum):
    NORMAL = "normal"
    SUBTOTAL = "subtotal"
    TOTAL = "total"