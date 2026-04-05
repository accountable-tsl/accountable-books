from pydantic import BaseModel
from typing import List, Optional
from enum import Enum
from uuid import UUID

class TransactionsItemAuditEventsItemEventTypeEnum(str, Enum):
    LEDGER_POSTED_AUTO = "ledger_posted_auto"
    LEDGER_POSTED_MANUAL = "ledger_posted_manual"
    METADATA_UPDATED = "metadata_updated"
    LEDGER_SUPERSEDED = "ledger_superseded"
    LEDGER_SPLIT_CREATED = "ledger_split_created"
    LEDGER_REVERSED = "ledger_reversed"
    LEDGER_MARKED_REVIEWED = "ledger_marked_reviewed"
    LEDGER_MARKED_UNREVIEWED = "ledger_marked_unreviewed"

class TransactionsItemAuditEventsItemActorTypeEnum(str, Enum):
    USER = "user"
    SYSTEM = "system"

class TransactionsItemSourceEnum(str, Enum):
    BANK = "bank"
    JOURNAL = "journal"

class TransactionsItemDrCrEnum(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"

class StatementLineAccountTransactionsResponse(BaseModel):
    class TransactionsItem(BaseModel):
        class TransactionsItemAccount(BaseModel):
            code: str
            label: str
        class TransactionsItemAttachmentsItem(BaseModel):
            id: str
            name: str
            url: Optional[str] = None
        class TransactionsItemAuditEventsItem(BaseModel):
            id: str
            eventType: TransactionsItemAuditEventsItemEventTypeEnum
            actorName: str
            actorType: TransactionsItemAuditEventsItemActorTypeEnum
            timestamp: str
            comment: Optional[str] = None
        id: str
        date: str
        description: str
        source: TransactionsItemSourceEnum
        amount: float
        account: TransactionsItemAccount
        attachments: Optional[List[TransactionsItemAttachmentsItem]] = None
        auditEvents: Optional[List[TransactionsItemAuditEventsItem]] = None
        drCr: TransactionsItemDrCrEnum
    lineId: str
    accountId: UUID
    transactions: List[TransactionsItem]
    nextCursor: Optional[str]
    hasMore: bool