from enum import Enum

class TxnFileSource(str, Enum):
    LEDGER = "ledger"
    JOURNAL = "journal"
    BANK = "bank"