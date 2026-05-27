from pydantic import BaseModel
from uuid import UUID

class FirmTaskAssigneeSchema(BaseModel):
    userId: UUID
    name: str
    initials: str