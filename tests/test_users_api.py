import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlsplit
from urllib.error import HTTPError

import bcrypt
import pytest
from fastapi.testclient import TestClient
from jose import jwt
from tinydb import TinyDB

from ai_engineering_company_project_monorepo.api.main import app
from ai_engineering_company_project_monorepo.models.user import UserRole
from ai_engineering_company_project_monorepo.services.email_service import send_password_reset_email
from ai_engineering_company_project_monorepo.services.password_reset import (
    accept_password_reset_request,
    create_password_reset_token,
    get_reset_signing_key,
    reset_password,
)
from ai_engineering_company_project_monorepo.services.profile_service import (
    create_profile,
    get_profile_by_user_id,
)
from ai_engineering_company_project_monorepo.services.user_service import (
    create_user,
    get_user_by_email,
    get_user_by_id,
)


JWT_SECRET = "test-secret-key"


@pytest.fixture
def email_api_key(monkeypatch: pytest.MonkeyPatch) -> str:
    api_key = token_urlsafe(32)
    monkeypatch.setenv("RESEND_API_KEY", api_key)
    return api_key


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("JWT_SECRET_KEY", JWT_SECRET)
    monkeypatch.setenv("TINYDB_PATH", str(tmp_path / "users.json"))
    with TestClient(app) as test_client:
        yield test_client


