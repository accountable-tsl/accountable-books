"""Heuristic global intent classifier (Model A).

This implements the light-weight, explainable classifier described in
apps/ml-engine/note.md. It is intentionally simple (TF-IDF similarity over the
trainable semantic account types) so we have a working, debuggable baseline
while the real LightGBM model is being trained. The classifier:

- loads the canonical account type catalogue (shared contracts package)
- filters to trainable + semantic labels (Model A's training target space)
- builds a TF-IDF vectorizer over the label/description texts
- scores an enriched transaction by cosine similarity to those texts
- returns top-k intent predictions with metadata and lightweight SHAP-style
  feature attributions for visibility
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Sequence

import numpy as np
from accountable_contracts.schema import (
    EnrichedTransaction,
    GlobalIntentClassifier as GlobalIntentClassifierOutput,
    Key,
    LabelRole,
    SemanticTopKItem,
)
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from accountable_contracts.data import default_account_types
from ml_engine.models.registry import ModelConfig, get_model_registry
from ml_engine.models.feature_maps import get_feature_map_loader


MODEL_NAME = "global_intent_classifier"
TOP_K = 5


@dataclass(frozen=True)
class AccountType:
    """Normalized account type entry pulled from the contracts catalogue."""

    key: str
    label: str
    description: str
    label_role: str
    trainable: bool

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AccountType":
        return cls(
            key=data["key"],
            label=data["label"],
            description=data.get("description") or "",
            label_role=data["label_role"],
            trainable=bool(data.get("trainable", False)),
        )


class IntentClassifier:
    """Simple text-similarity based global intent classifier (Model A)."""

    def __init__(
        self,
        model_config: ModelConfig | None = None,
        *,
        model_version: str | None = None,
        feature_mapping_version: str | None = None,
    ):
        """
        Initialize the intent classifier.

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
                    feature_mapping_version=feature_mapping_version or "fmap_a_1.0",
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

        all_accounts = [
            AccountType.from_dict(entry) for entry in default_account_types()
        ]
        self.semantic_accounts: List[AccountType] = [
            a
            for a in all_accounts
            if a.trainable and a.label_role == "semantic"
        ]
        self.fallback_account: AccountType | None = next(
            (a for a in all_accounts if a.label_role == "fallback"), None
        )

        self._vectorizer = TfidfVectorizer(
            stop_words="english", lowercase=True
        )
        corpus = [self._account_text(a) for a in self.semantic_accounts]
        self._account_matrix = self._vectorizer.fit_transform(corpus)

    def predict(
        self, enriched_transaction: EnrichedTransaction
    ) -> GlobalIntentClassifierOutput:
        """
        Generate top-k semantic intent predictions.

        Args:
            enriched_transaction: EnrichedTransaction payload

        Returns:
            Dict matching GlobalIntentClassifierOutput (see note.md)
        """
        start_time = time.time()

        feature_text = self._combine_text_fields(enriched_transaction)
        feature_flags = self._extract_flags(enriched_transaction)

        text_vector = self._vectorizer.transform([feature_text])
        similarities = self._score(text_vector)

        top_predictions = self._build_ranked_predictions(similarities)
        shap_values = self._build_shap_values(
            feature_text, similarities, feature_flags
        )

        latency_ms = int((time.time() - start_time) * 1000)

        return GlobalIntentClassifierOutput(
            model_name=MODEL_NAME,
            model_version=self.model_version,
            latency_ms=latency_ms,
            semantic_top1=top_predictions[0].key.value,
            semantic_top1_prob=top_predictions[0].prob,
            semantic_top_k=top_predictions,
            shap_values=shap_values,
            feature_mapping_version=self.feature_mapping_version,
        )

    def _score(self, text_vector) -> np.ndarray:
        """Compute cosine similarity scores against account label corpus."""
        # Cosine similarity against pre-computed account matrix
        sims = cosine_similarity(text_vector, self._account_matrix)[0]
        sims = np.maximum(sims, 0)  # enforce non-negative
        if sims.sum() == 0:
            # If nothing matched, fall back to a uniform distribution
            sims = np.full_like(sims, 1 / len(self.semantic_accounts))
        else:
            sims = sims / sims.sum()
        return sims

    def _build_ranked_predictions(
        self, probabilities: np.ndarray
    ) -> List[SemanticTopKItem]:
        """Construct top-k prediction list with optional fallback appended."""
        ranked_indices = probabilities.argsort()[::-1]
        entries: List[SemanticTopKItem] = []
        for idx in ranked_indices[: TOP_K - 1]:
            account = self.semantic_accounts[idx]
            entries.append(
                SemanticTopKItem(
                    key=Key(account.key),
                    prob=float(probabilities[idx]),
                    label_role=LabelRole(account.label_role),
                )
            )

        if self.fallback_account:
            entries.append(
                SemanticTopKItem(
                    key=Key(self.fallback_account.key),
                    prob=0.0,
                    label_role=LabelRole(self.fallback_account.label_role),
                )
            )

        # Ensure we never return an empty list
        if not entries:
            entries.append(
                SemanticTopKItem(
                    key=Key("exp_opex_other"),
                    prob=0.0,
                    label_role=LabelRole.semantic,
                )
            )

        return entries[:TOP_K]

    def _account_text(self, account: AccountType) -> str:
        """Canonical text used to represent an account type."""
        return f"{account.label} {account.description}".strip()

    def _combine_text_fields(
        self, enriched_transaction: EnrichedTransaction
    ) -> str:
        """Concatenate text fields into a single model input string."""
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

    def _extract_flags(
        self, enriched_transaction: EnrichedTransaction
    ) -> Dict[str, float]:
        """Extract numeric/boolean features for debugging explanations."""
        raw = enriched_transaction.raw
        temporal = getattr(enriched_transaction, "temporal", None)
        signals = getattr(enriched_transaction, "signals", None)
        normalized = enriched_transaction.normalized
        context = getattr(enriched_transaction, "context", None)

        contact_confidence = getattr(normalized, "contact_match_confidence", "")
        if hasattr(contact_confidence, "value"):
            contact_confidence = contact_confidence.value

        confidence_score = {
            "unmatched": 0,
            "low": 1,
            "medium": 2,
            "high": 3,
        }.get(str(contact_confidence), 0)

        return {
            "amount_native": float(getattr(raw, "amount", 0.0)),
            "day_of_week": float(
                getattr(temporal, "day_of_week", 0) if temporal else 0
            ),
            "calendar_month": float(
                getattr(temporal, "calendar_month", 0) if temporal else 0
            ),
            "calendar_quarter": float(
                getattr(temporal, "calendar_quarter", 0) if temporal else 0
            ),
            "fiscal_month": float(
                getattr(temporal, "fiscal_month", 0) if temporal else 0
            ),
            "fiscal_quarter": float(
                getattr(temporal, "fiscal_quarter", 0) if temporal else 0
            ),
            "contact_match_confidence": float(confidence_score),
            "currency_code": 1.0
            if getattr(raw, "currency_code", None)
            == getattr(context, "reporting_currency_code", None)
            else 0.0,
            "likely_trf_btw_accounts": float(
                getattr(signals, "likely_trf_btw_accounts", False) or 0
            ),
            "likely_split": float(
                getattr(signals, "likely_split", False) or 0
            ),
            "requires_vat_check": float(
                getattr(signals, "requires_vat_check", False) or 0
            ),
            "requires_fx_review": float(
                getattr(signals, "requires_fx_review", False) or 0
            ),
        }

    def _build_shap_values(
        self,
        feature_text: str,
        probabilities: Sequence[float],
        feature_flags: Dict[str, float],
    ) -> Dict[str, float]:
        """
        Produce lightweight SHAP-style feature contributions.

        These are heuristic scores intended to surface the key inputs the model
        considered. They are not true SHAP calculations but align with the
        output contract required by Model A.
        """
        text_signal = min(
            1.0, math.log1p(len(feature_text.split())) / 5.0
        )  # rough proxy
        top_prob = float(np.max(probabilities)) if len(probabilities) else 0.0

        shap = {
            "embeddings_similarity": round(top_prob, 4),
            "text_coverage": round(text_signal, 4),
        }
        # Add a few numeric/flag features for transparency
        for name in [
            "amount_native",
            "day_of_week",
            "calendar_month",
            "contact_match_confidence",
            "likely_trf_btw_accounts",
        ]:
            shap[name] = round(float(feature_flags.get(name, 0.0)), 4)

        return shap


# Singleton classifier instance for reuse
_GLOBAL_CLASSIFIER: IntentClassifier | None = None


def get_global_intent_classifier(
    model_config: ModelConfig | None = None,
) -> IntentClassifier:
    """
    Return a shared classifier instance.
    
    Args:
        model_config: Optional model configuration. If None, loads from registry.
    """
    global _GLOBAL_CLASSIFIER
    if _GLOBAL_CLASSIFIER is None:
        _GLOBAL_CLASSIFIER = IntentClassifier(model_config=model_config)
    return _GLOBAL_CLASSIFIER
