"""Tests for ModelRegistry."""

import json
import os
import tempfile
from pathlib import Path

import pytest

from ml_engine.models.registry import ModelConfig, ModelRegistry, get_model_registry


@pytest.fixture
def temp_registry_dir():
    """Create a temporary registry directory structure."""
    with tempfile.TemporaryDirectory() as tmpdir:
        registry_dir = Path(tmpdir)
        configs_dir = registry_dir / "configs"
        artifacts_dir = registry_dir / "artifacts"
        
        # Create directories
        (configs_dir / "test_model").mkdir(parents=True)
        (artifacts_dir / "test_model").mkdir(parents=True)
        
        # Create test config with valid version pattern vYYMMDD-SS-X.Y.Z
        config_file = configs_dir / "test_model" / "v260101-01-1.0.0.json"
        config_data = {
            "feature_mapping_version": "fmap_v1",
            "artifact_path": None,
            "status": "active",
            "metadata": {"description": "Test model"}
        }
        with open(config_file, "w") as f:
            json.dump(config_data, f)
        
        # Create another version
        config_file_2 = configs_dir / "test_model" / "v260102-01-2.0.0.json"
        config_data_2 = {
            "feature_mapping_version": "fmap_v2",
            "artifact_path": None,
            "status": "active",
            "metadata": {"description": "Test model v2"}
        }
        with open(config_file_2, "w") as f:
            json.dump(config_data_2, f)
        
        yield registry_dir


def test_model_registry_initialization(temp_registry_dir):
    """Test ModelRegistry initialization."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    assert registry.registry_dir == temp_registry_dir
    assert registry.configs_dir == temp_registry_dir / "configs"
    assert registry.artifacts_dir == temp_registry_dir / "artifacts"


def test_model_registry_loads_configs(temp_registry_dir):
    """Test that registry loads configs from directory."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    assert "test_model" in registry._cache
    assert "v260101-01-1.0.0" in registry._cache["test_model"]
    assert "v260102-01-2.0.0" in registry._cache["test_model"]


def test_model_registry_get_model_config(temp_registry_dir):
    """Test getting model config by name and version."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    config = registry.get_model_config("test_model", "v260101-01-1.0.0")
    assert config.model_name == "test_model"
    assert config.version == "v260101-01-1.0.0"
    assert config.feature_mapping_version == "fmap_v1"
    assert config.status == "active"


def test_model_registry_get_model_config_defaults_to_active(temp_registry_dir):
    """Test getting model config defaults to active version."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    config = registry.get_model_config("test_model")
    # Should default to latest version (v260102-01-2.0.0)
    assert config.version == "v260102-01-2.0.0"
    assert config.feature_mapping_version == "fmap_v2"


def test_model_registry_get_active_version_env_var(temp_registry_dir, monkeypatch):
    """Test that get_active_version respects environment variable."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    monkeypatch.setenv("MODEL_VERSION_TEST_MODEL", "v260101-01-1.0.0")
    version = registry.get_active_version("test_model")
    assert version == "v260101-01-1.0.0"


def test_model_registry_get_active_version_fallback(temp_registry_dir):
    """Test that get_active_version falls back to latest if env var not set."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    version = registry.get_active_version("test_model")
    assert version == "v260102-01-2.0.0"  # Latest version


def test_model_registry_list_versions(temp_registry_dir):
    """Test listing all versions for a model."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    versions = registry.list_versions("test_model")
    assert "v260101-01-1.0.0" in versions
    assert "v260102-01-2.0.0" in versions
    assert versions[0] == "v260102-01-2.0.0"  # Should be sorted descending


def test_model_registry_missing_model(temp_registry_dir):
    """Test error when model not found."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    with pytest.raises(ValueError, match="Model 'missing_model' not found"):
        registry.get_model_config("missing_model")


def test_model_registry_missing_version(temp_registry_dir):
    """Test error when version not found."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    with pytest.raises(ValueError, match="Version 'v260103-01-3.0.0' not found"):
        registry.get_model_config("test_model", "v260103-01-3.0.0")


def test_model_registry_invalid_json(temp_registry_dir):
    """Test that invalid JSON files are handled gracefully."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    # Create invalid JSON file
    invalid_file = temp_registry_dir / "configs" / "test_model" / "invalid.json"
    with open(invalid_file, "w") as f:
        f.write("invalid json content {")
    
    # Should not crash, but log error
    registry._load_all_configs()
    # Invalid file should not be in cache
    assert "invalid" not in registry._cache["test_model"]


def test_model_config_from_dict():
    """Test ModelConfig.from_dict creation."""
    data = {
        "model_name": "test",
        "version": "v260101-01-1.0.0",
        "feature_mapping_version": "fmap_v1",
        "artifact_path": None,
        "status": "active",
        "metadata": {"key": "value"}
    }
    config = ModelConfig.from_dict(data)
    assert config.model_name == "test"
    assert config.version == "v260101-01-1.0.0"
    assert config.feature_mapping_version == "fmap_v1"
    assert config.artifact_path is None
    assert config.status == "active"
    assert config.metadata == {"key": "value"}


