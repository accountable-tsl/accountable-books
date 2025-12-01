from pydantic import BaseModel
from uuid import UUID

class FinalPostingSchema(BaseModel):
    account_id: UUID
    account_label: str