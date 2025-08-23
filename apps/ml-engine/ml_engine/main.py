from fastapi import FastAPI

from . import __version__


app = FastAPI(title="Accountable Books ML Engine", version=__version__)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ml-engine", "version": __version__}