def auth_headers(user_id: str) -> dict[str, str]:
    token = jwt.encode({"sub": user_id}, JWT_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


def test_register_hashes_password_and_creates_profile(client: TestClient) -> None:
    response = client.post(
        "/users",
        json={
            "email": "new@example.com",
            "password": "a-secure-password",
            "name": "New User",
            "phone": "+1 555 0100",
            "address": "1 Main Street",
        },
    )

    assert response.status_code == 201
    assert "hashed_password" not in response.json()
    assert response.json()["role"] == UserRole.USER.value

    database = client.app.state.database
    user = get_user_by_email(database, "new@example.com")
    assert user is not None
    assert bcrypt.checkpw(b"a-secure-password", user.hashed_password.encode("ascii"))
    profile = get_profile_by_user_id(database, user.id)
    assert profile is not None
    assert profile.id
    assert profile.user_id == user.id
    assert (profile.name, profile.phone, profile.address) == (
        "New User",
        "+1 555 0100",
        "1 Main Street",
    )
    assert response.json()["profile"]["id"] == profile.id


def test_user_reads_require_authentication_and_update_permissions(client: TestClient) -> None:
    database = client.app.state.database
    member = create_user(database, email="member@example.com", hashed_password="hash")
    target = create_user(database, email="target@example.com", hashed_password="hash")
    admin = create_user(
        database,
        email="admin@example.com",
        hashed_password="hash",
        role=UserRole.ADMIN.value,
    )

    assert client.get("/users").status_code == 401
    headers = auth_headers(member.id)
    assert client.get("/users", headers=headers).status_code == 403
    assert client.get("/users", headers=auth_headers(admin.id)).status_code == 200
    assert client.get(f"/users/{target.id}", headers=headers).status_code == 403
    assert client.get(f"/users/{target.id}", headers=auth_headers(admin.id)).status_code == 200

    self_update = client.put(
        f"/users/{member.id}",
        headers=headers,
        json={"email": "member-updated@example.com", "password": "another-secure-password"},
    )
    assert self_update.status_code == 200
    assert "hashed_password" not in self_update.json()
    updated_member = get_user_by_id(database, member.id)
    assert updated_member is not None
    assert bcrypt.checkpw(
        b"another-secure-password",
        updated_member.hashed_password.encode("ascii"),
    )

    assert client.put(
        f"/users/{member.id}",
        headers=headers,
        json={"role": "admin"},
    ).status_code == 403
    assert client.put(
        f"/users/{target.id}",
        headers=headers,
        json={"email": "stolen@example.com"},
    ).status_code == 403

    admin_update = client.put(
        f"/users/{target.id}",
        headers=auth_headers(admin.id),
        json={"role": "manager"},
    )
    assert admin_update.status_code == 200
    assert admin_update.json()["role"] == UserRole.MANAGER.value


def test_delete_user_removes_linked_profile(client: TestClient) -> None:
    database = client.app.state.database
    user = create_user(database, email="delete@example.com", hashed_password="hash")
    caller = create_user(database, email="caller@example.com", hashed_password="hash")
    create_profile(database, user_id=user.id, name="Delete Me")

    forbidden = client.delete(f"/users/{user.id}", headers=auth_headers(caller.id))
    assert forbidden.status_code == 403
    assert get_user_by_id(database, user.id) is not None
    assert get_profile_by_user_id(database, user.id) is not None

    response = client.delete(f"/users/{user.id}", headers=auth_headers(user.id))

    assert response.status_code == 204
    assert get_user_by_id(database, user.id) is None
    assert get_profile_by_user_id(database, user.id) is None
    assert client.delete(
        f"/users/{user.id}",
        headers=auth_headers(caller.id),
    ).status_code == 404


def test_profile_me_requires_auth_and_only_updates_own_profile(client: TestClient) -> None:
    database = client.app.state.database
    user = create_user(database, email="profile@example.com", hashed_password="hash")
    other_user = create_user(database, email="other-profile@example.com", hashed_password="hash")
    profile = create_profile(
        database,
        user_id=user.id,
        name="Original Name",
        phone="555-0100",
        address="Original Address",
    )
    other_profile = create_profile(database, user_id=other_user.id, name="Other User")

    assert client.get("/profiles/me").status_code == 401

    headers = auth_headers(user.id)
    response = client.get("/profiles/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == profile.id
    assert response.json()["user_id"] == user.id

    update = client.put(
        "/profiles/me",
        headers=headers,
        json={"name": "Updated Name", "phone": None},
    )
    assert update.status_code == 200
    assert update.json()["name"] == "Updated Name"
    assert update.json()["phone"] is None
    assert update.json()["address"] == "Original Address"

    attempted_transfer = client.put(
        "/profiles/me",
        headers=headers,
        json={"name": "Unauthorized", "user_id": other_user.id},
    )
    assert attempted_transfer.status_code == 422
    assert get_profile_by_user_id(database, other_user.id) == other_profile


def test_login_returns_access_token_and_auth_me_returns_profile(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "7")
    registration = client.post(
        "/users",
        json={
            "email": "login@example.com",
            "password": "correct-horse-battery",
            "name": "Login User",
            "phone": "555-0199",
            "address": "9 Account Road",
        },
    )
    assert registration.status_code == 201

    login = client.post(
        "/auth/login",
        json={"email": "LOGIN@example.com", "password": "correct-horse-battery"},
    )
    assert login.status_code == 200
    token_data = login.json()
    assert token_data["token_type"] == "bearer"
    assert token_data["expires_in"] == 420
    claims = jwt.decode(token_data["access_token"], JWT_SECRET, algorithms=["HS256"])

    me = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token_data['access_token']}"},
    )
    assert me.status_code == 200
    assert me.json() == {
        "email": "login@example.com",
        "role": UserRole.USER.value,
        "profile": {
            "name": "Login User",
            "phone": "555-0199",
            "address": "9 Account Road",
        },
    }
    assert claims["sub"] == registration.json()["id"]
    assert client.get("/auth/me").status_code == 401

    invalid_login = client.post(
        "/auth/login",
        json={"email": "login@example.com", "password": "incorrect-password"},
    )
    assert invalid_login.status_code == 401


def test_login_rejects_missing_secret_and_invalid_expiration(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client.post(
        "/users",
        json={"email": "no-secret@example.com", "password": "correct-horse-battery"},
    )
    monkeypatch.delenv("JWT_SECRET_KEY")

    response = client.post(
        "/auth/login",
        json={"email": "no-secret@example.com", "password": "correct-horse-battery"},
    )

    assert response.status_code == 500

    monkeypatch.setenv("JWT_SECRET_KEY", JWT_SECRET)
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "0")
    invalid_expiration = client.post(
        "/auth/login",
        json={"email": "no-secret@example.com", "password": "correct-horse-battery"},
    )
    assert invalid_expiration.status_code == 500


