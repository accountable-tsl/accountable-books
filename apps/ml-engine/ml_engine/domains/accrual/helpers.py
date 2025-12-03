"""Helper functions for accrual resolver."""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def get_materiality_threshold(currency: str) -> float:
    """
    Returns materiality threshold in native currency.
    Below this amount, accrual resolution is skipped.

    Hardcoded thresholds per currency (fallback to USD if not listed).
    Future enhancement: Make dynamic/percentile-based as system matures.

    Args:
        currency: ISO currency code (e.g., 'USD', 'NGN', 'EUR')

    Returns:
        Materiality threshold amount
    """
    # Hardcoded thresholds per currency
    # These represent "immaterial amounts" that don't warrant accrual resolution
    thresholds = {
        "USD": 100,
        "EUR": 100,
        "GBP": 100,
        "CAD": 150,
        "AUD": 150,
        "ZAR": 1000,
        "NGN": 20000,
        "KES": 5000,
        "GHS": 200,
        "INR": 3000,
    }

    # Fallback to USD if currency not in list
    threshold = thresholds.get(currency, 100)
    logger.debug(f"Materiality threshold for {currency}: {threshold}")
    return threshold


def get_amount_percentile(amount: float, currency: str, company_size: str) -> float:
    """
    Returns 0-1 score indicating how large this amount is relative to typical company transactions.
    Higher percentile → more likely to need accrual.

    Args:
        amount: Transaction amount in native currency
        currency: ISO currency code
        company_size: 'small', 'medium', or 'large'

    Returns:
        Percentile score (0-1)

    Note:
        Uses simple heuristics based on company size. Future enhancement: use historical
        amount distribution for more accurate percentile calculation.
    """
    percentile_thresholds = {
        "small": {"low": 500, "high": 10000},
        "medium": {"low": 2000, "high": 50000},
        "large": {"low": 10000, "high": 500000},
    }

    thresholds = percentile_thresholds.get(company_size, {"low": 500, "high": 10000})

    # Normalize amount to 0-1 scale
    abs_amount = abs(amount)
    if abs_amount < thresholds["low"]:
        return 0.2  # Small amount
    elif abs_amount > thresholds["high"]:
        return 1.0  # Very large amount
    else:
        # Linear interpolation
        return 0.2 + (abs_amount - thresholds["low"]) / (
            thresholds["high"] - thresholds["low"]
        ) * 0.8


def get_company_accrual_ratio(company_id: str) -> float:
    """
    Returns 0-1 ratio of how often this company uses accrual accounts.
    0 = never accrues, 1 = always accrues

    Args:
        company_id: Company UUID

    Returns:
        Accrual ratio (0-1)

    Note:
        Future enhancement: Query historical ledger entries for this company to calculate
        actual accrual usage ratio (entries with accrual accounts / total entries).
        Currently returns neutral 0.5 as placeholder.
    """
    logger.debug(f"Company accrual ratio for {company_id}: 0.5 (placeholder)")
    return 0.5


def get_confidence_threshold(
    company_size: str, amount: float, currency: str, accounting_basis: str
) -> float:
    """
    Returns dynamic confidence threshold (0-1).
    Higher threshold for large amounts (be conservative).

    Args:
        company_size: 'small', 'medium', or 'large'
        amount: Transaction amount in native currency
        currency: ISO currency code
        accounting_basis: Accounting basis type

    Returns:
        Confidence threshold (0-1)

    Note:
        Future enhancement: Adjust threshold based on company's historical accrual usage patterns
    """
    base_threshold = 0.6

    # Currency-specific thresholds for "large amounts" (similar to materiality thresholds)
    # These represent amounts where we should be more conservative
    large_amount_thresholds = {
        "USD": 50000,
        "EUR": 50000,
        "GBP": 40000,
        "CAD": 65000,
        "AUD": 65000,
        "ZAR": 500000,
        "NGN": 10000000,
        "KES": 5000000,
        "GHS": 100000,
        "INR": 3000000,
    }

    medium_amount_thresholds = {
        "USD": 10000,
        "EUR": 10000,
        "GBP": 8000,
        "CAD": 13000,
        "AUD": 13000,
        "ZAR": 100000,
        "NGN": 2000000,
        "KES": 1000000,
        "GHS": 20000,
        "INR": 600000,
    }

    # Get thresholds for this currency (fallback to USD if not listed)
    large_threshold = large_amount_thresholds.get(currency, 50000)
    medium_threshold = medium_amount_thresholds.get(currency, 10000)

    abs_amount = abs(amount)

    # Increase threshold for large amounts (more risk if wrong)
    if abs_amount > large_threshold:
        base_threshold += 0.1
    elif abs_amount > medium_threshold:
        base_threshold += 0.05

    # Future: Lower threshold for companies that frequently accrue (they're sophisticated)

    return min(base_threshold, 0.9)  # Cap at 0.9


