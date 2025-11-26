# ML Engine

AI-native machine learning service for Accountable Books platform.

## Features

- Transaction categorization using machine learning
- Financial insights and predictions
- Model versioning and explainability
- RESTful API built with FastAPI

## Development

### Local Development (without Docker)

```bash
# Install dependencies
poetry install

# Run development server
poetry run uvicorn ml_engine.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
poetry run pytest

# Format code
poetry run black .
poetry run ruff check .
```

### Docker Development

#### Using Root Docker Compose (Recommended)

For development, use the root-level `docker-compose.dev.yml`:

```bash
# From the project root directory
docker-compose -f docker-compose.dev.yml up ml-engine

# Run the full development stack
docker-compose -f docker-compose.dev.yml up

# View logs
docker-compose -f docker-compose.dev.yml logs -f ml-engine

# Stop the service
docker-compose -f docker-compose.dev.yml down
```

#### Using Docker directly

```bash
# Build development image
docker build -f infra/docker/Dockerfile.dev -t ml-engine-dev .

# Run development container with hot reload
docker run -p 8002:8002 -v $(pwd):/app ml-engine-dev

# Or for production build
docker build -t ml-engine .
docker run -p 8002:8002 ml-engine
```

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
