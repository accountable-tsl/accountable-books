from pydantic import BaseModel
from typing import Optional
from uuid import UUID

class AiChatThread(BaseModel):
    id: UUID
    companyId: UUID
    userId: UUID
    firmId: Optional[UUID]
    title: Optional[str]
    isDeleted: bool
    lastMessageAt: Optional[str]
    createdAt: str
    updatedAt: str