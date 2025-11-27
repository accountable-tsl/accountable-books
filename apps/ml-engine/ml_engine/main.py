"""FastAPI application for ML Engine."""

import logging
import os
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ml_engine.domains.prediction.routes import router as prediction_router
from schema import MlPredictionResponse

from . import __version__

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Accountable Books ML Engine",
    description="AI-native transaction categorization and financial insights",
    version=__version__,
)

BACKEND_URL = os.getenv("BACKEND_URL", "").strip()

if not BACKEND_URL:
    raise RuntimeError("BACKEND_URL environment variable is required")

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
def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": "ml-engine", "version": __version__}


app.include_router(prediction_router, prefix="/api/v1")

def main():
    """Entry point for running the server."""
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
