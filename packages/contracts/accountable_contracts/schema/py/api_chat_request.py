from pydantic import BaseModel, constr
from typing import Any, List, Optional

class ApiChatRequest(BaseModel):
    class Context(BaseModel):
        route: Optional[constr(min_length=1)] = None
        pageTitle: Optional[constr(min_length=1)] = None
    capabilityId: constr(min_length=1)
    domain: Optional[constr(min_length=1)] = None
    messages: List[Any]
    context: Optional[Context] = None