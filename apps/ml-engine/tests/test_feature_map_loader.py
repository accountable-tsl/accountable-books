"""Tests for FeatureMapLoader."""

import json
import tempfile
from pathlib import Path

import pytest

from ml_engine.models.feature_maps import FeatureMapLoader, get_feature_map_loader


@pytest.fixture
def temp_feature_maps_dir():
    """Create a temporary feature maps directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        feature_maps_dir = Path(tmpdir) / "versions"
        feature_maps_dir.mkdir(parents=True)
        
        # Create test feature map
        feature_map_file = feature_maps_dir / "fmap_v1.json"
        feature_map_data = {
            "version": "fmap_v1",
            "model_name": "test_model",
            "description": "Test feature map",
            "created_at": "2024-01-01",
            "features": {
                "numeric_features": ["amount", "quantity"],
                "categorical_features": ["category", "type"],
                "binary_flags": ["flag1", "flag2"]
            }
        }
        with open(feature_map_file, "w") as f:
            json.dump(feature_map_data, f)
        
        # Create another feature map with list structure
        feature_map_file_2 = feature_maps_dir / "fmap_v2.json"
        feature_map_data_2 = {
            "version": "fmap_v2",
            "model_name": "test_model",
            "description": "Test feature map v2",
            "created_at": "2024-01-02",
            "features": ["feature1", "feature2", "feature3"]
        }
        with open(feature_map_file_2, "w") as f:
            json.dump(feature_map_data_2, f)
        
        yield feature_maps_dir


def test_feature_map_loader_initialization(temp_feature_maps_dir):
    """Test FeatureMapLoader initialization."""
    loader = FeatureMapLoader(feature_maps_dir=temp_feature_maps_dir)
    assert loader.feature_maps_dir == temp_feature_maps_dir


def test_feature_map_loader_load_feature_map(temp_feature_maps_dir):
    """Test loading a feature map."""
    loader = FeatureMapLoader(feature_maps_dir=temp_feature_maps_dir)
    feature_map = loader.load_feature_map("fmap_v1")
    assert feature_map["version"] == "fmap_v1"
    assert feature_map["model_name"] == "test_model"
    assert "features" in feature_map


def test_feature_map_loader_caching(temp_feature_maps_dir):
    """Test that feature maps are cached."""
    loader = FeatureMapLoader(feature_maps_dir=temp_feature_maps_dir)
    # Load first time
    feature_map1 = loader.load_feature_map("fmap_v1")
    # Load second time - should use cache
    feature_map2 = loader.load_feature_map("fmap_v1")
    assert feature_map1 is feature_map2  # Same object reference


def test_feature_map_loader_get_feature_list_dict_structure(temp_feature_maps_dir):
    """Test getting feature list from dict structure."""
    loader = FeatureMapLoader(feature_maps_dir=temp_feature_maps_dir)
    features = loader.get_feature_list("fmap_v1")
    assert "amount" in features
    assert "quantity" in features
    assert "category" in features
    assert "type" in features
    assert "flag1" in features
    assert "flag2" in features


def test_feature_map_loader_get_feature_list_list_structure(temp_feature_maps_dir):
    """Test getting feature list from list structure."""
    loader = FeatureMapLoader(feature_maps_dir=temp_feature_maps_dir)
    features = loader.get_feature_list("fmap_v2")
    assert features == ["feature1", "feature2", "feature3"]


def test_feature_map_loader_get_feature_details(temp_feature_maps_dir):
    """Test getting full feature map details."""
    loader = FeatureMapLoader(feature_maps_dir=temp_feature_maps_dir)
    details = loader.get_feature_details("fmap_v1")
    assert details["version"] == "fmap_v1"
    assert details["model_name"] == "test_model"
    assert "description" in details
    assert "created_at" in details
    assert "features" in details


def test_feature_map_loader_missing_file(temp_feature_maps_dir):
    """Test error when feature map file not found."""
    loader = FeatureMapLoader(feature_maps_dir=temp_feature_maps_dir)
    with pytest.raises(FileNotFoundError, match="Feature map 'missing' not found"):
        loader.load_feature_map("missing")


def test_feature_map_loader_invalid_json(temp_feature_maps_dir):
    """Test error when JSON is invalid."""
    loader = FeatureMapLoader(feature_maps_dir=temp_feature_maps_dir)
    # Create invalid JSON file
    invalid_file = temp_feature_maps_dir / "invalid.json"
    with open(invalid_file, "w") as f:
        f.write("invalid json {")
    
    with pytest.raises(ValueError, match="Invalid JSON"):
        loader.load_feature_map("invalid")


def test_feature_map_loader_missing_version_field(temp_feature_maps_dir):
    """Test error when version field is missing."""
    loader = FeatureMapLoader(feature_maps_dir=temp_feature_maps_dir)
    # Create feature map without version field
    invalid_file = temp_feature_maps_dir / "no_version.json"
    with open(invalid_file, "w") as f:
        json.dump({"model_name": "test"}, f)
    
    with pytest.raises(ValueError, match="missing 'version' field"):
        loader.load_feature_map("no_version")


def test_feature_map_loader_version_mismatch(temp_feature_maps_dir):
    """Test error when version in file doesn't match filename."""
    loader = FeatureMapLoader(feature_maps_dir=temp_feature_maps_dir)
    # Create feature map with mismatched version
    invalid_file = temp_feature_maps_dir / "mismatch.json"
    with open(invalid_file, "w") as f:
        json.dump({"version": "different_version"}, f)
    
    with pytest.raises(ValueError, match="version mismatch"):
        loader.load_feature_map("mismatch")


