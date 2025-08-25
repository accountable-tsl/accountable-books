# Build from pruned context: turbo prune --scope=@accountable-books/ml-engine --docker --out-dir .pruned/ml
ARG APP_DIR=.pruned/ml

FROM python:3.11-slim AS builder
ENV PIP_NO_CACHE_DIR=1 \
    POETRY_VERSION=1.8.3 \
    POETRY_HOME="/opt/poetry" \
    PATH="$POETRY_HOME/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
RUN python -m pip install --no-cache-dir "poetry==${POETRY_VERSION}"
WORKDIR /app
# copy only deps files from pruned tree for cache
COPY ${APP_DIR}/apps/ml-engine/pyproject.toml ./pyproject.toml
COPY ${APP_DIR}/apps/ml-engine/poetry.lock ./poetry.lock
RUN poetry config virtualenvs.create false
RUN poetry install --no-dev --no-interaction --no-ansi

# Runtime
FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
# Add small runtime deps; libgomp1 is required by many scientific wheels
RUN apt-get update && apt-get install -y --no-install-recommends curl libgomp1 \
  && rm -rf /var/lib/apt/lists/*
# non-root
RUN groupadd --gid 1000 appuser && useradd --uid 1000 --gid appuser --create-home --shell /bin/bash appuser
WORKDIR /app
# site-packages and console scripts from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
# app code from pruned tree
COPY ${APP_DIR}/apps/ml-engine/ ./
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1
CMD ["python","-m","uvicorn","main:app","--host","0.0.0.0","--port","8000"]
