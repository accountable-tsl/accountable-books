"""Integration tests for models using registry system."""

import json
import tempfile
from pathlib import Path

import pytest

from ml_engine.models.categorization.global_intent_classifier import (
    IntentClassifier,
    get_global_intent_classifier,
)
from ml_engine.models.categorization.tenant_account_ranker import (
    TenantRanker,
    get_tenant_account_ranker,
)
from ml_engine.models.registry import ModelConfig, ModelRegistry
from ml_engine.models.feature_maps import FeatureMapLoader


@pytest.fixture
def temp_registry_structure():
    """Create temporary registry and feature maps structure."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base = Path(tmpdir)
        
        # Create registry structure
        registry_dir = base / "registry"
        configs_dir = registry_dir / "configs"
        (configs_dir / "global_intent_classifier").mkdir(parents=True)
        (configs_dir / "tenant_account_ranker").mkdir(parents=True)
        
        # Create model configs
        intent_config_file = configs_dir / "global_intent_classifier" / "v260101-01-1.0.0.json"
        with open(intent_config_file, "w") as f:
            json.dump({
                "feature_mapping_version": "fmap_a_1.0",
                "artifact_path": None,
                "status": "active",
                "metadata": {"description": "Test classifier"}
            }, f)
        
        ranker_config_file = configs_dir / "tenant_account_ranker" / "v260101-01-1.0.0.json"
        with open(ranker_config_file, "w") as f:
            json.dump({
                "feature_mapping_version": "fmap_b_1.0",
                "artifact_path": None,
                "status": "active",
                "metadata": {"description": "Test ranker"}
            }, f)
        
        # Create feature maps structure
        feature_maps_dir = base / "feature_maps" / "versions"
        feature_maps_dir.mkdir(parents=True)
        
        # Create feature map for Model A
        fmap_a_file = feature_maps_dir / "fmap_a_1.0.json"
        with open(fmap_a_file, "w") as f:
            json.dump({
                "version": "fmap_a_1.0",
                "model_name": "global_intent_classifier",
                "description": "Test feature map A",
                "created_at": "2024-11-27",
                "features": {
                    "text_embedding": {
                        "type": "embedding",
                        "dimension": 384,
                        "source_fields": ["normalized.description"]
                    },
                    "numeric_features": ["raw.amount"]
                }
            }, f)
        
        # Create feature map for Model B
        fmap_b_file = feature_maps_dir / "fmap_b_1.0.json"
        with open(fmap_b_file, "w") as f:
            json.dump({
                "version": "fmap_b_1.0",
                "model_name": "tenant_account_ranker",
                "description": "Test feature map B",
                "created_at": "2024-11-27",
                "features": {
                    "text_embedding": {
                        "type": "embedding",
                        "dimension": 384,
                        "source_fields": ["normalized.description"]
                    },
                    "semantic_intent": ["global_intent.semantic_top1"]
                }
            }, f)
        
        yield {
            "registry_dir": registry_dir,
            "feature_maps_dir": feature_maps_dir
        }


def test_intent_classifier_with_registry(temp_registry_structure):
    """Test IntentClassifier can be initialized with registry config."""
    registry = ModelRegistry(registry_dir=temp_registry_structure["registry_dir"])
    config = registry.get_model_config("global_intent_classifier")
    
    classifier = IntentClassifier(model_config=config)
    assert classifier.model_version == "v260101-01-1.0.0"
    assert classifier.feature_mapping_version == "fmap_a_1.0"
    assert classifier.model_config is not None
    assert classifier.feature_map is not None


def test_intent_classifier_loads_from_registry_by_default(temp_registry_structure, monkeypatch):
    """Test IntentClassifier loads from registry when config not provided."""
    # Mock the default registry path
    import ml_engine.models.registry.model_registry as registry_module
    original_init = ModelRegistry.__init__
    
    def mock_init(self, registry_dir=None):
        if registry_dir is None:
            registry_dir = temp_registry_structure["registry_dir"]
        original_init(self, registry_dir)
    
    monkeypatch.setattr(ModelRegistry, "__init__", mock_init)
    
    # Also mock feature map loader
    import ml_engine.models.feature_maps.loader as loader_module
    original_loader_init = FeatureMapLoader.__init__
    
    def mock_loader_init(self, feature_maps_dir=None):
        if feature_maps_dir is None:
            feature_maps_dir = temp_registry_structure["feature_maps_dir"]
        original_loader_init(self, feature_maps_dir)
    
    monkeypatch.setattr(FeatureMapLoader, "__init__", mock_loader_init)
    
    classifier = IntentClassifier()
    assert classifier.model_version == "v260101-01-1.0.0"
    assert classifier.feature_mapping_version == "fmap_a_1.0"


def test_tenant_ranker_with_registry(temp_registry_structure):
    """Test TenantRanker can be initialized with registry config."""
    registry = ModelRegistry(registry_dir=temp_registry_structure["registry_dir"])
    config = registry.get_model_config("tenant_account_ranker")
    
    ranker = TenantRanker(model_config=config)
    assert ranker.model_version == "v260101-01-1.0.0"
    assert ranker.feature_mapping_version == "fmap_b_1.0"
    assert ranker.model_config is not None
    assert ranker.feature_map is not None


def test_get_global_intent_classifier_with_config(temp_registry_structure):
    """Test get_global_intent_classifier accepts model_config."""
    registry = ModelRegistry(registry_dir=temp_registry_structure["registry_dir"])
    config = registry.get_model_config("global_intent_classifier")
    
    classifier = get_global_intent_classifier(model_config=config)
    assert classifier.model_version == "v260101-01-1.0.0"


def test_get_tenant_account_ranker_with_config(temp_registry_structure):
    """Test get_tenant_account_ranker accepts model_config."""
    registry = ModelRegistry(registry_dir=temp_registry_structure["registry_dir"])
    config = registry.get_model_config("tenant_account_ranker")
    
    ranker = get_tenant_account_ranker(model_config=config)
    assert ranker.model_version == "v260101-01-1.0.0"

