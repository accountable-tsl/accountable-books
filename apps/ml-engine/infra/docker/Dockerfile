# ---- contracts builder ----
FROM node:24-alpine AS contracts-builder
WORKDIR /workspace
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json packages/contracts/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --filter @accountable-books/contracts...

COPY packages/contracts packages/contracts

RUN pnpm --filter @accountable-books/contracts build

# ---- builder ----
FROM python:3.13-slim AS builder
ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
RUN python -m pip install --no-cache-dir uv

WORKDIR /workspace/apps/ml-engine

# Copy uv files and built contracts package (generated pydantic + data)
COPY apps/ml-engine/pyproject.toml apps/ml-engine/uv.lock ./
COPY --from=contracts-builder /workspace/packages/contracts /workspace/packages/contracts

# Install runtime dependencies into project virtualenv
RUN uv sync --frozen --no-dev

# ---- runtime ----
FROM python:3.13-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/workspace/apps/ml-engine \
    PATH="/workspace/apps/ml-engine/.venv/bin:$PATH"

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends curl libgomp1 \
  && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid 1000 appuser && useradd --uid 1000 --gid appuser --create-home --shell /bin/bash appuser

WORKDIR /workspace/apps/ml-engine

# Copy installed virtualenv and local editable dependency source
COPY --from=builder /workspace/apps/ml-engine/.venv /workspace/apps/ml-engine/.venv
COPY --from=builder /workspace/packages/contracts /workspace/packages/contracts

# Copy application code
COPY apps/ml-engine /workspace/apps/ml-engine

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["python", "-m", "uvicorn", "ml_engine.main:app", "--host", "0.0.0.0", "--port", "8000"]
