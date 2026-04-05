from pydantic import BaseModel
from typing import Optional
from uuid import UUID

class FirmClientAssigneeSchema(BaseModel):
    userId: Optional[UUID] = None
    name: str
    initials: str