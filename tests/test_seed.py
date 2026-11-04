import json
import csv
import runpy
import sys
from datetime import datetime
from pathlib import Path

import pytest
from pydantic import ValidationError
from tinydb import TinyDB

from ai_engineering_company_project_monorepo.seed import main, seed_suppliers
from ai_engineering_company_project_monorepo.services.incident_service import compute_summary
from ai_engineering_company_project_monorepo.services.incident_analysis import analyze_dataframe
from ai_engineering_company_project_monorepo.shared.incident_constants import validate_seed_row
import pandas as pd
from fastapi.testclient import TestClient
from ai_engineering_company_project_monorepo.api.main import app


def test_briefing_seed_transform_preserves_description() -> None:
    seed_script = runpy.run_path(str(Path(__file__).parents[1] / "scripts" / "seed_incidents.py"))
    description = "  " + "Problema con el ATS. " * 12 + "  "
    incident = seed_script["transform_row"]({
        "ticket_id": "NX-001", "description": description, "date": "2026-09-01",
        "status": "CLOSED", "category": "TECHNICAL",
    })
    assert incident.title == description[:120].strip()
    assert incident.description == description
    assert incident.status.value == "resolved"
    assert incident.category.value == "technical_failure"
    assert incident.origin.value == "customer"
    assert incident.branch == "central"
    assert incident.created_at.isoformat() == "2026-09-01T00:00:00+00:00"
    assert incident.updated_at == incident.created_at
    assert incident.id != "NX-001"


def test_briefing_official_seed_matches_analyzer_and_is_idempotent(tmp_path: Path, monkeypatch) -> None:
    seed_script = runpy.run_path(str(Path(__file__).parents[1] / "scripts" / "seed_incidents.py"))
    source = Path(__file__).parents[1] / "data" / "raw" / "incidents-nexova.csv"
    database_path = tmp_path / "incidents.json"
    analysis = analyze_dataframe(pd.read_csv(source))
    first = seed_script["seed_incidents"](source, database_path)
    second = seed_script["seed_incidents"](source, database_path)
    assert analysis["valid_records"] == first["inserted"] == 96
    assert analysis["invalid_records"] == first["invalid"] == second["invalid"] == 4
    assert second["inserted"] == 0
    assert second["skipped_duplicates"] == 96
    with TinyDB(database_path) as database:
        summary = compute_summary(database)
        assert summary == {
            "by_status": {"open": 27, "resolved": 56, "discarded": 13},
            "by_category": {"technical_failure": 49, "process_error": 35, "client_complaint": 12},
            "by_origin": {"customer": 96},
            "by_branch": {"central": 96},
        }
        assert all("ticket_id" not in document for document in database.table("incidents"))
    monkeypatch.setenv("TINYDB_PATH", str(database_path))
    with TestClient(app) as client:
        response = client.get("/api/incidents/summary")
        assert response.status_code == 200
        assert response.json() == summary


def test_incident_seed_without_ticket_id_is_repeatable_and_keeps_description(tmp_path: Path) -> None:
    seed_script = runpy.run_path(str(Path(__file__).parents[1] / "scripts" / "seed_incidents.py"))
    source = tmp_path / "without-ticket.csv"
    database_path = tmp_path / "incidents.json"
    row = {"date": "2024-01-01", "client_company": "Nexova", "category": "TECHNICAL", "description": "  Error de acceso al ATS  ", "agent_id": "AGT-01", "status": "OPEN", "customer_email": "client@example.com"}
    with source.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=list(row))
        writer.writeheader()
        writer.writerow(row)
        writer.writerow(row)
    assert seed_script["seed_incidents"](source, database_path)["inserted"] == 1
    assert seed_script["seed_incidents"](source, database_path)["skipped_duplicates"] == 2
    with TinyDB(database_path) as database:
        document = database.table("incidents").all()[0]
        assert document["description"] == row["description"]
        assert document["title"] == row["description"].strip()


