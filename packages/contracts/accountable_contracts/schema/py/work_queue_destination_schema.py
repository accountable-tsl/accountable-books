from pydantic import BaseModel
from typing import Any

class WorkQueueDestinationSchema(BaseModel):
    workspace: str
    filterMode: str
    filters: Any