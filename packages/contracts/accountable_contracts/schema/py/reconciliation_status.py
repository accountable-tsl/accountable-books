from enum import Enum

class ReconciliationStatus(str, Enum):
    RECONCILED = "reconciled"
    PENDING = "pending"
    UNRECONCILED = "unreconciled"