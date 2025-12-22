from pydantic import BaseModel
from typing import Optional
from enum import Enum

class ScopeEnum(str, Enum):
    ENTRY = "entry"
    GROUP = "group"

class UpdateReferencePayload(BaseModel):
    scope: ScopeEnum
    entryId: Optional[str] = None
    reference: str