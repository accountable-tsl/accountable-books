from pydantic import BaseModel, constr
from typing import Optional
from enum import Enum
from datetime import datetime

class BillingIntervalEnum(str, Enum):
    MONTH = "month"
    YEAR = "year"

class StatusEnum(str, Enum):
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    SUSPENDED = "suspended"
    CANCEL_SCHEDULED = "cancel_scheduled"
    CANCELED = "canceled"
    PAYMENT_FAILED = "payment_failed"

class BillingSubscriptionSummarySchema(BaseModel):
    id: constr(min_length=1, max_length=128)
    billingAccountId: constr(min_length=1, max_length=128)
    planKey: constr(min_length=1, max_length=120)
    billingInterval: BillingIntervalEnum
    status: StatusEnum
    currentPeriodStartAt: Optional[datetime]
    currentPeriodEndAt: Optional[datetime]
    trialEndsAt: Optional[Optional[datetime]] = None