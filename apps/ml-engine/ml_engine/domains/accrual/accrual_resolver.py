"""Accrual resolver for transaction categorization."""

import logging
from typing import Optional

from ml_engine.core.embeddings import embed_text
from ml_engine.domains.accrual.types import (
    AccrualRecommendation,
    AccrualResolverInput,
    AccrualResolverOutput,
    CoaAccount,
)
from ml_engine.domains.accrual.helpers import (
    compute_string_similarity,
    cosine_similarity,
    generate_explanation,
    get_amount_percentile,
    get_company_accrual_ratio,
    get_confidence_threshold,
    get_materiality_threshold,
)

logger = logging.getLogger(__name__)


class AccrualResolver:
    """Resolves accrual account recommendations for transactions."""

    def __init__(self, embedding_model=None):
        """
        Initialize accrual resolver.

        Args:
            embedding_model: Optional embedding model for transaction text encoding.
                           If None, embedding scoring will be disabled.
        """
        self.embedding_model = embedding_model
        logger.info("AccrualResolver initialized")

    async def resolve(self, input_data: AccrualResolverInput) -> AccrualResolverOutput:
        """
        Resolve accrual account recommendations for a transaction.

        Args:
            input_data: AccrualResolverInput with transaction and COA data

        Returns:
            AccrualResolverOutput with recommendations
        """
        logger.info(
            f"Resolving accrual for semantic_type_key: {input_data.semantic_type_key}, "
            f"accounting_basis: {input_data.accounting_basis}"
        )

        # 1. EARLY EXIT: Check if accrual basis accounting
        if input_data.accounting_basis != "modified_accrual_basis":
            return self._create_empty_output(
                input_data,
                explanation="Cash basis accounting - no accruals needed",
            )

        # 2. EARLY EXIT: Only handle income/expense account types
        semantic_type_key = input_data.semantic_type_key
        if not (
            semantic_type_key.startswith("exp_") or semantic_type_key.startswith("rev_")
        ):
            return self._create_empty_output(
                input_data,
                explanation="Accrual resolution only applies to income/expense accounts",
            )

        # 3. EARLY EXIT: Check if selected account has accrual targets
        accrual_targets = input_data.account_type_metadata.accrual_targets
        if not accrual_targets or len(accrual_targets) == 0:
            return self._create_empty_output(
                input_data,
                explanation="No accrual logic needed for this account type",
            )

        # 4. Extract transaction context
        txn_amount_native = input_data.transaction_metadata.get("amount_native", 0)
        txn_currency = input_data.transaction_metadata.get("currency_code", "USD")
        txn_direction = input_data.transaction_metadata.get("direction", "outflow")

        # Get company context (with defaults)
        company_context = (
            input_data.enriched_transaction.get("context", {})
            if input_data.enriched_transaction
            else {}
        )
        company_size = company_context.get("company_size", "small")
        company_uuid = company_context.get("company_uuid", "unknown")

        # 5. EARLY EXIT: Materiality threshold
        materiality_threshold = get_materiality_threshold(txn_currency)

        if abs(txn_amount_native) < materiality_threshold:
            return self._create_empty_output(
                input_data,
                explanation=f"Amount ({txn_currency} {txn_amount_native:.2f}) below materiality threshold ({txn_currency} {materiality_threshold:.2f})",
                metadata={"materiality_threshold": materiality_threshold},
            )

        # 6. Filter COA for accrual target accounts
        candidate_accounts = self._filter_candidate_accounts(
            input_data.coa_snapshot, accrual_targets
        )

        if not candidate_accounts:
            return self._create_empty_output(
                input_data,
                explanation="No active accrual accounts in company COA",
                metadata={"accrual_targets": accrual_targets},
            )

        # 7. Score each candidate using multiple signals
        amount_percentile = get_amount_percentile(
            txn_amount_native, txn_currency, company_size
        )
        company_accrual_ratio = get_company_accrual_ratio(company_uuid)

        recommendations = []
        for account in candidate_accounts:
            score_dict = self._compute_all_scores(
                account=account,
                input_data=input_data,
                txn_direction=txn_direction,
                amount_percentile=amount_percentile,
                company_accrual_ratio=company_accrual_ratio,
            )

            # Determine if vendor match is available
            vendor_score_weight = score_dict.get("vendor_score", 0.0)
            has_vendor_match = vendor_score_weight >= 0.8

            # Adaptive weighted composite score
            composite_score = self._compute_composite_score(
                score_dict, has_vendor_match
            )

            recommendations.append(
                AccrualRecommendation(
                    account_id=account.id,
                    account_label=account.name,
                    score=composite_score,
                    reasoning=f"Emb:{score_dict['embedding_score']:.2f} Str:{score_dict['string_match_score']:.2f} "
                    f"Amt:{score_dict['amount_size_score']:.2f} Freq:{score_dict['frequency_score']:.2f} "
                    f"Vendor:{score_dict['vendor_score']:.2f} Spec:{score_dict['specificity_score']:.2f}",
                    method="composite",
                    metadata={
                        "all_scores": score_dict,
                        "amount_percentile": amount_percentile,
                        "has_vendor_match": has_vendor_match,
                    },
                )
            )

        # 8. Rank and return top N
        ranked = sorted(recommendations, key=lambda x: x.score, reverse=True)
        top_n = ranked[:5]  # Top 5 recommendations
        top_1 = ranked[0] if ranked else None

        # 9. Dynamic confidence threshold
        confidence_threshold = get_confidence_threshold(
            company_size=company_size,
            amount=txn_amount_native,
            currency=txn_currency,
            accounting_basis=input_data.accounting_basis,
        )

        should_accrue = (top_1.score > confidence_threshold) if top_1 else False

        explanation = generate_explanation(
            input_data, top_1, should_accrue, confidence_threshold
        )

        return AccrualResolverOutput(
            should_accrue=should_accrue,
            confidence=top_1.score if top_1 else 0.0,
            top_n_recommendations=top_n,
            top_1_recommendation=top_1 if should_accrue else None,
            fallback_used=False,
            explanation=explanation,
            metadata={
                "num_candidates": len(candidate_accounts),
                "threshold": confidence_threshold,
                "materiality_threshold": materiality_threshold,
                "amount_percentile": amount_percentile,
                "company_accrual_ratio": company_accrual_ratio,
                "accrual_targets": accrual_targets,
            },
        )

    def _create_empty_output(
        self,
        input_data: AccrualResolverInput,
        explanation: str,
        metadata: Optional[dict] = None,
    ) -> AccrualResolverOutput:
        """Create an empty output (no accrual recommended)."""
        return AccrualResolverOutput(
            should_accrue=False,
            confidence=1.0,
            explanation=explanation,
            top_n_recommendations=[],
            top_1_recommendation=None,
            fallback_used=False,
            metadata=metadata or {},
        )

    def _filter_candidate_accounts(
        self, coa_snapshot: list[CoaAccount], accrual_targets: list[str]
    ) -> list[CoaAccount]:
        """
        Filter COA for accrual target accounts.

        Args:
            coa_snapshot: Full company COA
            accrual_targets: List of target account type keys

        Returns:
            List of candidate accounts matching accrual targets
        """
        candidates = [
            acc
            for acc in coa_snapshot
            if acc.account_type_key in accrual_targets and acc.is_active
        ]
        logger.debug(
            f"Filtered {len(candidates)} candidate accounts from {len(coa_snapshot)} total accounts"
        )
        return candidates

    def _compute_all_scores(
        self,
        account: CoaAccount,
        input_data: AccrualResolverInput,
        txn_direction: str,
        amount_percentile: float,
        company_accrual_ratio: float,
    ) -> dict:
        """
        Compute all scoring signals for a candidate account.

        Args:
            account: Candidate COA account
            input_data: AccrualResolverInput
            txn_direction: Transaction direction ('inflow' or 'outflow')
            amount_percentile: Amount percentile score
            company_accrual_ratio: Company accrual usage ratio

        Returns:
            Dictionary with all scores
        """
        score_dict = {
            "embedding_score": 0.0,
            "string_match_score": 0.0,
            "frequency_score": 0.0,
            "vendor_score": 0.0,
            "amount_size_score": 0.0,
            "company_behavior_score": 0.0,
            "specificity_score": 0.0,
        }

        # 1. Embedding similarity (OPTIONAL - heavily downweighted)
        enable_embeddings = input_data.config.get("enable_embedding_scoring", True)
        if enable_embeddings:
            # Check if account has embedding, compute if missing
            account_embedding = account.embedding
            if not account_embedding or len(account_embedding) == 0:
                # Compute embedding on-demand if missing
                account_text = f"{account.name} {account.metadata.get('description', '')}"
                account_embedding = embed_text(account_text).tolist()
            
            # Get transaction text (similar to tenant_ranker)
            transaction_text = self._combine_transaction_text(input_data.enriched_transaction)
            if transaction_text:
                transaction_embedding = embed_text(transaction_text)
                
                # Compare with COA account embedding
                score_dict["embedding_score"] = cosine_similarity(
                    transaction_embedding.tolist(), 
                    account_embedding
                )
            else:
                score_dict["embedding_score"] = 0.0
        else:
            score_dict["embedding_score"] = 0.0

        # 2. String matching (LIMITED USEFULNESS)
        # Match semantic_type_key to COA account name (not vendor text)
        coa_account_text = f"{account.name} {account.metadata.get('description', '')}"
        score_dict["string_match_score"] = compute_string_similarity(
            input_data.semantic_type_key, coa_account_text.lower()
        )

        # 3. Amount size heuristics
        score_dict["amount_size_score"] = amount_percentile

        # 4. Vendor/contact history (PRIMARY SIGNAL if available)
        score_dict["vendor_score"] = self._compute_vendor_score(
            account, input_data.enriched_transaction, input_data.historical_patterns
        )

        # 5. Frequency pattern (GENTLE supporting evidence)
        score_dict["frequency_score"] = self._compute_frequency_score(
            account, input_data.typical_frequency, txn_direction
        )

        # 6. Company behavior
        score_dict["company_behavior_score"] = company_accrual_ratio

        # 7. Specificity score (based on accrual target order)
        accrual_targets = input_data.account_type_metadata.accrual_targets or []
        score_dict["specificity_score"] = self._compute_specificity_score(
            account, accrual_targets
        )

        return score_dict

    def _compute_vendor_score(
        self,
        account: CoaAccount,
        enriched_transaction: Optional[dict],
        historical_patterns: Optional[dict],
    ) -> float:
        """
        Compute vendor history score.

        Args:
            account: Candidate account
            enriched_transaction: Enriched transaction data
            historical_patterns: Historical categorization patterns

        Returns:
            Vendor score (0-1)
        """
        if not enriched_transaction:
            return 0.0

        normalized = enriched_transaction.get("normalized", {})
        contact_name = normalized.get("contact_name")

        if not contact_name:
            return 0.0

        # If we have historical patterns
        if historical_patterns:
            last_accounts = historical_patterns.get("last_categorized_accounts", [])
            # Strong signal if this vendor previously posted to this accrual account
            if account.id in [a.get("coa_id") for a in last_accounts]:
                return 1.0  # Perfect match
            else:
                return 0.3  # Some credit for having vendor info
        else:
            return 0.2  # Vendor known but no history yet

    def _compute_frequency_score(
        self, account: CoaAccount, typical_frequency: Optional[str], txn_direction: str
    ) -> float:
        """
        Compute frequency pattern score (GENTLE signal).

        Args:
            account: Candidate account
            typical_frequency: Typical transaction frequency
            txn_direction: Transaction direction

        Returns:
            Frequency score (0-1)
        """
        if not typical_frequency:
            typical_frequency = "irregular"

        account_name_lower = account.name.lower()

        if txn_direction == "outflow":  # Expense payment
            if typical_frequency in ["monthly", "quarterly", "annual"]:
                # Recurring expenses → GENTLE nudge towards prepayment (not conclusive)
                if "prepayment" in account_name_lower or "prepaid" in account_name_lower:
                    return 0.6
                elif "accrued" in account_name_lower:
                    return 0.4
            else:  # One-time or irregular
                # One-time expenses → GENTLE nudge towards accrual
                if "accrued" in account_name_lower:
                    return 0.6
                elif "prepayment" in account_name_lower:
                    return 0.3

        elif txn_direction == "inflow":  # Revenue receipt
            if typical_frequency in ["monthly", "quarterly", "annual"]:
                # Recurring revenue → GENTLE nudge towards contract liability
                if (
                    "contract_liabilities" in account.account_type_key
                    or "deferred" in account_name_lower
                ):
                    return 0.6
                elif "receivable" in account_name_lower:
                    return 0.4
            else:
                # One-time revenue → GENTLE nudge towards receivable
                if "receivable" in account_name_lower:
                    return 0.6

        return 0.5  # Neutral

    def _compute_specificity_score(
        self, account: CoaAccount, accrual_targets: list[str]
    ) -> float:
        """
        Score based on how specific the account is relative to accrual targets.
        More specific accounts (e.g., 'cl_accrued_professional_fees') score higher
        than generic ones (e.g., 'cl_accrued_opex').

        Args:
            account: Candidate account
            accrual_targets: List of accrual target account type keys (ordered by preference)

        Returns:
            Specificity score (0-1)
        """
        if not accrual_targets:
            return 0.5  # Neutral if no targets

        # If this is the first accrual target (most specific), give highest score
        if account.account_type_key == accrual_targets[0]:
            return 1.0
        elif account.account_type_key in accrual_targets:
            # Later in list = less specific
            index = accrual_targets.index(account.account_type_key)
            # Decay by 0.2 per position (first=1.0, second=0.8, third=0.6, etc.)
            return max(0.0, 1.0 - (index * 0.2))
        else:
            # Not in accrual targets list (shouldn't happen due to filtering, but handle gracefully)
            return 0.0

    def _combine_transaction_text(self, enriched_transaction: Optional[dict]) -> str:
        """
        Combine transaction fields into searchable text for embedding.

        Args:
            enriched_transaction: Enriched transaction dict (or EnrichedTransaction object)

        Returns:
            Combined text string
        """
        if not enriched_transaction:
            return ""

        # Handle both dict and object formats
        if isinstance(enriched_transaction, dict):
            normalized = enriched_transaction.get("normalized", {})
            raw = enriched_transaction.get("raw", {})
            signals = enriched_transaction.get("signals", {})
            context = enriched_transaction.get("context", {})
        else:
            # Handle Pydantic model or similar object
            normalized = getattr(enriched_transaction, "normalized", {})
            raw = getattr(enriched_transaction, "raw", {})
            signals = getattr(enriched_transaction, "signals", None)
            context = getattr(enriched_transaction, "context", None)

        parts = []

        # Extract normalized fields
        if isinstance(normalized, dict):
            parts.append(normalized.get("description", "") or "")
            parts.append(normalized.get("contact_name", "") or "")
            parts.append(normalized.get("global_contact_name", "") or "")
            hints = normalized.get("global_contact_category_hints")
            if hints:
                parts.append(" ".join(hints) if isinstance(hints, list) else str(hints))
        else:
            # Handle object format
            parts.append(getattr(normalized, "description", "") or "")
            parts.append(getattr(normalized, "contact_name", "") or "")
            parts.append(getattr(normalized, "global_contact_name", "") or "")
            hints = getattr(normalized, "global_contact_category_hints", None)
            if hints:
                parts.append(" ".join(hints) if isinstance(hints, list) else str(hints))

        # Extract raw fields
        if isinstance(raw, dict):
            parts.append(raw.get("reference", "") or "")
        else:
            parts.append(getattr(raw, "reference", "") or "")

        # Extract signals
        if signals:
            if isinstance(signals, dict):
                notes = signals.get("notes")
            else:
                notes = getattr(signals, "notes", None)
            if notes:
                parts.append(" ".join(notes) if isinstance(notes, list) else str(notes))

        # Extract context
        if context:
            if isinstance(context, dict):
                industry = context.get("industry")
            else:
                industry = getattr(context, "industry", None)
            if industry:
                parts.append(str(industry))

        # Join with separator (same as tenant_ranker)
        return " | ".join(filter(None, parts))

    def _compute_composite_score(
        self, score_dict: dict, has_vendor_match: bool
    ) -> float:
        """
        Compute weighted composite score with adaptive weights.

        Args:
            score_dict: Dictionary with all individual scores
            has_vendor_match: Whether vendor match was found

        Returns:
            Composite score (0-1)
        """
        if has_vendor_match:
            # Scenario A: Vendor match available - prioritize it
            composite_score = (
                0.04 * score_dict["embedding_score"]  # Minimal (accrual names not semantic)
                + 0.08 * score_dict["string_match_score"]  # Limited usefulness
                + 0.45 * score_dict["vendor_score"]  # PRIMARY SIGNAL (vendor match)
                + 0.08 * score_dict["frequency_score"]  # Gentle supporting evidence
                + 0.12 * score_dict["amount_size_score"]  # Material amounts matter
                + 0.08 * score_dict["company_behavior_score"]  # Company patterns
                + 0.15 * score_dict["specificity_score"]  # Specificity matters (prefer specific accounts)
            )
        else:
            # Scenario B: No vendor match - use semantic/heuristic fallback
            composite_score = (
                0.06 * score_dict["embedding_score"]  # Heavily downweighted (noisy)
                + 0.10 * score_dict["string_match_score"]  # Limited signal
                + 0.08 * score_dict["vendor_score"]  # Vendor known but no history
                + 0.18 * score_dict["frequency_score"]  # Heuristics become more important
                + 0.25 * score_dict["amount_size_score"]  # Material amounts VERY important
                + 0.18 * score_dict["company_behavior_score"]  # Company patterns VERY important
                + 0.15 * score_dict["specificity_score"]  # Specificity matters (prefer specific accounts)
            )

        return composite_score


# Singleton instance
_accrual_resolver: Optional[AccrualResolver] = None


def get_accrual_resolver(embedding_model=None) -> AccrualResolver:
    """Get singleton accrual resolver instance."""
    global _accrual_resolver
    if _accrual_resolver is None:
        _accrual_resolver = AccrualResolver(embedding_model=embedding_model)
    return _accrual_resolver
