from pydantic import BaseModel, conint, constr
from typing import List, Optional
from enum import Enum

class MessagesItemRoleEnum(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"

class CapabilityIdEnum(str, Enum):
    JOURNALS_FROM_TEXT_V1 = "journals.from_text.v1"
    JOURNALS_GENERATE_MEMO_V1 = "journals.generate_memo.v1"
    JOURNALS_DEV_SAMPLE_V1 = "journals.dev_sample.v1"
    CATEGORIZATION_INTERPRET_COMMAND_V1 = "categorization.interpret_command.v1"
    CATEGORIZATION_CLEAN_DESCRIPTION_V1 = "categorization.clean_description.v1"
    CATEGORIZATION_EXPLAIN_V1 = "categorization.explain.v1"
    CATEGORIZATION_DEV_SAMPLE_V1 = "categorization.dev_sample.v1"

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
    capabilityId: CapabilityIdEnum
    domain: Optional[constr(min_length=1)] = None
    messages: List[MessagesItem]
    context: Optional[Context] = None