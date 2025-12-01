"""Heuristic tenant account ranker (Model B).

This is the bootstrap, retrieval-style ranker described in apps/ml-engine/note.md.
It is intentionally simple until we add real COA retrieval and history signals.

Process:
- Accepts the enriched transaction and the GlobalIntentClassifier output
- Picks candidate accounts that match the semantic intent key
- Scores using intent confidence (stand-in for embedding/history until wired)
- Returns top-k ranking with schema-compliant TenantAccountRanker payload
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Sequence
from ml_engine.core.embeddings import embed_text, cosine_similarity
import numpy as np

from accountable_contracts.data import default_account_types
from accountable_contracts.schema import (
    EnrichedTransaction,
    Explanation,
    GlobalIntentClassifier,
    RankingTopKItem,
    Reason,
    TenantAccountRanker,
    NewAccountType,
)
from ml_engine.models.registry import ModelConfig, get_model_registry
from ml_engine.models.feature_maps import get_feature_map_loader

MODEL_NAME = "tenant_account_ranker"
TOP_K = 3


@dataclass(frozen=True)
class AccountCandidate:
    """Candidate account slot (proxy until we load tenant COA)."""

    id: str
    label: str
    key: str


class TenantRanker:
    """Simple heuristic ranker for tenant-specific account selection."""

    def __init__(
        self,
        model_config: ModelConfig | None = None,
        *,
        model_version: str | None = None,
        feature_mapping_version: str | None = None,
    ):
        """
        Initialize the tenant ranker.

        Args:
            model_config: Model configuration. If None, loads from registry.
            model_version: Deprecated - use model_config instead. Direct version override.
            feature_mapping_version: Deprecated - use model_config instead. Direct version override.
        """
        # Support deprecated direct version parameters for backward compatibility
        if model_version is not None or feature_mapping_version is not None:
            import warnings
            warnings.warn(
                "Direct version parameters are deprecated. Use model_config instead.",
                DeprecationWarning,
                stacklevel=2,
            )
            if model_config is None:
                # Create a minimal config from deprecated parameters
                model_config = ModelConfig(
                    model_name=MODEL_NAME,
                    version=model_version or "v260101-01-1.0.0",
                    feature_mapping_version=feature_mapping_version or "fmap_b_1.0",
                    artifact_path=None,
                    status="active",
                    metadata={},
                )
        
        # Load from registry if not provided
        if model_config is None:
            registry = get_model_registry()
            model_config = registry.get_model_config(MODEL_NAME)
        
        self.model_config = model_config
        self.model_version = model_config.version
        self.feature_mapping_version = model_config.feature_mapping_version
        
        # Load feature map
        feature_loader = get_feature_map_loader()
        self.feature_map = feature_loader.load_feature_map(self.feature_mapping_version)
        self._account_lookup = self._build_account_lookup()
        # Cache for account embeddings (computed lazily)
        self._account_embeddings_cache: Dict[str, np.ndarray] = {}

    def predict(
        self,
        enriched_transaction: EnrichedTransaction,
        global_intent: GlobalIntentClassifier,
        company_coa: Sequence[Dict[str, Any]] | None = None,
    ) -> TenantAccountRanker:
        start = time.time()

        semantic_key = global_intent.semantic_top1
        intent_prob = global_intent.semantic_top1_prob

        # Try semantic-key filtered candidates first
        candidates = self._candidates_for_key(semantic_key, company_coa)

        # Compute transaction embedding once
        transaction_text = self._combine_transaction_text(enriched_transaction)
        transaction_embedding = embed_text(transaction_text)

        # If no semantic matches, do broader search across all COA
        if not candidates and company_coa:
            # Fallback: search all accounts (filtered embeddings will rank them)
            candidates = [
                AccountCandidate(
                    id=str(a["id"]),
                    label=str(a.get("name") or a.get("accountTypeLabel") or a.get("code") or a["id"]),
                    key=str(a.get("accountTypeKey") or a.get("account_type_key") or ""),
                )
                for a in company_coa
                if not a.get("isDeleted", False)
            ]
            # Use lower intent_prob for broader search (less confidence)
            intent_prob = intent_prob * 0.5

        # Final fallback to generic account type
        if not candidates:
            fallback = self._account_lookup.get("exp_opex_other")
            if fallback:
                candidates = [
                    AccountCandidate(
                        id=fallback["id"],
                        label=fallback["label"],
                        key=fallback["key"],
                    )
                ]

        rankings = self._score_candidates(
            candidates,
            intent_prob,
            transaction_embedding,
            enriched_transaction,
        )

        selected = rankings[0]
        explanation = self._build_explanation(selected)
        shap_values = self._build_shap(intent_prob, selected.reason, selected.score)

        latency_ms = int((time.time() - start) * 1000)

        return TenantAccountRanker(
            model_name=MODEL_NAME,
            model_version=self.model_version,
            latency_ms=latency_ms,
            selected_account_id=selected.account_id,
            selected_account_label=selected.account_label,
            selected_account_score=selected.score,
            ranking_top_k=rankings,
            explanation=explanation,
            shap_values=shap_values,
            feature_mapping_version=self.feature_mapping_version,
        )

    def _combine_transaction_text(
        self, enriched_transaction: EnrichedTransaction
    ) -> str:
        """Combine transaction text fields (same logic as Model A)."""
        normalized = enriched_transaction.normalized
        raw = enriched_transaction.raw
        signals = getattr(enriched_transaction, "signals", None)
        context = getattr(enriched_transaction, "context", None)

        parts: List[str] = []
        parts.append(getattr(normalized, "description", "") or "")
        parts.append(getattr(normalized, "contact_name", "") or "")
        parts.append(getattr(raw, "reference", "") or "")
        parts.append(getattr(normalized, "global_contact_name", "") or "")

        hints = getattr(normalized, "global_contact_category_hints", None)
        if hints:
            parts.append(" ".join(hints))

        if signals and getattr(signals, "notes", None):
            parts.append(" ".join(signals.notes))

        if context and getattr(context, "industry", None):
            parts.append(context.industry)

        return " | ".join(filter(None, parts))

    def _get_account_text(self, candidate: AccountCandidate) -> str:
        """Get text representation of account for embedding."""
        # Use label + any description if available
        # For now, just use label (COA structure may vary)
        return candidate.label.strip()

    def _get_account_embedding(self, candidate: AccountCandidate) -> np.ndarray:
        """Get or compute embedding for an account candidate."""
        cache_key = f"{candidate.id}:{candidate.label}"
        if cache_key not in self._account_embeddings_cache:
            account_text = self._get_account_text(candidate)
            self._account_embeddings_cache[cache_key] = embed_text(account_text)
        return self._account_embeddings_cache[cache_key]

    def _score_candidates(
        self, 
        candidates: List[AccountCandidate], 
        intent_prob: float,
        transaction_embedding: np.ndarray,
        enriched_transaction: EnrichedTransaction,
    ) -> List[RankingTopKItem]:
        """
        Score candidates using three-tier approach:
        1. History (highest priority) - TODO: implement when history available
        2. Embedding match (cosine similarity)
        3. Model A confidence (tie-breaker)
        """
        ranked: List[RankingTopKItem] = []

        # TODO: Check history first (when implemented)
        # For now, skip to embedding match
        
        # Compute embedding similarities for all candidates
        candidate_scores = []
        for candidate in candidates:
            account_embedding = self._get_account_embedding(candidate)
            similarity = cosine_similarity(transaction_embedding, account_embedding)
            candidate_scores.append((candidate, similarity))
        
        # Sort by embedding similarity (descending)
        candidate_scores.sort(key=lambda x: x[1], reverse=True)

        # Build ranked list
        for i, (candidate, embedding_score) in enumerate(candidate_scores[:TOP_K]):
            # Use embedding score as primary, intent_prob as tie-breaker
            # Scale embedding score to 0-1 range (it's already cosine similarity, so -1 to 1)
            # Normalize to 0-1: (similarity + 1) / 2
            normalized_embedding_score = (embedding_score + 1.0) / 2.0
            
            # Combine: 70% embedding, 30% intent confidence
            combined_score = 0.7 * normalized_embedding_score + 0.3 * intent_prob
            
            reason = Reason.embedding_match if embedding_score > 0.3 else Reason.semantic_intent
            
            ranked.append(
                RankingTopKItem(
                    account_id=uuid.UUID(candidate.id),
                    account_label=candidate.label,
                    score=float(combined_score),
                    reason=reason,
                )
            )
        
        if not ranked:
            # Safety net
            ranked.append(
                RankingTopKItem(
                    account_id=uuid.UUID(int=0),
                    account_label="Unknown Account",
                    score=0.0,
                    reason=Reason.semantic_intent,
                )
            )
        
        return ranked


    def _build_shap(
        self, 
        intent_prob: float, 
        reason: Reason,
        final_score: float,
    ) -> Dict[str, float]:
        """Lightweight SHAP-like signals."""
        return {
            "semantic_intent_prob": round(intent_prob, 4),
            "final_score": round(final_score, 4),
            "reason_weight": {
                Reason.semantic_intent: 1.0,
                Reason.history: 0.8,
                Reason.embedding_match: 0.6,
            }.get(reason, 0.5),
        }


    def _candidates_for_key(
        self,
        semantic_key: str,
        company_coa: Sequence[Dict[str, Any]] | None,
    ) -> List[AccountCandidate]:
        """Choose COA candidates matching the semantic key or a safe fallback."""
        
        # Step 1: Filter by semantic key (primary strategy)
        if company_coa:
            matches = [
                AccountCandidate(
                    id=str(a["id"]),
                    label=str(a.get("name") or a.get("accountTypeLabel") or a.get("code") or a["id"]),
                    key=str(a.get("accountTypeKey") or a.get("account_type_key") or ""),
                )
                for a in company_coa
                if str(a.get("accountTypeKey") or a.get("account_type_key") or "") == semantic_key
                and not a.get("isDeleted", False)
            ]
        else:
            matches = [
                AccountCandidate(id=a["id"], label=a["label"], key=a["key"])
                for a in self._account_lookup.values()
                if a["key"] == semantic_key
            ]
        if matches:
            return matches

        # Step 2: If no semantic matches, return empty list
        # The caller (_score_candidates) will handle broader search if needed
        # This keeps the filtering logic separate from scoring logic

        return []

    def _build_account_lookup(self) -> Dict[str, Dict[str, Any]]:
        """Index catalogued account types by key (placeholder for COA)."""
        return {a["key"]: a for a in default_account_types()}

    def _build_explanation(self, selected: RankingTopKItem) -> Explanation:
        reason = selected.reason
        message = {
            Reason.history: "Previously used for this vendor.",
            Reason.embedding_match: "Highest text similarity to account label.",
            Reason.semantic_intent: "Aligned with Model A semantic intent.",
        }.get(reason, "Aligned with semantic intent.")
        return Explanation(reason=reason, message=message)

# Singleton
_TENANT_RANKER: TenantRanker | None = None


def get_tenant_account_ranker(
    model_config: ModelConfig | None = None,
) -> TenantRanker:
    """
    Return a shared tenant ranker instance.
    
    Args:
        model_config: Optional model configuration. If None, loads from registry.
    """
    global _TENANT_RANKER
    if _TENANT_RANKER is None:
        _TENANT_RANKER = TenantRanker(model_config=model_config)
    return _TENANT_RANKER
