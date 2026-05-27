from pydantic import BaseModel, conint, constr
from typing import Optional
from enum import Enum

class RoleEnum(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"

class AiMessage(BaseModel):
    class Meta(BaseModel):
        domain: Optional[constr(min_length=1)] = None
        capabilityId: Optional[constr(min_length=1)] = None
        proposalId: Optional[constr(min_length=1)] = None
    id: Optional[constr(min_length=1)] = None
    role: RoleEnum
    text: constr(min_length=1, max_length=20000)
    timestamp: Optional[conint(ge=0)] = None
    meta: Optional[Meta] = None