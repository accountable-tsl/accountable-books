from pydantic import BaseModel, constr
from typing import Literal

class AiChatToolErrorEvent(BaseModel):
    type: Literal["tool.error"]
    toolCallId: constr(min_length=1)
    tool: constr(min_length=1)
    errorText: constr(min_length=1)