def test_incident_seed_reports_invalid_csv_rows(tmp_path, monkeypatch, capsys):
    seed_script = runpy.run_path(str(Path(__file__).parents[1] / "scripts" / "seed_incidents.py"))
    source = Path(__file__).parents[1] / "data" / "raw" / "incidents-nexova.csv"
    monkeypatch.setattr(sys, "argv", ["seed_incidents", "--csv", str(source), "--database", str(tmp_path / "incidents.json")])
    with pytest.raises(SystemExit) as result:
        seed_script["main"]()
    assert result.value.code == 1
    report = capsys.readouterr().out
    for ticket_id in ["NXV-000017", "NXV-000043", "NXV-000086", "NXV-000090"]:
        assert ticket_id in report
    assert "Insertadas:     96" in report
    assert "Inválidas (rechazadas): 4" in report


@pytest.mark.parametrize("invalid", [
    {"status": "PENDING"}, {"category": "UNKNOWN"}, {"date": "2024-02-30"},
    {"date": "2024-1-1"}, {"date": "2024-01-01T10:00:00"},
    {"customer_email": "not-an-email"}, {"satisfaction_score": "6"},
    {"status": "CLOSED", "satisfaction_score": ""},
    {"description": " " * 120 + "Texto fuera del título"},
])
def test_seed_and_analyzer_share_invalid_row_rules(invalid):
    row = {"ticket_id": "NX-001", "date": "2024-01-01", "client_company": "Nexova", "category": "TECHNICAL", "description": "Error de acceso", "agent_id": "AGT-01", "status": "OPEN", "customer_email": "client@example.com", "satisfaction_score": "", **invalid}
    assert validate_seed_row(row)
    assert analyze_dataframe(pd.DataFrame([row]))["invalid_records"] == 1


def test_seed_validates_serializes_and_is_repeatable(tmp_path: Path) -> None:
    source_path = tmp_path / "suppliers.json"
    database_path = tmp_path / "nested" / "database.json"
    supplier_data = {
        "name": "Test supplier",
        "country": "Spain",
        "product_categories": ["corporate_training"],
        "rate": "125.50",
        "status": "active",
    }
    source_path.write_text(json.dumps([supplier_data]), encoding="utf-8")

    assert seed_suppliers(source_path, database_path) == 1
    supplier_data["rate"] = "200.00"
    source_path.write_text(json.dumps([supplier_data]), encoding="utf-8")
    assert seed_suppliers(source_path, database_path) == 0

    with TinyDB(database_path) as database:
        suppliers = database.table("suppliers").all()
        assert len(suppliers) == 1
        assert suppliers[0]["rate"] == "125.50"
        assert suppliers[0]["status"] == "active"
        assert datetime.fromisoformat(suppliers[0]["updated_at"]).utcoffset().total_seconds() == 0


@pytest.mark.parametrize("invalid_field", [{"rate": 0}, {"rate": -1}, {"status": "pending"}, {"updated_at": "2026-01-01T00:00:00Z"}])
def test_seed_validates_entire_input_before_writing(
    tmp_path: Path, invalid_field: dict[str, object]
) -> None:
    source_path = tmp_path / "suppliers.json"
    database_path = tmp_path / "database.json"
    supplier_data = {
        "name": "Test supplier",
        "country": "Spain",
        "product_categories": ["training"],
        "rate": "125.50",
        "status": "active",
    }
    source_path.write_text(
        json.dumps([supplier_data, {**supplier_data, **invalid_field}]), encoding="utf-8"
    )

    with pytest.raises(ValidationError):
        seed_suppliers(source_path, database_path)
    assert not database_path.exists()


def test_seed_rejects_empty_input(tmp_path: Path) -> None:
    source_path = tmp_path / "suppliers.json"
    database_path = tmp_path / "database.json"
    source_path.write_text("[]", encoding="utf-8")

    with pytest.raises(ValueError):
        seed_suppliers(source_path, database_path)
    assert not database_path.exists()


def test_seed_loads_context_and_reports_inserted_count(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    database_path = tmp_path / "database.json"
    monkeypatch.setattr(sys, "argv", ["seed", "--database", str(database_path)])

    main()
    assert "Proveedores insertados: 3." in capsys.readouterr().out

    main()
    assert "Proveedores insertados: 0." in capsys.readouterr().out