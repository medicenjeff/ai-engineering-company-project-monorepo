from io import BytesIO
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
import pandas as pd

from ai_engineering_company_project_monorepo.api.main import app
from ai_engineering_company_project_monorepo.services.incident_analysis import (
    analyze_dataframe,
)
from ai_engineering_company_project_monorepo.models.incident import Incident, IncidentCategory


VALID_CSV = b"incident_id,category,title,description,status,priority,created_at,assigned_to,satisfaction_score\nINC-001,training,Title,Description,resolved,high,2026-09-25,team,4\nINC-002,leave,Title,Description,open,low,2026-09-26,team,\n"


def test_briefing_model_categories() -> None:
    assert {category.value for category in IncidentCategory} == {
        "technical_failure", "process_error", "client_complaint", "candidate_issue",
        "staff_issue", "sla_breach", "data_quality", "other",
    }


@pytest.mark.parametrize("branch", ["miami", "headquarters", "unknown", " "])
def test_briefing_model_rejects_unknown_branch(branch: str) -> None:
    with pytest.raises(ValueError, match="branch"):
        Incident(id="test", title="Acceso ATS", description="No funciona", branch=branch)


@pytest.fixture
def incident_client(tmp_path, monkeypatch):
    monkeypatch.setenv("TINYDB_PATH", str(tmp_path / "incidents.json"))
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


def incident_payload(**overrides):
    return {"title": "Acceso al ATS", "description": "El equipo no puede acceder", "category": "technical_failure", "origin": "customer", "branch": "central", **overrides}


@pytest.mark.parametrize("field,value", [
    ("title", " "), ("title", "x" * 121), ("description", ""),
    ("category", "recruitment"), ("category", None), ("origin", "unknown"),
    ("branch", "miami"), ("branch", "headquarters"), ("id", "client-assigned"),
])
def test_incident_validation_identifies_field(incident_client, field, value):
    response = incident_client.post("/api/incidents", json=incident_payload(**{field: value}))
    assert response.status_code == 400
    assert any(error["field"] == field for error in response.json()["errors"])
    assert incident_client.get("/api/incidents").json() == []


@pytest.mark.parametrize("category", [category.value for category in IncidentCategory])
def test_incident_crud_accepts_briefing_values(incident_client, category):
    for branch in ["central", "valencia_operations", "miami_office", "remote"]:
        response = incident_client.post("/api/incidents", json=incident_payload(category=category, branch=branch))
        assert response.status_code == 201
        incident = response.json()
        assert incident["category"] == category
        assert incident["branch"] == branch
        assert incident["status"] == "open"
        assert datetime.fromisoformat(incident["created_at"]).utcoffset().total_seconds() == 0
        assert incident_client.get(f"/api/incidents/{incident['id']}").json() == incident
        assert incident in incident_client.get("/api/incidents", params={"branch": branch, "category": category, "origin": "customer", "status": "open"}).json()


@pytest.mark.parametrize("field,value", [("branch", "miami"), ("origin", "bad"), ("status", "CLOSED"), ("category", "TECHNICAL")])
def test_incident_invalid_filters_return_field_errors(incident_client, field, value):
    response = incident_client.get("/api/incidents", params={field: value})
    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == field


@pytest.mark.parametrize("current", ["open", "in_progress", "resolved", "discarded"])
@pytest.mark.parametrize("target", ["open", "in_progress", "resolved", "discarded"])
def test_incident_all_lifecycle_transitions(incident_client, current, target):
    incident = incident_client.post("/api/incidents", json=incident_payload()).json()
    path = f"/api/incidents/{incident['id']}/status"
    if current in {"in_progress", "resolved"}:
        assert incident_client.patch(path, json={"status": "in_progress"}).status_code == 200
    if current in {"resolved", "discarded"}:
        assert incident_client.patch(path, json={"status": current}).status_code == 200
    response = incident_client.patch(path, json={"status": target})
    allowed = (current, target) in {("open", "in_progress"), ("open", "discarded"), ("in_progress", "resolved"), ("in_progress", "discarded")}
    assert response.status_code == (200 if allowed else 400)
    actual = incident_client.get(f"/api/incidents/{incident['id']}").json()
    assert actual["status"] == (target if allowed else current)


def test_incident_missing_and_invalid_status(incident_client):
    assert incident_client.get("/api/incidents/missing").status_code == 404
    assert incident_client.patch("/api/incidents/missing/status", json={"status": "in_progress"}).status_code == 404
    response = incident_client.patch("/api/incidents/missing/status", json={"status": "invalid"})
    assert response.status_code == 400
    assert response.json()["errors"][0]["field"] == "status"


