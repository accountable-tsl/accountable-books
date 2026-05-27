from pydantic import BaseModel
from typing import Optional
from enum import Enum

class ScopeEnum(str, Enum):
    ENTRY = "entry"
    GROUP = "group"

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

class UpdateContactPayload(BaseModel):
    scope: ScopeEnum
    entryId: Optional[str] = None
    contactId: Optional[str]
    contactType: Optional[Optional[ContactTypeEnum]] = None