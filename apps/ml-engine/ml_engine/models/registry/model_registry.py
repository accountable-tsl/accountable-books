"""Model registry for dynamic model version management."""

import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Model version pattern: v{YYMMDD}-{sequence}-{major}.{minor}.{patch}
# Example: v260101-01-1.0.0
MODEL_VERSION_PATTERN = re.compile(r'^v\d{6}-\d{2}-\d+\.\d+\.\d+$')


@dataclass
class ModelConfig:
    """Configuration for a model version."""

    model_name: str
    version: str
    feature_mapping_version: str
    artifact_path: Optional[Path]  # Path to .pkl/.joblib file (None for code-based models)
    status: str  # "active", "deprecated", "experimental"
    metadata: Dict  # Additional metadata (training date, accuracy, etc.)

    @classmethod
    def from_dict(cls, data: Dict) -> "ModelConfig":
        """Create ModelConfig from dictionary."""
        version = data["version"]
        # Validate version format
        if not MODEL_VERSION_PATTERN.match(version):
            raise ValueError(
                f"Invalid model version format: '{version}'. "
                f"Expected format: v{{YYMMDD}}-{{sequence}}-{{major}}.{{minor}}.{{patch}} "
                f"(e.g., v260101-01-1.0.0)"
            )
        
        artifact_path = None
        if data.get("artifact_path"):
            artifact_path = Path(data["artifact_path"])
        return cls(
            model_name=data["model_name"],
            version=version,
            feature_mapping_version=data["feature_mapping_version"],
            artifact_path=artifact_path,
            status=data.get("status", "active"),
            metadata=data.get("metadata", {}),
        )


class ModelRegistry:
    """Registry for managing model versions."""

    def __init__(self, registry_dir: Optional[Path] = None):
        """
        Initialize model registry.

        Args:
            registry_dir: Path to registry directory. Defaults to ml_engine/models/registry
        """
        if registry_dir is None:
            # Default to ml_engine/models/registry relative to this file
            base_dir = Path(__file__).parent
            registry_dir = base_dir

        self.registry_dir = Path(registry_dir)
        self.configs_dir = self.registry_dir / "configs"
        self.artifacts_dir = self.registry_dir / "artifacts"
        self._cache: Dict[str, Dict[str, ModelConfig]] = {}
        self._load_all_configs()

    def _load_all_configs(self) -> None:
        """Load all model configurations from configs directory."""
        if not self.configs_dir.exists():
            logger.warning(
                f"Registry configs directory does not exist: {self.configs_dir}"
            )
            return

        for model_dir in self.configs_dir.iterdir():
            if not model_dir.is_dir():
                continue

            model_name = model_dir.name
            self._cache[model_name] = {}

            for config_file in model_dir.glob("*.json"):
                version = config_file.stem  # filename without .json
                # Validate version format from filename
                if not MODEL_VERSION_PATTERN.match(version):
                    logger.warning(
                        f"Skipping config file with invalid version format: {config_file} "
                        f"(version: {version}). Expected format: v{{YYMMDD}}-{{sequence}}-{{major}}.{{minor}}.{{patch}}"
                    )
                    continue
                try:
                    with open(config_file, "r") as f:
                        config_data = json.load(f)
                        config_data["model_name"] = model_name
                        config_data["version"] = version
                        config = ModelConfig.from_dict(config_data)
                        self._cache[model_name][version] = config
                        logger.debug(
                            f"Loaded config for {model_name} v{version}"
                        )
                except Exception as e:
                    logger.error(
                        f"Failed to load config {config_file}: {e}",
                        exc_info=True,
                    )

    def get_model_config(
        self, model_name: str, version: Optional[str] = None
    ) -> ModelConfig:
        """
        Get model configuration.

        Args:
            model_name: Name of the model (e.g., "global_intent_classifier")
            version: Specific version to load. If None, uses active version.

        Returns:
            ModelConfig for the specified model and version

        Raises:
            ValueError: If model or version not found
        """
        if model_name not in self._cache:
            raise ValueError(f"Model '{model_name}' not found in registry")

        if version is None:
            version = self.get_active_version(model_name)

        if version not in self._cache[model_name]:
            raise ValueError(
                f"Version '{version}' not found for model '{model_name}'"
            )

        return self._cache[model_name][version]

    def get_active_version(self, model_name: str) -> str:
        """
        Get active version for a model.

        Checks environment variable MODEL_VERSION_{MODEL_NAME} first,
        then falls back to latest version in registry.

        Args:
            model_name: Name of the model

        Returns:
            Active version string
        """
        # Check environment variable
        env_var = f"MODEL_VERSION_{model_name.upper()}"
        env_version = os.getenv(env_var)
        if env_version:
            if model_name in self._cache and env_version in self._cache[model_name]:
                logger.info(
                    f"Using version {env_version} for {model_name} from {env_var}"
                )
                return env_version
            else:
                logger.warning(
                    f"Version {env_version} from {env_var} not found, using latest"
                )

        # Fall back to latest version (highest by string comparison)
        if model_name not in self._cache or not self._cache[model_name]:
            raise ValueError(
                f"No versions found for model '{model_name}' in registry"
            )

        versions = sorted(self._cache[model_name].keys(), reverse=True)
        latest = versions[0]
        logger.debug(f"Using latest version {latest} for {model_name}")
        return latest

    def list_versions(self, model_name: str) -> list[str]:
        """List all available versions for a model."""
        if model_name not in self._cache:
            return []
        return sorted(self._cache[model_name].keys(), reverse=True)


# Singleton registry instance
_registry: Optional[ModelRegistry] = None


def get_model_registry() -> ModelRegistry:
    """Get or create the model registry singleton."""
    global _registry
    if _registry is None:
        _registry = ModelRegistry()
    return _registry

