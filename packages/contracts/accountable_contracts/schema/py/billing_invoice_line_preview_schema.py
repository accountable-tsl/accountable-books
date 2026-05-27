from pydantic import BaseModel, confloat, constr
from typing import Any, Optional
from enum import Enum

class LineTypeEnum(str, Enum):
    FIRM_SUBSCRIPTION = "firm_subscription"
    FIRM_USAGE = "firm_usage"
    CLIENT_PLAN_GROUP = "client_plan_group"
    CLIENT_USAGE_GROUP = "client_usage_group"

class BillingInvoiceLinePreviewSchema(BaseModel):
    lineType: LineTypeEnum
    label: constr(min_length=1, max_length=160)
    amount: float
    currencyCode: constr(min_length=3, max_length=3)
    currencySymbol: Optional[Optional[constr(min_length=1, max_length=8)]] = None
    quantity: Optional[confloat(ge=0)] = None
    unitAmount: Optional[float] = None
    meta: Optional[Any] = None