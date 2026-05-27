from pydantic import BaseModel, conint, constr
from typing import Literal, Optional

class AiAssistantMessage(BaseModel):
    class Meta(BaseModel):
        domain: Optional[constr(min_length=1)] = None
        capabilityId: Optional[constr(min_length=1)] = None
        proposalId: Optional[constr(min_length=1)] = None
    id: constr(min_length=1)
    role: Literal["assistant"]
    text: constr(min_length=1, max_length=20000)
    timestamp: conint(ge=0)
    meta: Optional[Meta] = None