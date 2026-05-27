from enum import Enum

class CategorizationTransactionStatus(str, Enum):
    UNCATEGORIZED = "uncategorized"
    PROPOSED = "proposed"
    POSTED = "posted"