def test_get_feature_map_loader_singleton():
    """Test that get_feature_map_loader returns singleton."""
    loader1 = get_feature_map_loader()
    loader2 = get_feature_map_loader()
    assert loader1 is loader2


def test_feature_map_loader_shipped_fmap_a():
    """Test that shipped fmap_a_1.0.json loads and has required fields."""
    loader = get_feature_map_loader()  # Use default loader pointing to actual versions directory
    feature_map = loader.load_feature_map("fmap_a_1.0")
    
    # Assert required top-level fields
    assert "version" in feature_map
    assert feature_map["version"] == "fmap_a_1.0"
    assert "model_name" in feature_map
    assert feature_map["model_name"] == "global_intent_classifier"
    assert "features" in feature_map
    
    # Assert text_embedding structure
    assert "text_embedding" in feature_map["features"]
    text_embedding = feature_map["features"]["text_embedding"]
    assert "type" in text_embedding
    assert text_embedding["type"] == "embedding"
    assert "dimension" in text_embedding
    assert text_embedding["dimension"] == 384
    assert "source_fields" in text_embedding
    assert isinstance(text_embedding["source_fields"], list)
    assert len(text_embedding["source_fields"]) > 0


def test_feature_map_loader_shipped_fmap_b():
    """Test that shipped fmap_b_1.0.json loads and has required fields."""
    loader = get_feature_map_loader()  # Use default loader pointing to actual versions directory
    feature_map = loader.load_feature_map("fmap_b_1.0")
    
    # Assert required top-level fields
    assert "version" in feature_map
    assert feature_map["version"] == "fmap_b_1.0"
    assert "model_name" in feature_map
    assert feature_map["model_name"] == "tenant_account_ranker"
    assert "features" in feature_map
    
    # Assert text_embedding structure
    assert "text_embedding" in feature_map["features"]
    text_embedding = feature_map["features"]["text_embedding"]
    assert "type" in text_embedding
    assert text_embedding["type"] == "embedding"
    assert "dimension" in text_embedding
    assert text_embedding["dimension"] == 384
    assert "source_fields" in text_embedding
    assert isinstance(text_embedding["source_fields"], list)
    
    # Assert model-specific features
    assert "semantic_intent" in feature_map["features"]
    assert isinstance(feature_map["features"]["semantic_intent"], list)
    assert "history_signals" in feature_map["features"]
    assert isinstance(feature_map["features"]["history_signals"], list)

