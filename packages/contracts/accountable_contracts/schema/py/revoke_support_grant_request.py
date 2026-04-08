from pydantic import BaseModel, constr
from typing import Optional

class RevokeSupportGrantRequest(BaseModel):
    reason: Optional[constr(max_length=500)] = None