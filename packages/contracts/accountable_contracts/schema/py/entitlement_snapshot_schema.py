from pydantic import BaseModel, constr
from enum import Enum
from datetime import datetime

class SubjectTypeEnum(str, Enum):
    FIRM = "firm"
    BUSINESS = "business"
    INDIVIDUAL = "individual"
    WORKSPACE = "workspace"

class EntitlementSnapshotSchema(BaseModel):
    subjectType: SubjectTypeEnum
    subjectId: constr(min_length=1, max_length=128)
    planKey: constr(min_length=1, max_length=120)
    computedAt: datetime