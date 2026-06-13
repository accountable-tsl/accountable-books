from pydantic import BaseModel, constr
from typing import Optional
from enum import Enum
from uuid import UUID

class SideEnum(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"

class JournalEntryInput(BaseModel):
    description: Optional[Optional[constr(max_length=512)]] = None
    side: SideEnum
    amount: float
    coaId: UUID
    projectId: Optional[Optional[UUID]] = None