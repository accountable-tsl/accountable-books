from pydantic import BaseModel
from typing import Optional

class DetailAttachment(BaseModel):
    id: str
    name: str
    url: Optional[str] = None