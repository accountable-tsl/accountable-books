from pydantic import BaseModel, conint, constr
from typing import List, Optional
from enum import Enum

class MessagesItemRoleEnum(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"

class AiChatRequest(BaseModel):
    class MessagesItem(BaseModel):
        class MessagesItemMeta(BaseModel):
            domain: Optional[constr(min_length=1)] = None
            capabilityId: Optional[constr(min_length=1)] = None
            proposalId: Optional[constr(min_length=1)] = None
        id: Optional[constr(min_length=1)] = None
        role: MessagesItemRoleEnum
        text: constr(min_length=1, max_length=20000)
        timestamp: Optional[conint(ge=0)] = None
        meta: Optional[MessagesItemMeta] = None
    class Context(BaseModel):
        route: Optional[constr(min_length=1)] = None
        pageTitle: Optional[constr(min_length=1)] = None
    capabilityId: constr(min_length=1)
    domain: Optional[constr(min_length=1)] = None
    messages: List[MessagesItem]
    context: Optional[Context] = None