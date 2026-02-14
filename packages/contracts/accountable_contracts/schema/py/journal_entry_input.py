from pydantic import BaseModel
from typing import Optional
from enum import Enum
from uuid import UUID

class SideEnum(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"

class JournalEntryInput(BaseModel):
    description: str
    side: SideEnum
    amount: float
    coaId: UUID
    projectId: Optional[Optional[UUID]] = None