from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID

class AiChatThreadListResponse(BaseModel):
    class ItemsItem(BaseModel):
        id: UUID
        companyId: UUID
        userId: UUID
        firmId: Optional[UUID]
        title: Optional[str]
        isDeleted: bool
        lastMessageAt: Optional[str]
        createdAt: str
        updatedAt: str
    items: List[ItemsItem]
    nextCursor: Optional[str]