from unittest.mock import MagicMock


def test_forgot_password_happy_path_is_opaque_for_known_and_unknown_email(
    auth_api_client, register_auth_user, monkeypatch
):
    register_auth_user("known@example.com")
    sender = MagicMock(return_value=True)
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.send_password_reset_email",
        sender,
    )

    known = auth_api_client.post("/auth/forgot-password", json={"email": "known@example.com"})
    unknown = auth_api_client.post("/auth/forgot-password", json={"email": "unknown@example.com"})

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert sender.call_count == 1


def test_forgot_password_invalid_body_has_no_processing_side_effects(auth_api_client, monkeypatch):
    sender = MagicMock(return_value=True)
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.send_password_reset_email",
        sender,
    )
    auth_api_client.post("/auth/forgot-password", json={})

    sender.assert_not_called()
    assert auth_api_client.app.state.database.table("password_reset_tokens").all() == []
    assert auth_api_client.app.state.database.table("password_reset_audit").all()[0]["event"] == "request_invalid"


def test_forgot_password_mail_failure_does_not_expose_exception(
    auth_api_client, register_auth_user, monkeypatch
):
    register_auth_user("mail-error@example.com")
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.send_password_reset_email",
        MagicMock(side_effect=RuntimeError("private token and SMTP password")),
    )

    auth_api_client.post("/auth/forgot-password", json={"email": "mail-error@example.com"})

    events = auth_api_client.app.state.database.table("password_reset_audit").all()
    assert events[-1]["event"] == "email_failed"


def test_audit_storage_failure_does_not_block_reset_email(
    auth_api_client, register_auth_user, monkeypatch
):
    register_auth_user("audit-outage@example.com")
    sender = MagicMock(return_value=True)
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.send_password_reset_email",
        sender,
    )
    monkeypatch.setattr(
        "ai_engineering_company_project_monorepo.api.auth.record_password_reset_event",
        MagicMock(side_effect=OSError("audit store unavailable")),
    )

    auth_api_client.post("/auth/forgot-password", json={"email": "audit-outage@example.com"})

    sender.assert_called_once()
    assert len(auth_api_client.app.state.database.table("password_reset_tokens").all()) == 1