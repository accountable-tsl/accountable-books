"""Tests for embeddings module."""

import sys
import numpy as np
import pytest
from unittest.mock import Mock, patch, MagicMock

# Mock sentence_transformers module before importing embeddings
mock_sentence_transformers = MagicMock()
mock_sentence_transformers.SentenceTransformer = Mock
sys.modules['sentence_transformers'] = mock_sentence_transformers

import ml_engine.core.embeddings as embeddings_module


@pytest.fixture(autouse=True)
def reset_embedding_model():
    """Reset the singleton embedding model before each test."""
    embeddings_module._EMBEDDING_MODEL = None
    yield
    embeddings_module._EMBEDDING_MODEL = None


@pytest.fixture
def mock_sentence_transformer():
    """Create a mock SentenceTransformer model."""
    mock_model = Mock()
    mock_model.get_sentence_embedding_dimension.return_value = 384
    
    # Create deterministic embeddings for testing
    # Use a fixed random state for reproducibility
    rng = np.random.RandomState(42)
    mock_embedding = rng.rand(384)
    # Normalize the embedding
    mock_embedding = mock_embedding / np.linalg.norm(mock_embedding)
    
    def encode_side_effect(texts, normalize_embeddings=True, show_progress_bar=False, batch_size=32):
        """Generate deterministic embeddings based on input."""
        if isinstance(texts, str):
            texts = [texts]
        
        # Generate different embeddings for different texts
        results = []
        for i, text in enumerate(texts):
            if not text or not text.strip():
                # Return zero vector for empty text
                results.append(np.zeros(384))
            else:
                # Generate deterministic embedding based on text hash
                rng = np.random.RandomState(hash(text) % 2**32)
                emb = rng.rand(384)
                if normalize_embeddings:
                    emb = emb / np.linalg.norm(emb)
                results.append(emb)
        
        if len(results) == 1:
            return results[0]
        return np.array(results)
    
    mock_model.encode.side_effect = encode_side_effect
    return mock_model


def test_embed_text_empty_string(mock_sentence_transformer):
    """Test that embed_text returns zero vector for empty string."""
    with patch('ml_engine.core.embeddings.SentenceTransformer', return_value=mock_sentence_transformer):
        result = embeddings_module.embed_text("")
        assert isinstance(result, np.ndarray)
        assert result.shape == (384,)
        assert np.allclose(result, np.zeros(384))


def test_embed_text_empty_whitespace(mock_sentence_transformer):
    """Test that embed_text returns zero vector for whitespace-only string."""
    with patch('ml_engine.core.embeddings.SentenceTransformer', return_value=mock_sentence_transformer):
        result = embeddings_module.embed_text("   ")
        assert isinstance(result, np.ndarray)
        assert result.shape == (384,)
        assert np.allclose(result, np.zeros(384))


def test_embed_text_normal(mock_sentence_transformer):
    """Test that embed_text calls model.encode() and returns array."""
    with patch('ml_engine.core.embeddings.SentenceTransformer', return_value=mock_sentence_transformer):
        result = embeddings_module.embed_text("test text")
        assert isinstance(result, np.ndarray)
        assert result.shape == (384,)
        # Verify encode was called
        mock_sentence_transformer.encode.assert_called()
        # Verify the result is normalized (length should be ~1.0)
        assert np.isclose(np.linalg.norm(result), 1.0, atol=1e-6)


def test_embed_texts_empty_list(mock_sentence_transformer):
    """Test that embed_texts returns empty array for empty list."""
    with patch('ml_engine.core.embeddings.SentenceTransformer', return_value=mock_sentence_transformer):
        result = embeddings_module.embed_texts([])
        assert isinstance(result, np.ndarray)
        assert result.shape == (0,)


def test_embed_texts_normal(mock_sentence_transformer):
    """Test that embed_texts processes multiple texts."""
    with patch('ml_engine.core.embeddings.SentenceTransformer', return_value=mock_sentence_transformer):
        texts = ["first text", "second text", "third text"]
        result = embeddings_module.embed_texts(texts)
        assert isinstance(result, np.ndarray)
        assert result.shape == (3, 384)
        # Verify encode was called
        mock_sentence_transformer.encode.assert_called()
        # Verify all embeddings are normalized
        for i in range(3):
            assert np.isclose(np.linalg.norm(result[i]), 1.0, atol=1e-6)


def test_embed_texts_with_empty_strings(mock_sentence_transformer):
    """Test that embed_texts handles empty strings in the list."""
    with patch('ml_engine.core.embeddings.SentenceTransformer', return_value=mock_sentence_transformer):
        texts = ["normal text", "", "   ", "another text"]
        result = embeddings_module.embed_texts(texts)
        assert isinstance(result, np.ndarray)
        assert result.shape == (4, 384)
        # Empty strings should result in zero vectors
        assert np.allclose(result[1], np.zeros(384))
        assert np.allclose(result[2], np.zeros(384))


def test_get_embedding_model_caching(mock_sentence_transformer):
    """Test that get_embedding_model returns singleton (same instance on multiple calls)."""
    with patch('ml_engine.core.embeddings.SentenceTransformer', return_value=mock_sentence_transformer) as mock_st_class:
        model1 = embeddings_module.get_embedding_model()
        model2 = embeddings_module.get_embedding_model()
        assert model1 is model2
        # Verify SentenceTransformer constructor was only called once (singleton pattern)
        assert mock_st_class.call_count == 1


def test_cosine_similarity_normalized():
    """Test that cosine_similarity computes dot product correctly for normalized vectors."""
    # Create two normalized vectors
    vec1 = np.array([1.0, 0.0, 0.0])
    vec2 = np.array([0.0, 1.0, 0.0])
    
    result = embeddings_module.cosine_similarity(vec1, vec2)
    assert isinstance(result, float)
    assert result == 0.0  # Orthogonal vectors


def test_cosine_similarity_identical():
    """Test that identical vectors have similarity of 1.0."""
    # Create a normalized vector
    vec = np.array([1.0, 0.0, 0.0])
    
    result = embeddings_module.cosine_similarity(vec, vec)
    assert isinstance(result, float)
    assert np.isclose(result, 1.0)


def test_cosine_similarity_orthogonal():
    """Test that orthogonal vectors have similarity of 0.0."""
    vec1 = np.array([1.0, 0.0, 0.0])
    vec2 = np.array([0.0, 1.0, 0.0])
    
    result = embeddings_module.cosine_similarity(vec1, vec2)
    assert isinstance(result, float)
    assert np.isclose(result, 0.0)


def test_cosine_similarity_opposite():
    """Test that opposite vectors have similarity of -1.0."""
    vec1 = np.array([1.0, 0.0, 0.0])
    vec2 = np.array([-1.0, 0.0, 0.0])
    
    result = embeddings_module.cosine_similarity(vec1, vec2)
    assert isinstance(result, float)
    assert np.isclose(result, -1.0)


def test_cosine_similarity_partial():
    """Test cosine similarity with partially similar vectors."""
    # Create two vectors at 45 degrees
    vec1 = np.array([1.0, 0.0])
    vec2 = np.array([1.0, 1.0])
    # Normalize vec2
    vec2 = vec2 / np.linalg.norm(vec2)
    
    result = embeddings_module.cosine_similarity(vec1, vec2)
    assert isinstance(result, float)
    # Should be approximately 0.707 (cos(45°))
    assert np.isclose(result, np.cos(np.pi / 4), atol=1e-6)

