def test_auth_me_happy_path_returns_authenticated_account(
    auth_api_client, register_auth_user, auth_headers
):
    user = register_auth_user("token@example.com", name="Token User")

    response = auth_api_client.get("/auth/me", headers=auth_headers(user["id"]))

    assert response.status_code == 200
    assert response.json()["email"] == "token@example.com"
    assert response.json()["profile"]["name"] == "Token User"


def test_auth_me_boundary_user_without_profile_returns_null_profile(
    auth_api_client, register_auth_user, auth_headers
):
    user = register_auth_user("no-profile@example.com")
    # Fuerza el estado de negocio de una cuenta heredada sin perfil asociado.
    auth_api_client.app.state.database.table("profiles").truncate()

    response = auth_api_client.get("/auth/me", headers=auth_headers(user["id"]))

    assert response.status_code == 200
    assert response.json()["profile"] is None


def test_auth_me_missing_invalid_or_expired_token_returns_unauthorized(
    auth_api_client, register_auth_user, auth_headers, expired_auth_headers
):
    user = register_auth_user("expired-token@example.com")

    missing = auth_api_client.get("/auth/me")
    invalid = auth_api_client.get("/auth/me", headers={"Authorization": "Bearer invalid"})
    expired = auth_api_client.get("/auth/me", headers=expired_auth_headers(user["id"]))

    assert [missing.status_code, invalid.status_code, expired.status_code] == [401, 401, 401]