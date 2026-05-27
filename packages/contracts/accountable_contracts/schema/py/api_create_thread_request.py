from pydantic import BaseModel
from typing import Optional

class ApiCreateThreadRequest(BaseModel):
    title: Optional[str] = None