def test_password_reset_flow_and_single_use(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sent_emails = []
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.send_password_reset_email",
        lambda email, token: sent_emails.append((email, token)),
    )
    client.post("/users", json={"email": "reset@example.com", "password": "original-password"})
    unknown = client.post("/auth/forgot-password", json={"email": "unknown@example.com"})
    assert unknown.status_code == 200
    assert sent_emails == []
    known = client.post("/auth/forgot-password", json={"email": "RESET@example.com"})
    assert known.status_code == 200
    assert known.json() == unknown.json()
    assert len(sent_emails) == 1
    email, token = sent_emails[0]
    assert email == "reset@example.com"
    claims = jwt.decode(token, get_reset_signing_key(), algorithms=["HS256"])
    assert 1795 <= claims["exp"] - datetime.now(timezone.utc).timestamp() <= 1800
    assert token not in str(known.json())
    assert token not in str(client.app.state.database.table("password_reset_tokens").all())
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    reset = client.post("/auth/reset-password", json={"token": token, "new_password": "new-password"})
    assert reset.status_code == 200
    assert client.post(
        "/auth/reset-password", json={"token": token, "new_password": "another-password"}
    ).status_code == 400
    assert client.post(
        "/auth/login", json={"email": email, "password": "original-password"}
    ).status_code == 401
    assert client.post(
        "/auth/login", json={"email": email, "password": "new-password"}
    ).status_code == 200
    user = get_user_by_email(client.app.state.database, email)
    assert bcrypt.checkpw(b"new-password", user.hashed_password.encode("ascii"))
    assert client.app.state.database.table("password_reset_tokens").all() == []


@pytest.mark.parametrize("invalid_kind", ["malformed", "signature", "expired", "missing-exp", "access", "purpose", "superseded", "password-changed", "deleted"])
def test_password_reset_rejects_invalid_tokens(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, invalid_kind: str
) -> None:
    sent_tokens = []
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.send_password_reset_email",
        lambda email, token: sent_tokens.append(token),
    )
    registration = client.post("/users", json={"email": "invalid@example.com", "password": "original-password"})
    client.post("/auth/forgot-password", json={"email": "invalid@example.com"})
    token = sent_tokens[0]
    claims = jwt.decode(token, get_reset_signing_key(), algorithms=["HS256"])
    if invalid_kind == "malformed":
        token = "not-a-jwt"
    elif invalid_kind == "signature":
        token = jwt.encode(claims, "wrong-key", algorithm="HS256")
    elif invalid_kind == "expired":
        claims["exp"] = datetime.now(timezone.utc) - timedelta(minutes=1)
        token = jwt.encode(claims, get_reset_signing_key(), algorithm="HS256")
    elif invalid_kind == "missing-exp":
        claims.pop("exp")
        token = jwt.encode(claims, get_reset_signing_key(), algorithm="HS256")
    elif invalid_kind == "access":
        token = jwt.encode({"sub": registration.json()["id"]}, JWT_SECRET, algorithm="HS256")
    elif invalid_kind == "purpose":
        claims["purpose"] = "access"
        token = jwt.encode(claims, get_reset_signing_key(), algorithm="HS256")
    elif invalid_kind == "superseded":
        client.post("/auth/forgot-password", json={"email": "invalid@example.com"})
    elif invalid_kind == "password-changed":
        client.put(
            f"/users/{registration.json()['id']}",
            headers=auth_headers(registration.json()["id"]),
            json={"password": "changed-password"},
        )
    elif invalid_kind == "deleted":
        client.delete(f"/users/{registration.json()['id']}", headers=auth_headers(registration.json()["id"]))
    response = client.post("/auth/reset-password", json={"token": token, "new_password": "new-password"})
    assert response.status_code == 400
    if invalid_kind != "deleted":
        user = get_user_by_email(client.app.state.database, "invalid@example.com")
        expected_password = b"changed-password" if invalid_kind == "password-changed" else b"original-password"
        assert bcrypt.checkpw(expected_password, user.hashed_password.encode("ascii"))


@pytest.mark.parametrize("password", ["short", "a" * 73, "\u00e9" * 37])
def test_password_reset_validates_new_password(client: TestClient, password: str) -> None:
    assert client.post(
        "/auth/reset-password", json={"token": "invalid", "new_password": password}
    ).status_code == 422


