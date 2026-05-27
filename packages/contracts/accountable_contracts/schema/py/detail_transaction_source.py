from enum import Enum

class DetailTransactionSource(str, Enum):
    BANK = "bank"
    JOURNAL = "journal"