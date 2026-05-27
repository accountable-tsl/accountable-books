from pydantic import BaseModel, constr
from typing import Optional
from enum import Enum
from datetime import datetime

TOTAL_AMOUNT_MINOR_REGEX = r"^\d+$"

class BillingAccountOwnerTypeEnum(str, Enum):
    FIRM = "firm"
    BUSINESS = "business"
    INDIVIDUAL = "individual"

class BillingAccountStatusEnum(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CLOSED = "closed"

class CurrentSubscriptionBillingIntervalEnum(str, Enum):
    MONTH = "month"
    YEAR = "year"

class CurrentSubscriptionStatusEnum(str, Enum):
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    SUSPENDED = "suspended"
    CANCEL_SCHEDULED = "cancel_scheduled"
    CANCELED = "canceled"
    PAYMENT_FAILED = "payment_failed"

class UpcomingInvoiceStatusEnum(str, Enum):
    DRAFT = "draft"
    OPEN = "open"
    PAID = "paid"
    PAST_DUE = "past_due"
    VOID = "void"
    UNCOLLECTIBLE = "uncollectible"

class BillingSettingsOverviewViewSchema(BaseModel):
    class BillingAccount(BaseModel):
        id: constr(min_length=1, max_length=128)
        ownerType: BillingAccountOwnerTypeEnum
        ownerCompanyId: constr(min_length=1, max_length=128)
        invoiceCurrencyCode: constr(min_length=3, max_length=3)
        status: BillingAccountStatusEnum
    class CurrentSubscription(BaseModel):
        id: constr(min_length=1, max_length=128)
        billingAccountId: constr(min_length=1, max_length=128)
        planKey: constr(min_length=1, max_length=120)
        billingInterval: CurrentSubscriptionBillingIntervalEnum
        status: CurrentSubscriptionStatusEnum
        currentPeriodStartAt: Optional[datetime]
        currentPeriodEndAt: Optional[datetime]
        trialEndsAt: Optional[Optional[datetime]] = None
    class UpcomingInvoice(BaseModel):
        id: constr(min_length=1, max_length=128)
        billingAccountId: constr(min_length=1, max_length=128)
        currencyCode: constr(min_length=3, max_length=3)
        status: UpcomingInvoiceStatusEnum
        totalAmountMinor: constr(pattern=TOTAL_AMOUNT_MINOR_REGEX)
        amountDueMinor: constr(pattern=TOTAL_AMOUNT_MINOR_REGEX)
        dueAt: Optional[datetime]
    billingAccount: BillingAccount
    currentSubscription: Optional[CurrentSubscription]
    upcomingInvoice: Optional[UpcomingInvoice]