def test_change_password_updates_only_authenticated_user_and_invalidates_reset_link(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent_tokens = []
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.send_password_reset_email",
        lambda email, token: sent_tokens.append(token),
    )
    registration = client.post(
        "/users", json={"email": "change@example.com", "password": "original-password"}
    )
    other_user = create_user(client.app.state.database, email="other@example.com", hashed_password="hash")
    login_response = client.post(
        "/auth/login", json={"email": "change@example.com", "password": "original-password"}
    )
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}
    client.post("/auth/forgot-password", json={"email": "change@example.com"})
    response = client.post(
        "/auth/change-password",
        headers=headers,
        json={"current_password": "original-password", "new_password": "changed-password"},
    )
    assert response.status_code == 200
    assert response.json() == {"message": "Password changed successfully."}
    user = get_user_by_id(client.app.state.database, registration.json()["id"])
    assert user is not None
    assert bcrypt.checkpw(b"changed-password", user.hashed_password.encode("ascii"))
    assert get_user_by_id(client.app.state.database, other_user.id) == other_user
    assert client.post(
        "/auth/login", json={"email": "change@example.com", "password": "original-password"}
    ).status_code == 401
    assert client.post(
        "/auth/login", json={"email": "change@example.com", "password": "changed-password"}
    ).status_code == 200
    assert client.app.state.database.table("password_reset_tokens").all() == []
    assert client.post(
        "/auth/reset-password", json={"token": sent_tokens[0], "new_password": "another-password"}
    ).status_code == 400


@pytest.mark.parametrize("current_password", ["incorrect-password", "a" * 73, ""])
def test_change_password_rejects_wrong_current_password_without_updates(
    client: TestClient, current_password: str
) -> None:
    registration = client.post(
        "/users", json={"email": "wrong-current@example.com", "password": "original-password"}
    )
    user_id = registration.json()["id"]
    original_user = get_user_by_id(client.app.state.database, user_id)
    response = client.post(
        "/auth/change-password", headers=auth_headers(user_id),
        json={"current_password": current_password, "new_password": "changed-password"},
    )
    assert response.status_code == 400
    assert get_user_by_id(client.app.state.database, user_id) == original_user


@pytest.mark.parametrize("token_kind", ["missing", "invalid", "expired", "inactive", "reset"])
def test_change_password_requires_valid_session(client: TestClient, token_kind: str) -> None:
    user = create_user(
        client.app.state.database, email="session@example.com", hashed_password="hash",
        is_active=token_kind != "inactive",
    )
    headers = auth_headers(user.id)
    if token_kind == "missing":
        headers = {}
    elif token_kind == "invalid":
        headers = {"Authorization": "Bearer invalid-token"}
    elif token_kind == "expired":
        token = jwt.encode(
            {"sub": user.id, "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
            JWT_SECRET, algorithm="HS256",
        )
        headers = {"Authorization": f"Bearer {token}"}
    elif token_kind == "reset":
        token = create_password_reset_token(client.app.state.database, user)
        headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/auth/change-password", headers=headers,
        json={"current_password": "original-password", "new_password": "changed-password"},
    )
    assert response.status_code == 401
    assert get_user_by_id(client.app.state.database, user.id) == user


@pytest.mark.parametrize("password", ["short", "a" * 73, "\u00e9" * 37])
def test_change_password_validates_new_password(client: TestClient, password: str) -> None:
    user = create_user(client.app.state.database, email="validation@example.com", hashed_password="hash")
    assert client.post(
        "/auth/change-password", headers=auth_headers(user.id),
        json={"current_password": "original-password", "new_password": password},
    ).status_code == 422


def test_password_reset_is_single_use_under_concurrent_requests(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent_tokens = []
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.send_password_reset_email",
        lambda email, token: sent_tokens.append(token),
    )
    client.post("/users", json={"email": "concurrent@example.com", "password": "original-password"})
    client.post("/auth/forgot-password", json={"email": "concurrent@example.com"})

    def attempt_reset(password: str) -> int:
        return client.post(
            "/auth/reset-password", json={"token": sent_tokens[0], "new_password": password}
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(attempt_reset, ["first-password", "second-password"]))
    assert sorted(results) == [200, 400]


