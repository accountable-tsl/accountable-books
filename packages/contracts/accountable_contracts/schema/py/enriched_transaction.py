from pydantic import BaseModel, Field, confloat, conint, constr
from typing import Any, List, Literal, Optional, Union
from enum import Enum
from datetime import date, datetime
from uuid import UUID

class NormalizedContactMatchConfidenceEnum(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNMATCHED = "unmatched"

class NormalizedContactTypeOption0Enum(str, Enum):
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

class ContextTypeEnum(str, Enum):
    BUSINESS = "business"
    INDIVIDUAL = "individual"
    ACCOUNTING_FIRM = "accounting_firm"

class ContextAccountingBasisEnum(str, Enum):
    MODIFIED_CASH_BASIS = "modified_cash_basis"
    MODIFIED_ACCRUAL_BASIS = "modified_accrual_basis"

class ContextReportingFrameworkOption0Enum(str, Enum):
    IFRS = "ifrs"
    US_GAAP = "us_gaap"

class MetadataSourceEnum(str, Enum):
    INGESTION = "ingestion"
    BACKFILL = "backfill"
    MANUAL = "manual"

class MetadataStatusEnum(str, Enum):
    ENRICHED = "enriched"
    PARTIAL = "partial"
    FAILED = "failed"
    PENDING = "pending"

class MetadataProcessingContextEnum(str, Enum):
    PRIMARY = "primary"
    SHADOW = "shadow"

class EnrichedTransaction(BaseModel):
    class Ids(BaseModel):
        bank_transaction_id: UUID
        bank_transaction_batch_id: Optional[Optional[UUID]] = None
        company_uuid: UUID
        bank_account_id: UUID
        bank_account_coa_id: UUID
        bank_account_currency_code: constr(min_length=3, max_length=3)
        contact_id: Optional[Optional[UUID]] = None
        enrichment_job_id: Optional[Optional[str]] = None
    class Raw(BaseModel):
        date: date
        description: Optional[str]
        amount: float
        currency_code: constr(min_length=3, max_length=3)
        reference: Optional[Optional[str]] = None
        source: str
        metadata: Any
    class Normalized(BaseModel):
        description: str
        description_tokens: List[str]
        contact_name: Optional[str]
        contact_fingerprint: Optional[str]
        contact_match_confidence: NormalizedContactMatchConfidenceEnum
        contact_type: Union[NormalizedContactTypeOption0Enum, Literal["unknown"]]
        normalized_reference: Optional[Optional[str]] = None
        global_contact_name: Optional[Optional[str]] = None
        global_contact_category_hints: Optional[Optional[List[str]]] = None
    class Context(BaseModel):
        company_uuid: str
        company_name: str
        type: ContextTypeEnum
        description: Optional[Optional[str]] = None
        website: Optional[Optional[str]] = None
        country_id: str
        country_code: str
        region_code: Optional[Optional[str]] = None
        subregion_code: Optional[Optional[str]] = None
        industry: Optional[str] = None
        tags: List[str] = Field(default_factory=list)
        accounting_basis: ContextAccountingBasisEnum
        reporting_framework: Union[ContextReportingFrameworkOption0Enum, Literal["other"]]
        reporting_currency_code: constr(min_length=3, max_length=3)
        year_end_day: float
        year_end_month: float
        default_timezone: str
        company_settings_checksum: str
        coa_snapshot_version: str
        coa_snapshot_id: str
        coa_snapshot_checksum: Optional[str] = None
        cached_at: datetime
    class Historical(BaseModel):
        class HistoricalBankContactStatsSnapshot(BaseModel):
            class HistoricalBankContactStatsSnapshotTotals(BaseModel):
                transaction_count: conint(ge=0)
                amount_native_sum: float
                avg_amount_native: float
                stddev_amount_native: float
            class HistoricalBankContactStatsSnapshotRolling30d(BaseModel):
                transaction_count: conint(ge=0)
                amount_native_sum: float
                avg_amount_native: float
                stddev_amount_native: float
            class HistoricalBankContactStatsSnapshotRolling90d(BaseModel):
                transaction_count: conint(ge=0)
                amount_native_sum: float
                avg_amount_native: float
                stddev_amount_native: float
            stats_row_id: Optional[str]
            totals: HistoricalBankContactStatsSnapshotTotals
            rolling_30d: HistoricalBankContactStatsSnapshotRolling30d
            rolling_90d: HistoricalBankContactStatsSnapshotRolling90d
            last_transaction_id: Optional[str]
            last_transaction_date: Optional[date]
            stats_replay_seq: conint(ge=0)
            stats_snapshot_checksum: Optional[Optional[str]] = None
            snapshot_captured_at: Optional[date]
            as_of_transaction_id: Optional[str]
            as_of_transaction_date: Optional[date]
        bank_contact_stats_snapshot: Optional[Optional[HistoricalBankContactStatsSnapshot]] = None
    class Signals(BaseModel):
        likely_split: Optional[bool] = None
        likely_trf_btw_accounts: bool
        notes: List[str]
        requires_vat_check: Optional[bool] = None
        requires_fx_review: Optional[bool] = None
    class Temporal(BaseModel):
        class TemporalFiscalPeriod(BaseModel):
            year_start: date
            year_end: date
            quarter_start: date
            quarter_end: date
            month_start: date
            month_end: date
        day_of_week: confloat(ge=0, le=6)
        day_of_month: confloat(ge=1, le=31)
        calendar_month: confloat(ge=1, le=12)
        calendar_quarter: confloat(ge=1, le=4)
        fiscal_month: confloat(ge=1, le=12)
        fiscal_quarter: confloat(ge=1, le=4)
        fiscal_period: TemporalFiscalPeriod
    class FeedbackSummary(BaseModel):
        last_posted_at: date
        last_posted_coa_id: Optional[UUID]
        acceptance_ratio_90d: Optional[confloat(ge=0, le=1)]
        custom_exchange_rate: Optional[Optional[confloat(gt=0)]] = None
        user_override_contact_id: Optional[Optional[UUID]] = None
        user_override_notes: Optional[Optional[str]] = None
    class Metadata(BaseModel):
        source: MetadataSourceEnum
        enriched_at: datetime
        enrichment_latency_ms: confloat(ge=0)
        enrichment_version: str
        status: MetadataStatusEnum
        error_message: Optional[Optional[str]] = None
        processing_context: Optional[MetadataProcessingContextEnum] = None
        stats_replay_seq: Optional[conint(ge=0)] = None
        replay_reason: Optional[str] = None
        recomputed_at: Optional[datetime] = None
        stats_snapshot_checksum: Optional[Optional[str]] = None
    version: Any
    ids: Ids
    raw: Raw
    normalized: Normalized
    context: Context
    historical: Historical
    signals: Signals
    temporal: Optional[Temporal] = None
    feedback_summary: Optional[FeedbackSummary] = None
    metadata: Metadata