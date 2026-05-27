from pydantic import BaseModel, constr
from typing import Literal, Union
from enum import Enum
from datetime import datetime
from uuid import UUID

class StatusEnum(str, Enum):
    ACTIVE = "active"
    CLOSED = "closed"
    EXPIRED = "expired"

class BreakGlassSessionResponse(BaseModel):
    id: UUID
    companyId: constr(min_length=1, max_length=50)
    superAdminUserId: UUID
    supportAccessLevel: Literal["company_profile_write"]
    status: StatusEnum
    reason: str
    expiresAt: datetime
    createdAt: datetime
    updatedAt: datetime
    closedAt: Union[datetime, Literal[None]]
    closedByUserId: Union[UUID, Literal[None]]
    closeReason: Union[str, Literal[None]]