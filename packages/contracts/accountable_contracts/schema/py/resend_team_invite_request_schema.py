from pydantic import BaseModel
from uuid import UUID

class ResendTeamInviteRequestSchema(BaseModel):
    inviteId: UUID