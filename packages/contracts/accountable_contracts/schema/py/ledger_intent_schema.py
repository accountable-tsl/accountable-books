from pydantic import BaseModel, confloat, constr
from typing import Any, List, Literal, Optional, Union
from enum import Enum
from datetime import datetime
from uuid import UUID

FS_DATE_REGEX = r"^\d{4}-\d{2}-\d{2}$"

class Option1DesiredStateEntriesItemContactTypeEnum(str, Enum):
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

class Option0(BaseModel):
    intent_id: UUID
    bank_transaction_id: UUID
    candidate_id: UUID
    action: Literal["reject_suggestion"]
    reason: Optional[Optional[str]] = None
    timestamp: datetime

class Option1(BaseModel):
    class Option1DesiredState(BaseModel):
        class Option1DesiredStateEntriesItem(BaseModel):
            entry_id: Optional[UUID] = None
            client_ref_id: Optional[str] = None
            coa_id: UUID
            description: Optional[Optional[str]] = None
            reference: Optional[Optional[str]] = None
            fs_date: Optional[constr(pattern=FS_DATE_REGEX)] = None
            contact_id: Optional[Optional[UUID]] = None
            contact_type: Optional[Optional[Option1DesiredStateEntriesItemContactTypeEnum]] = None
            project_id: Optional[Optional[UUID]] = None
            source_amount: Optional[float] = None
            human_reviewed: Optional[bool] = None
            review_notes: Optional[Optional[str]] = None
            file_id: Optional[Optional[str]] = None
            file_name: Optional[Optional[str]] = None
            metadata: Optional[Any] = None
        custom_exchange_rate: Optional[Optional[confloat(gt=0)]] = None
        entries: Optional[List[Option1DesiredStateEntriesItem]] = None
    intent_id: UUID
    bank_transaction_id: UUID
    ledger_transaction_id: Optional[UUID] = None
    candidate_id: Optional[UUID] = None
    action: Optional[Any] = None
    desired_state: Optional[Option1DesiredState] = None
    timestamp: datetime

type LedgerIntentSchema = Union[Option0, Option1]