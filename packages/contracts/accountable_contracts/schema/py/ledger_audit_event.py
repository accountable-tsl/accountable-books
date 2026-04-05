from pydantic import BaseModel
from typing import Optional
from enum import Enum

class EventTypeEnum(str, Enum):
    LEDGER_POSTED_AUTO = "ledger_posted_auto"
    LEDGER_POSTED_MANUAL = "ledger_posted_manual"
    METADATA_UPDATED = "metadata_updated"
    LEDGER_SUPERSEDED = "ledger_superseded"
    LEDGER_SPLIT_CREATED = "ledger_split_created"
    LEDGER_REVERSED = "ledger_reversed"
    LEDGER_MARKED_REVIEWED = "ledger_marked_reviewed"
    LEDGER_MARKED_UNREVIEWED = "ledger_marked_unreviewed"

class ActorTypeEnum(str, Enum):
    USER = "user"
    SYSTEM = "system"

class LedgerAuditEvent(BaseModel):
    id: str
    eventType: EventTypeEnum
    actorName: str
    actorType: ActorTypeEnum
    timestamp: str
    comment: Optional[str] = None