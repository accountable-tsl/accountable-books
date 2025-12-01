# ML Engine

AI-native machine learning service for Accountable Books platform.

## Features

- Transaction categorization using machine learning
- Financial insights and predictions
- Model versioning and explainability
- RESTful API built with FastAPI

## Development

### Local Development

Development is handled locally using Poetry. Ensure you have Redis running locally (via Docker Compose at the project root or standalone).

```bash
# Install dependencies
poetry install

# Run development server
poetry run uvicorn ml_engine.main:app --reload --host 0.0.0.0 --port 8000

# Or use the npm script
pnpm dev

# Run tests
poetry run pytest

# Format code
poetry run black .
poetry run ruff check .
```

**Note**: Infrastructure (PostgreSQL, Redis) should be running via Docker Compose at the project root. The ML Engine itself runs locally for faster iteration.

### Production Deployment

The production Dockerfile uses a multi-stage build for optimized image size:

```bash
# Build production image
docker build -t ml-engine:latest .

# Run production container
docker run -p 8002:8002 --env ENV=production ml-engine:latest
```

## Architecture

- **FastAPI**: Modern Python web framework
- **scikit-learn**: Machine learning models
- **Pydantic**: Data validation and serialization
- **Poetry**: Dependency management

## Model Versioning System

The ML engine uses a versioning system with three components:

### Config Files (`models/registry/configs/`)

JSON metadata files that describe each model version. They specify:

- Model version number
- Which feature map version to use
- Path to the model artifact file (or `null` for code-based models)
- Status (active/deprecated/experimental)
- Additional metadata (description, creation date, etc.)

**Example:** `configs/global_intent_classifier/v260101-01-1.0.0.json`

### Artifacts (`models/registry/artifacts/`)

Binary files containing trained model parameters (`.pkl` or `.joblib` files).
Currently empty since models are code-based. Will contain actual trained models (e.g., LightGBM) in the future.

**Example:** `artifacts/global_intent_classifier/2024.12.01.01.pkl` (future)

### Feature Maps (`models/feature_maps/versions/`)

JSON files that define exactly which features (inputs) each model version uses.
Enables reproducibility and explainability by tracking which transaction fields were used for predictions.

**Example:** `feature_maps/versions/fmap_a_1.0.json` lists all features used by Model A version 1.0.

### Environment Variables for Model Versioning

You can override the active model version using environment variables:

- `MODEL_VERSION_GLOBAL_INTENT_CLASSIFIER`: Version to use for Model A
- `MODEL_VERSION_TENANT_ACCOUNT_RANKER`: Version to use for Model B

If not set, the system uses the latest version in the registry.

## Environment Variables

- `REDIS_URL`: Redis connection URL (required)
- `BACKEND_URL`: Backend API URL (required)
