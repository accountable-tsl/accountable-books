"""Sentence transformer embeddings for semantic similarity.

Uses all-MiniLM-L6-v2 as specified in note.md - fast, small, and effective
for text similarity tasks without requiring training data.
"""

from __future__ import annotations

import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List

# Singleton model instance
_EMBEDDING_MODEL: SentenceTransformer | None = None


def get_embedding_model() -> SentenceTransformer:
    """Return singleton sentence transformer model."""
    global _EMBEDDING_MODEL
    if _EMBEDDING_MODEL is None:
        _EMBEDDING_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _EMBEDDING_MODEL


def embed_text(text: str) -> np.ndarray:
    """Generate 384-dim embedding for a single text string."""
    if not text or not text.strip():
        # Return zero vector for empty text
        model = get_embedding_model()
        return np.zeros(model.get_sentence_embedding_dimension())
    
    model = get_embedding_model()
    embedding = model.encode(text, normalize_embeddings=True, show_progress_bar=False)
    return np.array(embedding)


def embed_texts(texts: List[str]) -> np.ndarray:
    """Generate embeddings for multiple texts (batch processing)."""
    if not texts:
        return np.array([])
    
    # Filter empty texts
    non_empty = [t if t and t.strip() else "" for t in texts]
    
    model = get_embedding_model()
    embeddings = model.encode(
        non_empty, 
        normalize_embeddings=True, 
        show_progress_bar=False,
        batch_size=32
    )
    return np.array(embeddings)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two normalized embeddings."""
    # Since embeddings are normalized, cosine similarity = dot product
    return float(np.dot(a, b))