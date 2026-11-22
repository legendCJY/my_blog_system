from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_liveness_does_not_require_database() -> None:
    with TestClient(create_app(Settings(database_url=None, _env_file=None))) as client:
        response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_reports_missing_database() -> None:
    with TestClient(create_app(Settings(database_url=None, _env_file=None))) as client:
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "database": "unavailable"}
