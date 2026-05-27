from enum import Enum

class TeamMemberStatusSchema(str, Enum):
    ACTIVE = "active"
    INVITED = "invited"