def test_model_config_from_dict_with_artifact_path():
    """Test ModelConfig.from_dict with artifact path."""
    data = {
        "model_name": "test",
        "version": "v260101-01-1.0.0",
        "feature_mapping_version": "fmap_v1",
        "artifact_path": "artifacts/test/v260101-01-1.0.0.pkl",
        "status": "active",
        "metadata": {}
    }
    config = ModelConfig.from_dict(data)
    assert config.artifact_path == Path("artifacts/test/v260101-01-1.0.0.pkl")


def test_get_model_registry_singleton():
    """Test that get_model_registry returns singleton."""
    registry1 = get_model_registry()
    registry2 = get_model_registry()
    assert registry1 is registry2


def test_model_config_from_dict_invalid_version_plain_semver():
    """Test that ModelConfig.from_dict raises ValueError for plain semantic version."""
    data = {
        "model_name": "test",
        "version": "1.0.0",
        "feature_mapping_version": "fmap_v1",
        "artifact_path": None,
        "status": "active",
        "metadata": {}
    }
    with pytest.raises(ValueError, match="Invalid model version format"):
        ModelConfig.from_dict(data)


def test_model_config_from_dict_invalid_version_missing_date():
    """Test that ModelConfig.from_dict raises ValueError for missing date prefix."""
    data = {
        "model_name": "test",
        "version": "v01-1.0.0",
        "feature_mapping_version": "fmap_v1",
        "artifact_path": None,
        "status": "active",
        "metadata": {}
    }
    with pytest.raises(ValueError, match="Invalid model version format"):
        ModelConfig.from_dict(data)


def test_model_config_from_dict_invalid_version_invalid_date():
    """Test that ModelConfig.from_dict raises ValueError for invalid date format."""
    data = {
        "model_name": "test",
        "version": "v25000-01-1.0.0",
        "feature_mapping_version": "fmap_v1",
        "artifact_path": None,
        "status": "active",
        "metadata": {}
    }
    with pytest.raises(ValueError, match="Invalid model version format"):
        ModelConfig.from_dict(data)


def test_model_config_from_dict_invalid_version_missing_sequence():
    """Test that ModelConfig.from_dict raises ValueError for missing sequence."""
    data = {
        "model_name": "test",
        "version": "v260101-1.0.0",
        "feature_mapping_version": "fmap_v1",
        "artifact_path": None,
        "status": "active",
        "metadata": {}
    }
    with pytest.raises(ValueError, match="Invalid model version format"):
        ModelConfig.from_dict(data)


def test_model_registry_skips_invalid_version_filename(temp_registry_dir):
    """Test that _load_all_configs skips config files with invalid version patterns."""
    # Create config file with invalid version pattern in filename
    invalid_file = temp_registry_dir / "configs" / "test_model" / "1.0.0.json"
    config_data = {
        "feature_mapping_version": "fmap_v1",
        "artifact_path": None,
        "status": "active",
        "metadata": {}
    }
    with open(invalid_file, "w") as f:
        json.dump(config_data, f)
    
    # Create another invalid pattern
    invalid_file_2 = temp_registry_dir / "configs" / "test_model" / "v01-1.0.0.json"
    with open(invalid_file_2, "w") as f:
        json.dump(config_data, f)
    
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    # Invalid files should not be in cache
    assert "1.0.0" not in registry._cache["test_model"]
    assert "v01-1.0.0" not in registry._cache["test_model"]
    # Valid files should still be loaded
    assert "v260101-01-1.0.0" in registry._cache["test_model"]
    assert "v260102-01-2.0.0" in registry._cache["test_model"]


def test_model_registry_get_active_version_env_var_invalid_fallback(temp_registry_dir, monkeypatch):
    """Test that invalid env var version falls back to latest with warning."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    monkeypatch.setenv("MODEL_VERSION_TEST_MODEL", "v999999-99-9.9.9")
    # Should fall back to latest version since env var version doesn't exist
    version = registry.get_active_version("test_model")
    assert version == "v260102-01-2.0.0"  # Latest version


def test_model_registry_get_active_version_env_var_takes_precedence(temp_registry_dir, monkeypatch):
    """Test that env var takes precedence over latest version."""
    registry = ModelRegistry(registry_dir=temp_registry_dir)
    # Set env var to older version
    monkeypatch.setenv("MODEL_VERSION_TEST_MODEL", "v260101-01-1.0.0")
    version = registry.get_active_version("test_model")
    assert version == "v260101-01-1.0.0"
    
    # Verify it's actually used when getting config
    config = registry.get_model_config("test_model")
    assert config.version == "v260101-01-1.0.0"
    assert config.feature_mapping_version == "fmap_v1"

