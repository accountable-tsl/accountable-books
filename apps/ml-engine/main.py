"""FastAPI application for ML Engine."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import version directly to avoid relative import issues in tests
try:
    from . import __version__
except ImportError:
    # Fallback for when running as script or in tests
    __version__ = "0.1.0"

app = FastAPI(
    title="Accountable Books ML Engine",
    description="AI-native transaction categorization and financial insights",
    version=__version__,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    """Root endpoint."""
    return {
        "service": "ml-engine",
        "version": __version__,
        "status": "running"
    }


@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "ml-engine",
        "version": __version__
    }


def main():
    """Entry point for running the server."""
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()