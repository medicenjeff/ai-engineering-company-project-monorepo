from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from ai_engineering_company_project_monorepo.api.main import app


AUTH_TEST_SECRET = "auth-endpoint-tests-only-secret"


@pytest.fixture
def auth_api_client(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("JWT_SECRET_KEY", AUTH_TEST_SECRET)
    monkeypatch.setenv("TINYDB_PATH", str(tmp_path / "auth-endpoints.json"))
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


@pytest.fixture
def register_auth_user(auth_api_client) -> Callable[..., dict]:
    def register(email: str = "auth-test@example.com", password: str = "original-password", **profile) -> dict:
        response = auth_api_client.post(
            "/users",
            json={"email": email, "password": password, **profile},
        )
        assert response.status_code == 201
        return response.json()

    return register


@pytest.fixture
def make_auth_token() -> Callable[..., str]:
    def make(user_id: str, *, expires_at: datetime | None = None) -> str:
        claims: dict[str, object] = {"sub": user_id}
        if expires_at is not None:
            claims["exp"] = expires_at
        return jwt.encode(claims, AUTH_TEST_SECRET, algorithm="HS256")

    return make


@pytest.fixture
def auth_headers(make_auth_token) -> Callable[..., dict[str, str]]:
    def headers(user_id: str, *, expires_at: datetime | None = None) -> dict[str, str]:
        token = make_auth_token(user_id, expires_at=expires_at)
        return {"Authorization": f"Bearer {token}"}

    return headers


@pytest.fixture
def expired_auth_headers(auth_headers) -> Callable[[str], dict[str, str]]:
    def headers(user_id: str) -> dict[str, str]:
        return auth_headers(
            user_id,
            expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        )

    return headers