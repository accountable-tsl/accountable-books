from pydantic import BaseModel, conint, constr
from typing import Any, Optional, Union
from enum import Enum
from datetime import datetime

class Option0ModeEnum(str, Enum):
    PAID = "paid"
    FREE_TIER = "free_tier"

class Option1ModeEnum(str, Enum):
    DISABLED = "disabled"
    NOT_APPLICABLE = "not_applicable"

class Option0(BaseModel):
    class Option0Usage(BaseModel):
        used: conint(ge=0)
        included: Optional[conint(ge=0)]
        remaining: Optional[conint(ge=0)]
        unitLabel: constr(min_length=1, max_length=64)
        periodStartAt: Optional[datetime] = None
        periodEndAt: Optional[datetime] = None
    mode: Option0ModeEnum
    usage: Option0Usage

class Option1(BaseModel):
    mode: Option1ModeEnum
    usage: Optional[Any] = None

type BillingAiSurfaceUsageSchema = Union[Option0, Option1]