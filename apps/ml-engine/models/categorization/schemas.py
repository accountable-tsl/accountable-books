"""Pydantic models for ML Engine categorization.

These models are imported from the generated Pydantic models in the contracts package.
The generated models are located in packages/contracts/schema/py/
"""

# Import from generated Pydantic models
# Note: The exact import path will depend on how datamodel-code-generator structures the output
# This will be updated once we generate the models and see the actual structure
try:
    # Try importing from the generated models
    # The path structure will be: accountable_contracts/schema/py/<module_name>
    from accountable_contracts.schema.py import (  # type: ignore
        EnrichedTransaction,
        CompanyContext,
        TemporalSchema,
        BankContactStatsSnapshot,
    )
except ImportError:
    # Fallback: models will be generated and imports will be fixed
    # For now, define placeholder types
    from typing import Any

    EnrichedTransaction = Any  # type: ignore
    CompanyContext = Any  # type: ignore
    TemporalSchema = Any  # type: ignore
    BankContactStatsSnapshot = Any  # type: ignore

from pydantic import BaseModel


# Categorization Prediction Request Schema
class MLPredictionRequest(BaseModel):
    """Request schema for categorization prediction."""

    enriched_transaction: EnrichedTransaction
    company_context: CompanyContext


# Categorization Prediction Response Schema
class MLPredictionResponse(BaseModel):
    """Response schema for categorization prediction."""

    # TODO: Define response structure once categorization logic is implemented
    pass