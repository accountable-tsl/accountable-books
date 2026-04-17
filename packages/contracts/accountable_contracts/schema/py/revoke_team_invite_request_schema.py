from pydantic import BaseModel
from uuid import UUID

class RevokeTeamInviteRequestSchema(BaseModel):
    inviteId: UUID