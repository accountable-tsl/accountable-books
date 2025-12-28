from pydantic import BaseModel, Field, constr
from typing import Any, Optional
from enum import Enum
from uuid import UUID

class ProviderEnum(str, Enum):
    CLOUDFLARE_R2 = "cloudflare_r2"

class SourceEnum(str, Enum):
    LEDGER = "ledger"
    JOURNAL = "journal"
    BANK = "bank"

class NewTxnFile(BaseModel):
    id: Optional[UUID] = None
    name: constr(max_length=512)
    key: constr(max_length=1024)
    bucket_name: str
    url: str
    type: str
    size_bytes: Any
    checksum: Optional[Optional[constr(max_length=64)]] = None
    provider: Optional[ProviderEnum] = Field(default="cloudflare_r2")
    region: Optional[Optional[str]] = None
    endpoint: Optional[Optional[str]] = None
    source: SourceEnum
    transaction_id: UUID
    entry_id: Optional[Optional[UUID]] = None
    company_id: UUID
    uploaded_by_id: UUID