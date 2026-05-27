"""Prediction service for transaction categorization."""

import logging
import time

from ml_engine.core.exceptions import PredictionServiceError
from ml_engine.models.categorization.global_intent_classifier import (
    get_global_intent_classifier,
)
from ml_engine.core.embeddings import embed_text
from ml_engine.models.categorization.tenant_account_ranker import (
    get_tenant_account_ranker,
)
from ml_engine.models.registry import get_model_registry
from ml_engine.services.coa_client import fetch_company_coa
from ml_engine.domains.accrual import get_accrual_resolver, AccrualResolverInput, AccountTypeMetadata, CoaAccount
from accountable_contracts.schema import (
    MlPredictionOutput,
    EnrichedTransaction,
    FinalPosting,
)
from accountable_contracts.data import default_account_types

logger = logging.getLogger(__name__)


class PredictionService:
    """Service for generating ML predictions for transaction categorization."""

    def __init__(self):
        registry = get_model_registry()

        self.intent_classifier = get_global_intent_classifier(
            model_config=registry.get_model_config("global_intent_classifier")
        )
        self.tenant_ranker = get_tenant_account_ranker(
            model_config=registry.get_model_config("tenant_account_ranker")
        )
        self.accrual_resolver = get_accrual_resolver()
        self.model_version = self.intent_classifier.model_version

    async def predict(self, request: EnrichedTransaction) -> MlPredictionOutput:
        start = time.time()
        etx = request

        company_id = etx.ids.company_uuid
        bank_txn_id = etx.ids.bank_transaction_id

        logger.info(
            "Processing ML prediction",
            extra={"company_id": company_id, "bank_transaction_id": bank_txn_id},
        )

        snapshot_version = etx.context.coa_snapshot_version
        try:
            company_coa = await fetch_company_coa(company_id, snapshot_version)
        except Exception as err:
            logger.warning(
                "COA fetch failed, using defaults",
                extra={
                    "company_id": company_id,
                    "snapshot_version": snapshot_version,
                    "error": str(err),
                },
            )
            company_coa = None

        try:
            global_intent = self.intent_classifier.predict(etx)

            ranker_output = self.tenant_ranker.predict(
                etx,
                global_intent,
                company_coa=company_coa,
            )

            # Call accrual resolver (if COA available)
            accrual_output = None
            if company_coa:
                try:
                    # Get account type metadata from default account types registry
                    account_type = next(
                        (at for at in default_account_types() if at["key"] == global_intent.semantic_top1),
                        None
                    )

                    account_type_metadata = AccountTypeMetadata(
                        key=global_intent.semantic_top1,
                        label=account_type["label"] if account_type else ranker_output.selected_account_label,
                        accrual_targets=account_type.get("accrual_targets") if account_type else None
                    )

                    # Convert company_coa to CoaAccount list
                    coa_accounts = []
                    for acc in (company_coa if isinstance(company_coa, list) else []):
                        # Use provided embedding or compute on-demand if missing
                        embedding = acc.get("embedding")
                        if not embedding or len(embedding) == 0:
                            account_text = f"{acc.get('name', '')} {acc.get('description', '')}"
                            embedding = embed_text(account_text).tolist()
                        else:
                            # Ensure embedding is a list
                            embedding = list(embedding) if not isinstance(embedding, list) else embedding

                        coa_accounts.append(CoaAccount(
                            id=acc.get("id"),
                            name=acc.get("name"),
                            account_type_id=acc.get("account_type_id"),
                            account_type_key=acc.get("account_type_key"),
                            embedding=embedding,
                            is_active=acc.get("is_active", True),
                            metadata=acc.get("metadata", {})
                        ))

                    accrual_input = AccrualResolverInput(
                        selected_account_id=ranker_output.selected_account_id,
                        selected_account_label=ranker_output.selected_account_label,
                        semantic_type_key=global_intent.semantic_top1,
                        account_type_metadata=account_type_metadata,
                        coa_snapshot=coa_accounts,
                        transaction_metadata=etx.raw if hasattr(etx, 'raw') else {},
                        accounting_basis=etx.context.accounting_basis if hasattr(etx.context, 'accounting_basis') else "modified_cash_basis",
                        enriched_transaction=etx.model_dump() if hasattr(etx, 'model_dump') else {},
                        historical_patterns=etx.historical if hasattr(etx, 'historical') else None,
                        typical_frequency=None,  # TODO: Extract from historical patterns
                        is_recurring=None,  # TODO: Extract from signals
                    )

                    accrual_output = await self.accrual_resolver.resolve(accrual_input)
                    logger.info(
                        "Accrual resolver completed",
                        extra={
                            "company_id": company_id,
                            "should_accrue": accrual_output.should_accrue,
                            "confidence": accrual_output.confidence,
                        },
                    )
                except Exception as accrual_err:
                    logger.warning(
                        "Accrual resolver failed, continuing without accrual recommendation",
                        extra={
                            "company_id": company_id,
                            "error": str(accrual_err),
                        },
                    )
                    accrual_output = None

            latency = int((time.time() - start) * 1000)
            logger.info(
                "ML prediction completed",
                extra={
                    "company_id": company_id,
                    "bank_transaction_id": bank_txn_id,
                    "latency_ms": latency,
                },
            )

            return MlPredictionOutput(
                final_posting={
                    "account_id": ranker_output.selected_account_id,
                    "account_label": ranker_output.selected_account_label,
                },
                global_intent_classifier=global_intent.model_dump() if hasattr(global_intent, 'model_dump') else global_intent,
                tenant_account_ranker=ranker_output.model_dump() if hasattr(ranker_output, 'model_dump') else ranker_output,
                accrual_resolver=accrual_output.model_dump() if accrual_output and hasattr(accrual_output, 'model_dump') else None,
            )

        except Exception as e:
            latency = int((time.time() - start) * 1000)
            logger.error(
                "ML prediction failed",
                extra={
                    "company_id": company_id,
                    "bank_transaction_id": bank_txn_id,
                    "latency_ms": latency,
                    "error": str(e),
                },
                exc_info=True,
            )
            raise PredictionServiceError("ML prediction failed") from e


# Singleton instance
_prediction_service: PredictionService | None = None


def get_prediction_service() -> PredictionService:
    global _prediction_service
    if _prediction_service is None:
        _prediction_service = PredictionService()
    return _prediction_service
