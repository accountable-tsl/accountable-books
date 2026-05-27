from pydantic import BaseModel
from typing import Optional
from enum import Enum

class SourceEnum(str, Enum):
    AI = "ai"
    HUMAN = "human"
    AI_EDITED = "ai_edited"

class StatementNote(BaseModel):
    lineId: str
    body: str
    source: SourceEnum
    updatedAt: str
    updatedBy: Optional[str]