from pydantic import BaseModel, constr
from typing import Optional

class VoidJournalBody(BaseModel):
    voidReason: Optional[constr(max_length=2048)] = None