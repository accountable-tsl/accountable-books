from pydantic import BaseModel, constr
from typing import Any, List, Optional
from enum import Enum

class CapabilityIdEnum(str, Enum):
    JOURNALS_FROM_TEXT_V1 = "journals.from_text.v1"
    JOURNALS_GENERATE_MEMO_V1 = "journals.generate_memo.v1"
    JOURNALS_DEV_SAMPLE_V1 = "journals.dev_sample.v1"
    CATEGORIZATION_INTERPRET_COMMAND_V1 = "categorization.interpret_command.v1"
    CATEGORIZATION_CLEAN_DESCRIPTION_V1 = "categorization.clean_description.v1"
    CATEGORIZATION_EXPLAIN_V1 = "categorization.explain.v1"
    CATEGORIZATION_DEV_SAMPLE_V1 = "categorization.dev_sample.v1"

class ApiChatRequest(BaseModel):
    class Context(BaseModel):
        route: Optional[constr(min_length=1)] = None
        pageTitle: Optional[constr(min_length=1)] = None
    capabilityId: CapabilityIdEnum
    domain: Optional[constr(min_length=1)] = None
    messages: List[Any]
    context: Optional[Context] = None