from pydantic import BaseModel, confloat
from typing import List
from enum import Enum
from uuid import UUID

class SourceTransactionTypeEnum(str, Enum):
    BANK_TRANSACTION = "bank_transaction"
    CATEGORIZATION_CANDIDATE = "categorization_candidate"
    LEDGER_TRANSACTION = "ledger_transaction"

class SplitTransactionPayload(BaseModel):
    class EntriesItem(BaseModel):
        entryId: UUID
        coaId: UUID
        description: str
        amount: confloat(gt=0)
    sourceTransactionId: UUID
    sourceTransactionType: SourceTransactionTypeEnum
    entries: List[EntriesItem]