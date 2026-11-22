import bcrypt

from ai_engineering_company_project_monorepo.services.profile_service import get_profile_by_user_id
from ai_engineering_company_project_monorepo.services.user_service import get_user_by_email


def test_register_happy_path_creates_user_and_profile(auth_api_client):
    auth_api_client.post(
        "/users",
        json={
            "email": "new-user@example.com",
            "password": "valid-password",
            "name": "New User",
            "phone": "+1 555 0100",
        },
    )

    database = auth_api_client.app.state.database
    user = get_user_by_email(database, "new-user@example.com")
    assert user is not None
    assert bcrypt.checkpw(b"valid-password", user.hashed_password.encode("ascii"))
    profile = get_profile_by_user_id(database, user.id)
    assert profile is not None
    assert profile.name == "New User"


def test_register_duplicate_email_returns_conflict(auth_api_client, register_auth_user):
    register_auth_user("duplicate@example.com")

    auth_api_client.post(
        "/users",
        json={"email": "duplicate@example.com", "password": "valid-password"},
    )

    users = auth_api_client.app.state.database.table("users").all()
    assert len(users) == 1
    assert users[0]["email"] == "duplicate@example.com"


def test_register_malformed_body_returns_validation_error(auth_api_client):
    auth_api_client.post(
        "/users",
        json={"email": "not-an-email", "password": "short"},
    )

    assert auth_api_client.app.state.database.table("users").all() == []