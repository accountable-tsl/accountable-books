"""Test health endpoints."""

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_root():
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "ml-engine"
    assert data["status"] == "running"
    assert "version" in data


def test_health():
    """Test health endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "ml-engine"
    assert "version" in data