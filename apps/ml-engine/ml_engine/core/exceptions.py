"""Custom exceptions for ML Engine."""


class PredictionError(Exception):
    """Base exception for prediction-related errors."""

    pass


class ModelLoadError(PredictionError):
    """Raised when ML model fails to load."""

    pass


class PredictionServiceError(PredictionError):
    """Raised when prediction service encounters an error."""

    pass

