"""Type definitions for accrual resolver."""

from typing import Optional
from pydantic import BaseModel, Field


class CoaAccount(BaseModel):
    """Chart of Accounts account with embedding."""

    id: str = Field(..., description="Account UUID")
    name: str = Field(..., description="Account name/label")
    account_type_id: str = Field(..., description="Account type UUID")
    account_type_key: str = Field(..., description="Account type key (e.g., 'cl_accrued_opex')")
    embedding: list[float] = Field(..., description="384-dim sentence transformer embedding")
    is_active: bool = Field(..., description="Whether account is active")
    metadata: dict = Field(default_factory=dict, description="Additional account metadata")


class AccountTypeMetadata(BaseModel):
    """Metadata about the selected account type."""

    key: str = Field(..., description="Account type key")
    label: str = Field(..., description="Account type label")
    accrual_targets: Optional[list[str]] = Field(
        None, description="List of accrual account type keys"
    )


class AccrualResolverInput(BaseModel):
    """Input for accrual resolver."""

    # From Model B
    selected_account_id: str = Field(..., description="Selected account UUID from Model B")
    selected_account_label: str = Field(..., description="Selected account label")

    # From Model A
    semantic_type_key: str = Field(
        ..., description="Semantic account type key from Model A (e.g., 'exp_opex_professional_fees')"
    )

    # Account type metadata
    account_type_metadata: AccountTypeMetadata = Field(
        ..., description="Metadata for the selected account type including accrual targets"
    )

    # Company COA (embedded, cached from Redis)
    coa_snapshot: list[CoaAccount] = Field(..., description="Full company COA with embeddings")

    # Transaction context
    transaction_metadata: dict = Field(..., description="Raw transaction metadata")
    accounting_basis: str = Field(
        ..., description="Accounting basis: 'modified_cash_basis' or 'modified_accrual_basis'"
    )

    # Optional enriched transaction data
    enriched_transaction: Optional[dict] = Field(None, description="Full enriched transaction")

    # Historical signals (optional)
    historical_patterns: Optional[dict] = Field(None, description="Historical categorization patterns")
    typical_frequency: Optional[str] = Field(None, description="Typical transaction frequency")
    is_recurring: Optional[bool] = Field(None, description="Whether transaction is recurring")

    # Configuration
    config: dict = Field(
        default_factory=lambda: {"enable_embedding_scoring": True},
        description="Feature flags and configuration",
    )


class AccrualRecommendation(BaseModel):
    """A single accrual account recommendation."""

    account_id: str = Field(..., description="Recommended accrual account UUID")
    account_label: str = Field(..., description="Recommended accrual account label")
    score: float = Field(..., ge=0.0, le=1.0, description="Confidence score (0-1)")
    reasoning: str = Field(..., description="Human-readable explanation")
    method: str = Field(..., description="Primary method used for scoring")
    metadata: dict = Field(default_factory=dict, description="Debug info, feature scores, etc.")


class AccrualResolverOutput(BaseModel):
    """Output from accrual resolver."""

    should_accrue: bool = Field(..., description="Whether an accrual is recommended")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Overall confidence in decision")
    top_n_recommendations: list[AccrualRecommendation] = Field(
        default_factory=list, description="Top N accrual account recommendations"
    )
    top_1_recommendation: Optional[AccrualRecommendation] = Field(
        None, description="Best match if should_accrue is True"
    )
    fallback_used: bool = Field(False, description="True if no good match found")
    explanation: str = Field(..., description="Human-readable reasoning for decision")
    metadata: dict = Field(default_factory=dict, description="Debug info, thresholds, etc.")
