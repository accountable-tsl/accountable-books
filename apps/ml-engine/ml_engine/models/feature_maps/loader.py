"""Feature map loader for versioned feature definitions."""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class FeatureMapLoader:
    """Loads and validates feature mapping versions."""

    def __init__(self, feature_maps_dir: Optional[Path] = None):
        """
        Initialize feature map loader.

        Args:
            feature_maps_dir: Path to feature maps directory.
                Defaults to ml_engine/models/feature_maps/versions
        """
        if feature_maps_dir is None:
            # Default to ml_engine/models/feature_maps/versions relative to this file
            base_dir = Path(__file__).parent
            feature_maps_dir = base_dir / "versions"

        self.feature_maps_dir = Path(feature_maps_dir)
        self._cache: Dict[str, Dict] = {}

    def load_feature_map(self, version: str) -> Dict:
        """
        Load feature map by version.

        Args:
            version: Feature map version (e.g., "fmap_a_1.0")

        Returns:
            Feature map dictionary

        Raises:
            FileNotFoundError: If feature map file not found
            ValueError: If feature map is invalid
        """
        if version in self._cache:
            return self._cache[version]

        # Try to find the file
        feature_map_file = self.feature_maps_dir / f"{version}.json"
        if not feature_map_file.exists():
            raise FileNotFoundError(
                f"Feature map '{version}' not found at {feature_map_file}"
            )

        try:
            with open(feature_map_file, "r") as f:
                feature_map = json.load(f)
                # Validate structure
                if "version" not in feature_map:
                    raise ValueError(
                        f"Feature map {version} missing 'version' field"
                    )
                if feature_map["version"] != version:
                    raise ValueError(
                        f"Feature map version mismatch: expected {version}, "
                        f"got {feature_map['version']}"
                    )
                self._cache[version] = feature_map
                logger.debug(f"Loaded feature map {version}")
                return feature_map
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in feature map {version}: {e}") from e

    def get_feature_list(self, version: str) -> List[str]:
        """
        Get list of feature names for a version.

        Args:
            version: Feature map version

        Returns:
            List of feature names
        """
        feature_map = self.load_feature_map(version)
        features = feature_map.get("features", {})
        
        # Handle different feature map structures
        if isinstance(features, list):
            return features
        elif isinstance(features, dict):
            # Flatten nested structure
            feature_list = []
            for category, items in features.items():
                if isinstance(items, list):
                    feature_list.extend(items)
                else:
                    feature_list.append(category)
            return feature_list
        else:
            return []

    def get_feature_details(self, version: str) -> Dict:
        """
        Get full feature map details including metadata.

        Args:
            version: Feature map version

        Returns:
            Complete feature map dictionary
        """
        return self.load_feature_map(version)


# Singleton loader instance
_loader: Optional[FeatureMapLoader] = None


def get_feature_map_loader() -> FeatureMapLoader:
    """Get or create the feature map loader singleton."""
    global _loader
    if _loader is None:
        _loader = FeatureMapLoader()
    return _loader

