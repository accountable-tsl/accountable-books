from pydantic import BaseModel
from typing import Optional
from enum import Enum

class SourceEnum(str, Enum):
    LEDGER = "ledger"
    JOURNAL = "journal"
    BANK = "bank"

class TxnFileInput(BaseModel):
    source: SourceEnum
    key: Optional[str] = None
    transactionId: Optional[str] = None
    entryId: Optional[str] = None