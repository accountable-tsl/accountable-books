from pydantic import BaseModel, conint, constr
from typing import Optional
from enum import Enum
from uuid import UUID

class StatusEnum(str, Enum):
    HEALTHY = "healthy"
    OVERDUE = "overdue"
    NEED_ATTENTION = "need_attention"
    NEW = "new"

class FirmClientSummarySchema(BaseModel):
    class Assignee(BaseModel):
        userId: Optional[UUID] = None
        name: str
        initials: str
    class TransactionStats(BaseModel):
        today: conint(ge=0)
        week: conint(ge=0)
        month: conint(ge=0)
        todayPrev: conint(ge=0)
        weekPrev: conint(ge=0)
        monthPrev: conint(ge=0)
    id: UUID
    name: str
    shortCode: Optional[Optional[constr(max_length=32)]] = None
    industry: Optional[str] = None
    openTaskCount: conint(ge=0)
    lastActivityLabel: str
    status: StatusEnum
    assignee: Optional[Assignee] = None
    transactionStats: Optional[TransactionStats] = None