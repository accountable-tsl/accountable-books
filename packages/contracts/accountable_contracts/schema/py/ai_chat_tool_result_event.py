from pydantic import BaseModel, constr
from typing import Any, Literal

class AiChatToolResultEvent(BaseModel):
    type: Literal["tool.result"]
    toolCallId: constr(min_length=1)
    tool: constr(min_length=1)
    output: Any