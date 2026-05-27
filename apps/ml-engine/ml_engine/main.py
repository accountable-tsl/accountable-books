"""FastAPI application for ML Engine."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ml_engine.domains.prediction.routes import router as prediction_router

from . import __version__

# Load environment variables from .env file
# .env is in apps/ml-engine/.env (2 levels up from this file)
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)
load_dotenv()  # Try loading from current working directory as fallback

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Startup
    try:
        from ml_engine.core.redis_client import get_redis_client

        client = get_redis_client()
        await client.ping()
        logger.info("Redis connection validated on startup")
    except Exception as e:  # noqa: BLE001
        logger.error(f"Redis connection failed on startup: {e}")
        # Optionally raise to fail fast; currently we log and continue.
    
    yield
    
    # Shutdown (if needed in the future)
    # Add cleanup code here if necessary


app = FastAPI(
    title="Accountable Books ML Engine",
    description="AI-native transaction categorization and financial insights",
    version=__version__,
    lifespan=lifespan,
)

BACKEND_URL = os.getenv("BACKEND_URL", "").strip()
REDIS_URL = os.getenv("REDIS_URL", "").strip()

if not BACKEND_URL:
    raise RuntimeError("BACKEND_URL environment variable is required")
if not REDIS_URL:
    raise RuntimeError("REDIS_URL environment variable is required")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[BACKEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    """Root endpoint."""
    return {"service": "ml-engine", "version": __version__, "status": "running"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    try:
        from ml_engine.core.redis_client import get_redis_client

        client = get_redis_client()
        await client.ping()
        redis_status = "connected"
    except Exception as e:  # noqa: BLE001
        redis_status = f"error: {str(e)}"

    return {
        "status": "healthy",
        "service": "ml-engine",
        "version": __version__,
        "redis": redis_status,
    }


app.include_router(prediction_router, prefix="/api/v1")


def main():
    """Entry point for running the server."""
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
