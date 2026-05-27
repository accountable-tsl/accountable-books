from enum import Enum

class JournalListRowKind(str, Enum):
    JOURNAL = "journal"
    RECURRING_TEMPLATE = "recurring_template"