from ai_engineering_company_project_monorepo.services.user_service import get_user_by_email, update_user


def test_login_happy_path_returns_bearer_token(auth_api_client, register_auth_user):
    register_auth_user("login@example.com", "valid-password")

    response = auth_api_client.post(
        "/auth/login",
        json={"email": "LOGIN@example.com", "password": "valid-password"},
    )

    authenticated = auth_api_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {response.json()['access_token']}"},
    )
    assert authenticated.json()["email"] == "login@example.com"


def test_login_invalid_credentials_return_unauthorized(auth_api_client, register_auth_user):
    register_auth_user("login-failure@example.com")

    response = auth_api_client.post(
        "/auth/login",
        json={"email": "login-failure@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401


def test_login_malformed_body_returns_validation_error(auth_api_client):
    auth_api_client.post("/auth/login", json={"email": "bad-email"})

    assert auth_api_client.app.state.database.table("users").all() == []


def test_login_missing_jwt_secret_returns_clean_server_error(
    auth_api_client, register_auth_user, monkeypatch
):
    register_auth_user("missing-secret@example.com")
    monkeypatch.delenv("JWT_SECRET_KEY")

    response = auth_api_client.post(
        "/auth/login",
        json={"email": "missing-secret@example.com", "password": "original-password"},
    )

    assert response.status_code == 500


def test_login_corrupt_stored_password_hash_never_authenticates(
    auth_api_client, register_auth_user
):
    register_auth_user("corrupt-hash@example.com", "valid-password")
    database = auth_api_client.app.state.database
    user = get_user_by_email(database, "corrupt-hash@example.com")
    # Simula un registro legado corrupto: el login no debe emitir una sesión.
    update_user(database, user.id, hashed_password="not-a-bcrypt-hash")

    response = auth_api_client.post(
        "/auth/login",
        json={"email": "corrupt-hash@example.com", "password": "valid-password"},
    )

    assert response.status_code == 401