from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import bcrypt
from ai_engineering_company_project_monorepo.services.user_service import get_user_by_id
from ai_engineering_company_project_monorepo.services.user_service import get_user_by_email


def test_reset_password_happy_path_is_single_use(
    auth_api_client, register_auth_user, monkeypatch
):
    register_auth_user("reset@example.com", "original-password")
    sent_tokens: list[str] = []
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.send_password_reset_email",
        lambda email, token: sent_tokens.append(token) or True,
    )
    auth_api_client.post("/auth/forgot-password", json={"email": "reset@example.com"})

    reset = auth_api_client.post(
        "/auth/reset-password",
        json={"token": sent_tokens[0], "new_password": "new-valid-password"},
    )
    reused = auth_api_client.post(
        "/auth/reset-password",
        json={"token": sent_tokens[0], "new_password": "another-password"},
    )

    assert reset.status_code == 200
    assert reused.status_code == 400
    user = get_user_by_email(auth_api_client.app.state.database, "reset@example.com")
    assert user is not None
    assert bcrypt.checkpw(b"new-valid-password", user.hashed_password.encode("ascii"))
    assert auth_api_client.app.state.database.table("password_reset_tokens").all() == []


def test_reset_password_boundary_preserves_user_and_pending_token(
    auth_api_client, register_auth_user, monkeypatch
):
    user_data = register_auth_user("reset-boundary@example.com", "original-password")
    sent_tokens: list[str] = []
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.send_password_reset_email",
        lambda email, token: sent_tokens.append(token) or True,
    )
    auth_api_client.post("/auth/forgot-password", json={"email": "reset-boundary@example.com"})
    database = auth_api_client.app.state.database
    original_user = get_user_by_id(database, user_data["id"])
    assert original_user is not None

    auth_api_client.post(
        "/auth/reset-password",
        json={"token": sent_tokens[0], "new_password": "a" * 73},
    )

    user_after = get_user_by_id(database, user_data["id"])
    assert user_after is not None
    assert user_after.hashed_password == original_user.hashed_password
    assert len(database.table("password_reset_tokens").all()) == 1


def test_reset_password_invalid_or_expired_token_returns_bad_request(
    auth_api_client, make_auth_token, register_auth_user
):
    user = register_auth_user("expired-reset@example.com")
    original_user = get_user_by_id(auth_api_client.app.state.database, user["id"])
    assert original_user is not None
    expired = make_auth_token(
        user["id"],
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )

    auth_api_client.post(
        "/auth/reset-password",
        json={"token": expired, "new_password": "new-valid-password"},
    )

    user_after = get_user_by_id(auth_api_client.app.state.database, user["id"])
    assert user_after is not None
    assert user_after.hashed_password == original_user.hashed_password


def test_reset_password_configuration_failure_preserves_password_and_token(
    auth_api_client, register_auth_user, monkeypatch
):
    user_data = register_auth_user("reset-config@example.com", "original-password")
    sent_tokens: list[str] = []
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.send_password_reset_email",
        lambda email, token: sent_tokens.append(token) or True,
    )
    auth_api_client.post("/auth/forgot-password", json={"email": "reset-config@example.com"})
    monkeypatch.delenv("JWT_SECRET_KEY")

    auth_api_client.post(
        "/auth/reset-password",
        json={"token": sent_tokens[0], "new_password": "new-valid-password"},
    )

    database = auth_api_client.app.state.database
    user = get_user_by_id(database, user_data["id"])
    assert user is not None
    # La configuración fallida debe dejar intactos tanto la credencial como el reset pendiente.
    assert user.hashed_password == database.table("password_reset_tokens").all()[0]["password_hash"]
    assert len(database.table("password_reset_tokens").all()) == 1
    assert any(event["event"] == "reset_failed" for event in database.table("password_reset_audit").all())