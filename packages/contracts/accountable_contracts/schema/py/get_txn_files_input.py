from pydantic import BaseModel
from typing import List, Optional
from enum import Enum

class DataItemSourceEnum(str, Enum):
    LEDGER = "ledger"
    JOURNAL = "journal"
    BANK = "bank"

class GetTxnFilesInput(BaseModel):
    class DataItem(BaseModel):
        source: DataItemSourceEnum
        key: Optional[str] = None
        transactionId: Optional[str] = None
        entryId: Optional[str] = None
    data: List[DataItem]
    companyId: str