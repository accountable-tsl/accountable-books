from pydantic import BaseModel
from typing import Literal
from datetime import datetime
from uuid import UUID

class SettingsTeamInviteResponseSchema(BaseModel):
    invitationId: UUID
    status: Literal["pending"]
    expiresAt: datetime