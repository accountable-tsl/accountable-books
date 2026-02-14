from pydantic import BaseModel, confloat, constr
from typing import Any, List, Optional
from enum import Enum
from uuid import UUID

class EntriesItemSideEnum(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"

class StatusEnum(str, Enum):
    DRAFT = "draft"
    POSTED = "posted"

class JournalBatchInput(BaseModel):
    class EntriesItem(BaseModel):
        description: str
        side: EntriesItemSideEnum
        amount: float
        coaId: UUID
        projectId: Optional[Optional[UUID]] = None
    class FilesItem(BaseModel):
        name: str
        key: str
        type: str
        size: float
        url: Optional[str] = None
    id: Optional[UUID] = None
    reference: Optional[Optional[str]] = None
    date: str
    title: constr(min_length=1, max_length=512)
    description: Optional[constr(max_length=2048)] = None
    contactId: Optional[Optional[UUID]] = None
    currencyId: Optional[Optional[UUID]] = None
    exchangeRate: Optional[Optional[confloat(gt=0)]] = None
    status: Optional[StatusEnum] = None
    autoReversalDate: Optional[Optional[str]] = None
    note: Optional[Optional[constr(max_length=2048)]] = None
    metadata: Optional[Any] = None
    entries: List[EntriesItem]
    files: Optional[List[FilesItem]] = None