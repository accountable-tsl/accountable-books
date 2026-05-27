from pydantic import BaseModel
from typing import Optional

class JournalFileInput(BaseModel):
    name: str
    key: str
    type: str
    size: float
    url: Optional[str] = None