def test_password_reset_token_state_survives_database_reopen(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET_KEY", JWT_SECRET)
    path = tmp_path / "reset.json"
    with TinyDB(path) as database:
        user = create_user(database, email="persist@example.com", hashed_password="old-hash")
        token = create_password_reset_token(database, user)
    with TinyDB(path) as database:
        reset_password(database, token, "new-password")
    with TinyDB(path) as database:
        with pytest.raises(ValueError):
            reset_password(database, token, "another-password")


@pytest.mark.parametrize("minutes", ["0", "14", "61", "invalid"])
def test_forgot_password_configuration_errors_do_not_reveal_user(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, minutes: str
) -> None:
    monkeypatch.setenv("PASSWORD_RESET_EXPIRE_MINUTES", minutes)
    client.post("/users", json={"email": "config@example.com", "password": "original-password"})
    known = client.post("/auth/forgot-password", json={"email": "config@example.com"})
    unknown = client.post("/auth/forgot-password", json={"email": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


@pytest.mark.parametrize("payload", [{}, {"email": "not-an-email"}, {"email": None}, {"email": 123}, {"email": "valid@example.com", "unexpected": True}, []])
def test_forgot_password_invalid_bodies_return_generic_200(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, payload
) -> None:
    lookup = MagicMock()
    monkeypatch.setattr("ai_engineering_company_project_monorepo.api.auth.get_user_by_email", lookup)
    response = client.post("/auth/forgot-password", json=payload)
    assert response.status_code == 200
    assert response.json() == {"message": "If the email is registered, a password reset link will be sent."}
    lookup.assert_not_called()


def test_forgot_password_malformed_json_returns_generic_200(client: TestClient) -> None:
    response = client.post("/auth/forgot-password", content="{", headers={"Content-Type": "application/json"})
    assert response.status_code == 200
    assert response.json() == {"message": "If the email is registered, a password reset link will be sent."}
    assert client.post("/auth/login", json={"email": "not-an-email"}).status_code == 422
    assert client.post("/auth/reset-password", json={}).status_code == 422


@pytest.mark.parametrize("failure_stage", ["lookup", "token", "email"])
def test_forgot_password_processing_failures_return_generic_200(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
    failure_stage: str,
) -> None:
    create_user(client.app.state.database, email="private@example.com", hashed_password="hash")
    target = {
        "lookup": "get_user_by_email",
        "token": "create_password_reset_token",
        "email": "send_password_reset_email",
    }[failure_stage]
    monkeypatch.setattr(
        f"ai_engineering_company_project_monorepo.api.auth.{target}",
        MagicMock(side_effect=OSError("private@example.com private-token private-api-key")),
    )
    known = client.post("/auth/forgot-password", json={"email": "private@example.com"})
    unknown = client.post("/auth/forgot-password", json={"email": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json() == {
        "message": "If the email is registered, a password reset link will be sent."
    }
    assert "Password reset request could not be processed" in caplog.text
    assert "private@example.com" not in caplog.text
    assert "private-token" not in caplog.text
    assert "private-api-key" not in caplog.text


@pytest.mark.parametrize("offset_seconds", [0, 1])
def test_reset_password_checks_expiration_at_consumption(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, offset_seconds: int
) -> None:
    user = create_user(client.app.state.database, email="expiry@example.com", hashed_password="old-hash")
    token = create_password_reset_token(client.app.state.database, user)
    claims = jwt.decode(token, get_reset_signing_key(), algorithms=["HS256"])

    class ExpiredClock:
        @staticmethod
        def now(tz):
            return datetime.fromtimestamp(claims["exp"] + offset_seconds, tz)

    monkeypatch.setattr("ai_engineering_company_project_monorepo.services.password_reset.datetime", ExpiredClock)
    response = client.post("/auth/reset-password", json={"token": token, "new_password": "new-password"})
    assert response.status_code == 400
    assert get_user_by_id(client.app.state.database, user.id) == user


def test_password_reset_sends_smtp_link(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("PASSWORD_RESET_URL", "https://example.com/reset-password?source=email")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM", "accounts@example.com")
    monkeypatch.setenv("SMTP_USERNAME", "smtp-user")
    monkeypatch.setenv("SMTP_PASSWORD", "test-smtp-password")
    smtp_factory = MagicMock()
    monkeypatch.setattr("smtplib.SMTP", smtp_factory)
    client.post("/users", json={"email": "smtp@example.com", "password": "original-password"})
    response = client.post("/auth/forgot-password", json={"email": "smtp@example.com"})
    assert response.status_code == 200
    smtp_factory.assert_called_once_with("smtp.example.com", 587, timeout=10)
    smtp = smtp_factory.return_value.__enter__.return_value
    smtp.starttls.assert_called_once()
    smtp.login.assert_called_once_with("smtp-user", "test-smtp-password")
    message = smtp.send_message.call_args.args[0]
    assert message["To"] == "smtp@example.com"
    assert message["From"] == "accounts@example.com"
    assert message.is_multipart()
    assert message.get_body(preferencelist=("html",)).get_content_type() == "text/html"
    link = next(line for line in message.get_body(preferencelist=("plain",)).get_content().splitlines() if line.startswith("https://"))
    assert "width:100%" in message.get_body(preferencelist=("html",)).get_content()
    query = parse_qs(urlsplit(link).query)
    assert query["source"] == ["email"]
    assert client.post(
        "/auth/reset-password", json={"token": query["token"][0], "new_password": "new-password"}
    ).status_code == 200


def test_password_reset_rate_limit_normalizes_email_and_preserves_generic_response(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PASSWORD_RESET_REQUESTS_PER_HOUR", "2")
    user = create_user(client.app.state.database, email="limited@example.com", hashed_password="hash")
    send_email = MagicMock(return_value=True)
    monkeypatch.setattr("ai_engineering_company_project_monorepo.api.auth.send_password_reset_email", send_email)
    responses = [client.post("/auth/forgot-password", json={"email": email}) for email in [
        "limited@example.com", "LIMITED@example.com", "limited@example.com",
    ]]
    assert all(response.status_code == 200 for response in responses)
    assert all(response.json() == responses[0].json() for response in responses)
    assert send_email.call_count == 2
    active_token = send_email.call_args.args[1]
    assert client.post("/auth/reset-password", json={"token": active_token, "new_password": "new-password"}).status_code == 200
    audit = client.app.state.database.table("password_reset_audit").all()
    assert sum(event["event"] == "request_accepted" for event in audit) == 2
    assert sum(event["event"] == "request_rate_limited" for event in audit) == 1
    assert any(event["event"] == "reset_succeeded" and event["user_id"] == user.id for event in audit)
    for event in audit:
        assert event["ip_address"] == "testclient"
        assert datetime.fromisoformat(event["timestamp"]).utcoffset() == timedelta(0)
    assert "limited@example.com" not in str(audit)
    assert active_token not in str(audit)
    assert "new-password" not in str(audit)


def test_password_reset_rate_limit_also_applies_to_unknown_emails(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PASSWORD_RESET_REQUESTS_PER_HOUR", "1")
    for email in ["unknown@example.com", "UNKNOWN@example.com", "other@example.com"]:
        assert client.post("/auth/forgot-password", json={"email": email}).status_code == 200
    events = client.app.state.database.table("password_reset_audit").all()
    assert [event["event"] for event in events] == ["request_accepted", "request_rate_limited", "request_accepted"]


def test_password_reset_records_invalid_token_attempt(client: TestClient) -> None:
    response = client.post("/auth/reset-password", json={"token": "secret-invalid-token", "new_password": "new-password"}, headers={"X-Forwarded-For": "198.51.100.77"})
    assert response.status_code == 400
    events = client.app.state.database.table("password_reset_audit").all()
    assert len(events) == 1
    assert events[0]["event"] == "reset_rejected"
    assert events[0]["ip_address"] == "testclient"
    assert "secret-invalid-token" not in str(events)


def test_password_reset_rate_limit_window_and_audit_survive_restart(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PASSWORD_RESET_REQUESTS_PER_HOUR", "1")
    start = datetime(2026, 10, 11, tzinfo=timezone.utc)

    class Clock:
        current = start

        @classmethod
        def now(cls, tz):
            return cls.current

    monkeypatch.setattr("ai_engineering_company_project_monorepo.services.password_reset.datetime", Clock)
    path = tmp_path / "rate-limit.json"
    with TinyDB(path) as database:
        assert accept_password_reset_request(database, "persist@example.com", "203.0.113.10")
    with TinyDB(path) as database:
        Clock.current = start + timedelta(seconds=3599)
        assert not accept_password_reset_request(database, "PERSIST@example.com", "203.0.113.11")
        Clock.current = start + timedelta(hours=1)
        assert accept_password_reset_request(database, "persist@example.com", "203.0.113.12")
    with TinyDB(path) as database:
        audit = database.table("password_reset_audit").all()
        assert [entry["event"] for entry in audit] == ["request_accepted", "request_rate_limited", "request_accepted"]
        assert [entry["ip_address"] for entry in audit] == ["203.0.113.10", "203.0.113.11", "203.0.113.12"]
        assert datetime.fromisoformat(audit[-1]["timestamp"]) == start + timedelta(hours=1)


def test_password_reset_rate_limit_serializes_concurrent_requests(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PASSWORD_RESET_REQUESTS_PER_HOUR", "2")

    def request_reset(attempt: int) -> bool:
        return accept_password_reset_request(client.app.state.database, "concurrent@example.com", f"203.0.113.{attempt}")

    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(request_reset, range(10)))
    assert sum(results) == 2
    audit = client.app.state.database.table("password_reset_audit").all()
    assert len(audit) == 10
    assert sum(entry["event"] == "request_rate_limited" for entry in audit) == 8


@pytest.mark.parametrize("limit", ["0", "-1", "invalid"])
def test_password_reset_invalid_rate_limit_fails_closed(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, limit: str
) -> None:
    monkeypatch.setenv("PASSWORD_RESET_REQUESTS_PER_HOUR", limit)
    create_user(client.app.state.database, email="config-limit@example.com", hashed_password="hash")
    sender = MagicMock(return_value=True)
    monkeypatch.setattr("ai_engineering_company_project_monorepo.api.auth.send_password_reset_email", sender)
    assert client.post("/auth/forgot-password", json={"email": "config-limit@example.com"}).status_code == 200
    sender.assert_not_called()
    assert client.app.state.database.table("password_reset_audit").all()[0]["event"] == "request_failed"


def test_password_reset_audits_invalid_payloads_and_mail_failure(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("ai_engineering_company_project_monorepo.api.auth.send_password_reset_email", MagicMock(return_value=False))
    create_user(client.app.state.database, email="audit-mail@example.com", hashed_password="hash")
    assert client.post("/auth/forgot-password", json={}).status_code == 200
    assert client.post("/auth/reset-password", json={}).status_code == 422
    assert client.post("/auth/forgot-password", json={"email": "audit-mail@example.com"}).status_code == 200
    events = client.app.state.database.table("password_reset_audit").all()
    assert [entry["event"] for entry in events] == [
        "request_invalid", "reset_invalid_payload", "request_accepted", "token_created", "email_failed",
    ]
    assert all(entry["ip_address"] == "testclient" for entry in events)


def test_password_reset_sends_resend_mobile_email(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, email_api_key: str
) -> None:
    monkeypatch.setenv("PASSWORD_RESET_URL", "https://example.com/reset-password?source=email&token=obsolete")
    monkeypatch.setenv("EMAIL_FROM", "Accounts <accounts@example.com>")
    http_factory = MagicMock()
    http_factory.return_value.__enter__.return_value.status = 200
    monkeypatch.setattr("ai_engineering_company_project_monorepo.services.email_service.urlopen", http_factory)
    smtp_factory = MagicMock()
    monkeypatch.setattr("smtplib.SMTP", smtp_factory)
    client.post("/users", json={"email": "resend@example.com", "password": "original-password"})
    response = client.post("/auth/forgot-password", json={"email": "resend@example.com"})
    assert response.status_code == 200
    http_factory.assert_called_once()
    smtp_factory.assert_not_called()
    request = http_factory.call_args.args[0]
    assert request.full_url == "https://api.resend.com/emails"
    assert request.get_method() == "POST"
    assert request.get_header("Authorization") == f"Bearer {email_api_key}"
    assert request.get_header("Content-type") == "application/json"
    assert http_factory.call_args.kwargs == {"timeout": 10}
    payload = json.loads(request.data)
    assert payload["from"] == "Accounts <accounts@example.com>"
    assert payload["to"] == ["resend@example.com"]
    link = next(line for line in payload["text"].splitlines() if line.startswith("https://"))
    query = parse_qs(urlsplit(link).query)
    assert query["source"] == ["email"]
    assert len(query["token"]) == 1
    assert query["token"][0] != "obsolete"
    assert 'name="viewport"' in payload["html"]
    assert "width:100%" in payload["html"]
    assert "max-width:560px" in payload["html"]
    assert "font-size:16px" in payload["html"]
    assert "overflow-wrap:anywhere" in payload["html"]
    assert "&amp;token=" in payload["html"]
    assert email_api_key not in str(payload)
    assert client.post(
        "/auth/reset-password", json={"token": query["token"][0], "new_password": "new-password"}
    ).status_code == 200


@pytest.mark.parametrize("failure", ["network", "rejected", "configuration"])
def test_resend_failures_preserve_generic_response_and_hide_secrets(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
    failure: str, email_api_key: str,
) -> None:
    monkeypatch.setenv("PASSWORD_RESET_URL", "https://example.com/reset-password")
    monkeypatch.setenv("EMAIL_FROM", "accounts@example.com")
    http_factory = MagicMock()
    if failure == "network":
        http_factory.side_effect = OSError(email_api_key)
    elif failure == "rejected":
        http_factory.side_effect = HTTPError("https://api.resend.com/emails", 401, email_api_key, {}, None)
    else:
        monkeypatch.delenv("EMAIL_FROM")
    monkeypatch.setattr("ai_engineering_company_project_monorepo.services.email_service.urlopen", http_factory)
    client.post("/users", json={"email": "resend-failure@example.com", "password": "original-password"})
    known = client.post("/auth/forgot-password", json={"email": "resend-failure@example.com"})
    unknown = client.post("/auth/forgot-password", json={"email": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert "Password reset email could not be sent" in caplog.text
    assert email_api_key not in caplog.text
    assert "resend-failure@example.com" not in caplog.text


def test_password_reset_mail_failure_is_not_exposed(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("PASSWORD_RESET_URL", "https://example.com/reset-password")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM", "accounts@example.com")
    monkeypatch.setattr("smtplib.SMTP", MagicMock(side_effect=OSError("mail unavailable")))
    client.post("/users", json={"email": "mail-failure@example.com", "password": "original-password"})
    known = client.post("/auth/forgot-password", json={"email": "mail-failure@example.com"})
    unknown = client.post("/auth/forgot-password", json={"email": "unknown@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


def test_current_user_rejects_invalid_tokens_and_user_lookup_failures(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database = client.app.state.database
    user = create_user(database, email="auth-dependency@example.com", hashed_password="hash")
    inactive_user = create_user(
        database,
        email="inactive@example.com",
        hashed_password="hash",
        is_active=False,
    )

    assert client.get("/auth/me").status_code == 401
    assert client.get(
        "/auth/me",
        headers={"Authorization": "Bearer invalid-token"},
    ).status_code == 401
    assert client.get("/auth/me", headers=auth_headers("missing-user-id")).status_code == 401
    assert client.get("/auth/me", headers=auth_headers(inactive_user.id)).status_code == 401

    monkeypatch.delenv("JWT_SECRET_KEY")
    missing_secret = client.get("/auth/me", headers=auth_headers(user.id))
    assert missing_secret.status_code == 401
    assert missing_secret.headers["www-authenticate"] == "Bearer"

    monkeypatch.setenv("JWT_SECRET_KEY", JWT_SECRET)

    def failed_user_lookup(database, user_id):
        raise RuntimeError("database lookup failed")

    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.dependencies.get_user_by_id",
        failed_user_lookup,
    )
    lookup_failure = client.get("/auth/me", headers=auth_headers(user.id))
    assert lookup_failure.status_code == 401


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("GET", "/users", None),
        ("GET", "/users/unknown-user", None),
        ("PUT", "/users/unknown-user", {"email": "updated@example.com"}),
        ("DELETE", "/users/unknown-user", None),
        ("GET", "/profiles/me", None),
        ("PUT", "/profiles/me", {"name": "Unauthorized"}),
        ("GET", "/auth/me", None),
        ("POST", "/auth/change-password", {"current_password": "original-password", "new_password": "new-password"}),
    ],
)
def test_every_private_route_requires_authentication(
    client: TestClient,
    method: str,
    path: str,
    payload: dict[str, str] | None,
) -> None:
    response = client.request(method, path, json=payload)

    assert response.status_code == 401