from pydantic import BaseModel, constr
from typing import Any, Literal, Optional
from enum import Enum

class CodeEnum(str, Enum):
    INVALID_INPUT = "INVALID_INPUT"
    AI_DISABLED = "AI_DISABLED"
    CAPABILITY_NOT_ALLOWED = "CAPABILITY_NOT_ALLOWED"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    TOOL_ERROR = "TOOL_ERROR"
    UNKNOWN = "UNKNOWN"

class AiChatErrorEvent(BaseModel):
    type: Literal["error"]
    code: CodeEnum
    message: constr(min_length=1)
    details: Optional[Any] = None