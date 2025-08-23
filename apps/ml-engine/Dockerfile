FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# system deps (if needed)
RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl && rm -rf /var/lib/apt/lists/*

# poetry
RUN pip install --no-cache-dir poetry==1.8.3
COPY apps/ml-engine/pyproject.toml apps/ml-engine/poetry.lock* ./ 
RUN poetry config virtualenvs.create false && poetry install --no-interaction --no-ansi --only main

COPY apps/ml-engine /app
EXPOSE 8000
CMD ["uvicorn","ml_engine.main:app","--host","0.0.0.0","--port","8000"]
