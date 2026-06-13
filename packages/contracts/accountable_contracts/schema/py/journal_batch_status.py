from enum import Enum

class JournalBatchStatus(str, Enum):
    DRAFT = "draft"
    POSTED = "posted"
    VOIDED = "voided"
    REVERSED = "reversed"