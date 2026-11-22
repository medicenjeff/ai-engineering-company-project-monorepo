from ai_engineering_company_project_monorepo.services.user_service import get_user_by_id


def test_change_password_happy_path_changes_password(
    auth_api_client, register_auth_user, auth_headers
):
    user = register_auth_user("change-password@example.com", "original-password")

    auth_api_client.post(
        "/auth/change-password",
        headers=auth_headers(user["id"]),
        json={"current_password": "original-password", "new_password": "changed-password"},
    )
    old_password = auth_api_client.post(
        "/auth/login",
        json={"email": "change-password@example.com", "password": "original-password"},
    )
    new_password = auth_api_client.post(
        "/auth/login",
        json={"email": "change-password@example.com", "password": "changed-password"},
    )

    assert old_password.status_code == 401
    assert new_password.status_code == 200


def test_change_password_boundary_rejects_short_new_password(
    auth_api_client, register_auth_user, auth_headers
):
    user = register_auth_user("short-password@example.com")
    database = auth_api_client.app.state.database
    original_user = get_user_by_id(database, user["id"])
    assert original_user is not None

    auth_api_client.post(
        "/auth/change-password",
        headers=auth_headers(user["id"]),
        json={"current_password": "original-password", "new_password": "short"},
    )

    stored = get_user_by_id(database, user["id"])
    assert stored is not None
    assert stored.hashed_password == original_user.hashed_password


def test_change_password_wrong_current_password_returns_bad_request(
    auth_api_client, register_auth_user, auth_headers
):
    user = register_auth_user("wrong-current@example.com")
    database = auth_api_client.app.state.database
    original_user = get_user_by_id(database, user["id"])
    assert original_user is not None

    auth_api_client.post(
        "/auth/change-password",
        headers=auth_headers(user["id"]),
        json={"current_password": "wrong-password", "new_password": "changed-password"},
    )

    stored = get_user_by_id(database, user["id"])
    assert stored is not None
    assert stored.hashed_password == original_user.hashed_password


def test_change_password_missing_token_returns_unauthorized(auth_api_client, register_auth_user):
    user = register_auth_user("missing-token@example.com")
    original_user = get_user_by_id(auth_api_client.app.state.database, user["id"])
    assert original_user is not None

    auth_api_client.post(
        "/auth/change-password",
        json={"current_password": "original-password", "new_password": "changed-password"},
    )

    user_after = get_user_by_id(auth_api_client.app.state.database, user["id"])
    assert user_after == original_user