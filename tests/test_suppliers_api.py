from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from ai_engineering_company_project_monorepo.api.main import app


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("TINYDB_PATH", str(tmp_path / "suppliers.json"))
    with TestClient(app) as test_client:
        yield test_client


def supplier_payload(**overrides: object) -> dict[str, object]:
    return {
        "name": "Levante Executive Search",
        "country": "España",
        "product_categories": ["executive_search"],
        "rate": "125.00",
        "status": "active",
        **overrides,
    }


def test_create_supplier_returns_tinydb_id_and_rejects_invalid_data(
    client: TestClient,
) -> None:
    response = client.post("/suppliers", json=supplier_payload())

    assert response.status_code == 201
    assert response.json()["id"] == 1
    assert response.json()["name"] == "Levante Executive Search"
    assert datetime.fromisoformat(response.json()["updated_at"]).tzinfo is not None

    invalid_rate = client.post("/suppliers", json=supplier_payload(rate="0"))
    invalid_category = client.post(
        "/suppliers",
        json=supplier_payload(product_categories=["invalid"]),
    )
    missing_country = client.post(
        "/suppliers",
        json={key: value for key, value in supplier_payload().items() if key != "country"},
    )

    assert invalid_rate.status_code == 422
    assert invalid_category.status_code == 422
    assert missing_country.status_code == 422


def test_list_suppliers_filters_by_country_and_category(client: TestClient) -> None:
    client.post("/suppliers", json=supplier_payload())
    client.post(
        "/suppliers",
        json=supplier_payload(
            name="Northstar CX Partners",
            country="Estados Unidos",
            product_categories=["customer_service_outsourcing"],
            rate="42.50",
        ),
    )

    assert len(client.get("/suppliers").json()) == 2
    assert len(client.get("/suppliers", params={"country": "España"}).json()) == 1
    assert len(
        client.get("/suppliers", params={"category": "customer_service_outsourcing"}).json()
    ) == 1
    assert client.get("/suppliers", params={"category": "unknown"}).status_code == 422


def test_get_supplier_and_patch_rate(client: TestClient) -> None:
    created = client.post("/suppliers", json=supplier_payload()).json()
    supplier_id = created["id"]

    assert client.get(f"/suppliers/{supplier_id}").json() == created
    assert client.get("/suppliers/999").status_code == 404

    updated = client.patch(f"/suppliers/{supplier_id}/rate", json={"rate": "150.25"})

    assert updated.status_code == 200
    assert updated.json()["rate"] == "150.25"
    assert updated.json()["updated_at"] >= created["updated_at"]
    assert client.patch(f"/suppliers/{supplier_id}/rate", json={"rate": 0}).status_code == 422
    assert client.patch("/suppliers/999/rate", json={"rate": 150}).status_code == 404


def test_patch_supplier_status_accepts_only_context_statuses(client: TestClient) -> None:
    created = client.post("/suppliers", json=supplier_payload()).json()
    supplier_id = created["id"]

    suspended = client.patch(
        f"/suppliers/{supplier_id}/status",
        json={"status": "suspended"},
    )
    assert suspended.status_code == 200
    assert suspended.json()["status"] == "suspended"
    assert suspended.json()["updated_at"] >= created["updated_at"]

    active = client.patch(
        f"/suppliers/{supplier_id}/status",
        json={"status": "active"},
    )
    assert active.status_code == 200
    assert active.json()["status"] == "active"

    assert client.patch(
        f"/suppliers/{supplier_id}/status",
        json={"status": "pending"},
    ).status_code == 422
    assert client.patch(
        "/suppliers/999/status",
        json={"status": "active"},
    ).status_code == 404


def test_delete_supplier_removes_record_or_returns_not_found(client: TestClient) -> None:
    created = client.post("/suppliers", json=supplier_payload()).json()
    supplier_id = created["id"]

    deleted = client.delete(f"/suppliers/{supplier_id}")
    assert deleted.status_code == 204
    assert client.get(f"/suppliers/{supplier_id}").status_code == 404
    assert client.delete(f"/suppliers/{supplier_id}").status_code == 404


def test_suppliers_api_allows_forwarded_codespaces_origin(client: TestClient) -> None:
    origin = "https://workspace-5173.app.github.dev"

    response = client.get("/suppliers", headers={"Origin": origin})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin