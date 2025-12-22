from pydantic import BaseModel, constr
from typing import Any, Optional
from enum import Enum
from uuid import UUID

FS_DATE_REGEX = r"^\d{4}-\d{2}-\d{2}$"

class ContactTypeEnum(str, Enum):
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

class LedgerIntentEntry(BaseModel):
    entry_id: Optional[UUID] = None
    coa_id: UUID
    description: Optional[Optional[str]] = None
    fs_date: Optional[constr(pattern=FS_DATE_REGEX)] = None
    contact_id: Optional[Optional[UUID]] = None
    contact_type: Optional[Optional[ContactTypeEnum]] = None
    project_id: Optional[Optional[UUID]] = None
    source_amount: Optional[float] = None
    human_reviewed: Optional[bool] = None
    review_notes: Optional[Optional[str]] = None
    file_id: Optional[Optional[str]] = None
    file_name: Optional[Optional[str]] = None
    metadata: Optional[Any] = None