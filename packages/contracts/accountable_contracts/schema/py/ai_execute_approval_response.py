from pydantic import BaseModel, Field, conint, constr
from typing import Any, Optional
from enum import Enum

class ApprovalRiskEnum(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class ApprovalStatusEnum(str, Enum):
    PENDING = "pending"
    EXECUTED = "executed"
    REJECTED = "rejected"

class AiExecuteApprovalResponse(BaseModel):
    class Approval(BaseModel):
        id: constr(min_length=1)
        companyId: constr(min_length=1)
        requestedByUserId: constr(min_length=1)
        capabilityId: constr(min_length=1)
        domain: Optional[constr(min_length=1)] = None
        summary: constr(min_length=1)
        risk: ApprovalRiskEnum = Field(default="high")
        tool: constr(min_length=1)
        toolArgs: Any
        createdAt: conint(ge=0)
        decidedAt: Optional[conint(ge=0)] = None
        status: ApprovalStatusEnum
    approval: Approval
    result: Optional[Any] = None