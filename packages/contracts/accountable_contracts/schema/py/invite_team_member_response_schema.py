from pydantic import BaseModel
from typing import Literal, Union
from datetime import datetime
from uuid import UUID

class Option0(BaseModel):
    status: Literal["sent"]
    inviteId: UUID
    email: str
    createdAt: datetime

class Option1(BaseModel):
    status: Literal["already_member"]
    email: str
    createdAt: datetime
    membershipId: UUID
    userId: UUID

type InviteTeamMemberResponseSchema = Union[Option0, Option1]