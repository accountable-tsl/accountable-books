from pydantic import BaseModel, confloat, constr
from typing import Any, List, Optional
from enum import Enum
from datetime import datetime
from uuid import UUID

FS_DATE_REGEX = r"^\d{4}-\d{2}-\d{2}$"

class DesiredStateEntriesItemContactTypeEnum(str, Enum):
    CUSTOMER = "customer"
    VENDOR = "vendor"
    EMPLOYEE = "employee"
    CONTRACTOR = "contractor"
    DIRECTOR = "director"
    OWNER = "owner"
    GOVERNMENT = "government"
    INTERNAL = "internal"
    BANKER = "banker"
    OTHER = "other"

class LedgerPostingIntentSchema(BaseModel):
    class DesiredState(BaseModel):
        class DesiredStateEntriesItem(BaseModel):
            entry_id: Optional[UUID] = None
            client_ref_id: Optional[str] = None
            coa_id: UUID
            description: Optional[Optional[str]] = None
            reference: Optional[Optional[str]] = None
            fs_date: Optional[constr(pattern=FS_DATE_REGEX)] = None
            contact_id: Optional[Optional[UUID]] = None
            contact_type: Optional[Optional[DesiredStateEntriesItemContactTypeEnum]] = None
            project_id: Optional[Optional[UUID]] = None
            source_amount: Optional[float] = None
            human_reviewed: Optional[bool] = None
            review_notes: Optional[Optional[str]] = None
            file_id: Optional[Optional[str]] = None
            file_name: Optional[Optional[str]] = None
            metadata: Optional[Any] = None
        custom_exchange_rate: Optional[Optional[confloat(gt=0)]] = None
        entries: Optional[List[DesiredStateEntriesItem]] = None
    intent_id: UUID
    bank_transaction_id: UUID
    ledger_transaction_id: Optional[UUID] = None
    candidate_id: Optional[UUID] = None
    action: Optional[Any] = None
    desired_state: Optional[DesiredState] = None
    timestamp: datetime