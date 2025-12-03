from pydantic import BaseModel, confloat
from typing import Any, Optional
from uuid import UUID

class AccrualRecommendation(BaseModel):
    account_id: UUID
    account_label: str
    score: confloat(ge=0, le=1)
    reasoning: str
    method: str
    metadata: Optional[Any] = None