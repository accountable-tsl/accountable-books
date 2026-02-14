from pydantic import BaseModel, Field, constr
from typing import List, Optional
from enum import Enum
from uuid import UUID

class ModeEnum(str, Enum):
    PARTIAL = "partial"
    ALL_OR_NOTHING = "all_or_nothing"

class VoidDraftJournalsBatchBody(BaseModel):
    journalIds: List[UUID]
    voidReason: Optional[Optional[constr(min_length=1, max_length=2048)]] = None
    mode: ModeEnum = Field(default="partial")