def test_incident_internal_error_never_exposes_traceback(incident_client, monkeypatch):
    def fail(database):
        raise RuntimeError("private database path and secret")
    monkeypatch.setattr("ai_engineering_company_project_monorepo.api.incidents.compute_summary", fail)
    response = incident_client.get("/api/incidents/summary")
    assert response.status_code == 500
    assert response.json() == {"detail": "Error interno del servidor"}
    assert "Traceback" not in response.text
    assert "private" not in response.text


@pytest.mark.parametrize("field,value", [
    ("id", ""), ("title", "x" * 121), ("description", " "),
    ("category", None), ("status", "open"), ("origin", "customer"),
    ("created_at", datetime(2026, 1, 1)), ("updated_at", datetime(2000, 1, 1, tzinfo=timezone.utc)),
])
def test_incident_model_integrity(field, value):
    with pytest.raises(ValueError, match=field):
        Incident(**{"id": "test", "title": "ATS", "description": "Error de acceso", **{field: value}})


def test_analyze_incidents_accepts_multipart_csv() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/incidents/analyze",
            files={"file": ("incidents.csv", VALID_CSV, "text/csv")},
        )

    assert response.status_code == 200
    assert response.json() == {
        "total_processed": 2,
        "valid_records": 2,
        "invalid_records": 0,
        "by_category": {"leave": 1, "training": 1},
        "by_status": {"abierto": 1, "cerrado": 1},
        "average_satisfaction_closed": 4.0,
        "satisfaction_scored_closed_cases": 1,
        "validation_issues": {},
    }


def test_analyze_incidents_rejects_missing_columns() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/incidents/analyze",
            files={"file": ("incidents.csv", b"incident_id,title\nINC-001,Title\n", "text/csv")},
        )

    assert response.status_code == 200
    assert response.json()["invalid_records"] == 1
    assert "columnas obligatorias ausentes" in response.json()["validation_issues"]


def test_endpoint_returns_shared_analysis_summary() -> None:
    expected = analyze_dataframe(pd.read_csv(BytesIO(VALID_CSV)))

    with TestClient(app) as client:
        response = client.post(
            "/api/incidents/analyze",
            files={"file": ("incidents.csv", VALID_CSV, "text/csv")},
        )

    assert response.status_code == 200
    assert response.json() == expected


def test_official_nexova_csv_uses_shared_api_validation() -> None:
    csv_path = Path(__file__).parents[1] / "data" / "raw" / "incidents-nexova.csv"
    with TestClient(app) as client:
        response = client.post(
            "/api/incidents/analyze",
            files={"file": (csv_path.name, csv_path.read_bytes(), "text/csv")},
        )
    assert response.status_code == 200
    result = response.json()
    assert result["total_processed"] == 100
    assert result["valid_records"] == 96
    assert result["invalid_records"] == 4
    assert result["by_category"] == {
        "ACCESS": 21, "BILLING": 18, "COMPLAINT": 12, "HR_QUERY": 17, "TECHNICAL": 28,
    }
    assert result["by_status"] == {"abierto": 27, "cerrado": 56, "descartado": 13}


def test_export_returns_last_analysis_as_csv() -> None:
    with TestClient(app) as client:
        analysis = client.post(
            "/api/incidents/analyze",
            files={"file": ("incidents.csv", VALID_CSV, "text/csv")},
        )
        response = client.get("/api/incidents/results/export")

    assert analysis.status_code == 200
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["content-disposition"] == "attachment; filename=results.csv"
    assert "total_procesados,2," in response.text
    assert "satisfaccion_media_casos_cerrados,4.0," in response.text


def test_export_without_previous_analysis_returns_not_found() -> None:
    app.state._state.pop("last_incident_analysis", None)

    with TestClient(app) as client:
        response = client.get("/api/incidents/results/export")

    assert response.status_code == 404
    assert response.json()["detail"] == "No hay ningún análisis disponible para exportar"


def test_analyze_rejects_empty_and_malformed_csv() -> None:
    with TestClient(app) as client:
        empty_response = client.post(
            "/api/incidents/analyze",
            files={"file": ("empty.csv", b"", "text/csv")},
        )
        malformed_response = client.post(
            "/api/incidents/analyze",
            files={"file": ("broken.csv", b'"unclosed', "text/csv")},
        )

    assert empty_response.status_code == 400
    assert "CSV inválido" in empty_response.json()["detail"]
    assert malformed_response.status_code == 400
    assert "CSV inválido" in malformed_response.json()["detail"]