def compute_string_similarity(text1: str, text2: str) -> float:
    """
    Compute fuzzy string similarity between two texts.

    Args:
        text1: First text (e.g., semantic_type_key)
        text2: First text (e.g., COA account name)

    Returns:
        Similarity score (0-1)

    Note:
        Uses simple token-based matching. Can be enhanced with rapidfuzz or similar.
    """
    # Simple token-based matching (can be enhanced with rapidfuzz)
    tokens1 = set(text1.lower().replace("_", " ").split())
    tokens2 = set(text2.lower().replace("_", " ").split())

    if not tokens1 or not tokens2:
        return 0.0

    # Jaccard similarity
    intersection = tokens1.intersection(tokens2)
    union = tokens1.union(tokens2)

    similarity = len(intersection) / len(union) if union else 0.0
    return similarity


def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """
    Compute cosine similarity between two vectors.

    Args:
        vec1: First vector (normalized embedding)
        vec2: Second vector (normalized embedding)

    Returns:
        Cosine similarity (0-1, assuming normalized vectors)

    Note:
        Assumes vectors are already normalized (as they come from sentence-transformers).
    """
    import numpy as np

    v1 = np.array(vec1)
    v2 = np.array(vec2)

    # Dot product (vectors already normalized)
    similarity = float(np.dot(v1, v2))

    # Clamp to [0, 1] range (embeddings from sentence-transformers are normalized)
    return max(0.0, min(1.0, similarity))


def generate_explanation(
    input_data,
    top_recommendation: Optional[object],
    should_accrue: bool,
    confidence_threshold: float,
) -> str:
    """
    Generate human-readable explanation for the accrual decision.

    Args:
        input_data: AccrualResolverInput object
        top_recommendation: Top AccrualRecommendation if any
        should_accrue: Whether accrual is recommended
        confidence_threshold: Threshold used for decision

    Returns:
        Explanation string
    """
    if not should_accrue:
        if input_data.accounting_basis != "modified_accrual_basis":
            return "Cash basis accounting - no accruals needed"

        semantic_type_key = input_data.semantic_type_key
        if not (
            semantic_type_key.startswith("exp_") or semantic_type_key.startswith("rev_")
        ):
            return "Accrual resolution only applies to income/expense accounts"

        accrual_targets = input_data.account_type_metadata.accrual_targets
        if not accrual_targets:
            return "No accrual logic needed for this account type"

        # Check materiality
        txn_amount = input_data.transaction_metadata.get("amount_native", 0)
        currency = input_data.transaction_metadata.get("currency_code", "USD")
        materiality = get_materiality_threshold(currency)

        if abs(txn_amount) < materiality:
            return f"Amount ({currency} {txn_amount:.2f}) below materiality threshold ({currency} {materiality:.2f})"

        return f"No accrual recommendation met confidence threshold ({confidence_threshold:.2f})"

    # Should accrue
    if top_recommendation:
        return (
            f"Recommended {top_recommendation.account_label} "
            f"(confidence: {top_recommendation.score:.2f}, method: {top_recommendation.method})"
        )

    return "Accrual recommended but no specific account selected"
