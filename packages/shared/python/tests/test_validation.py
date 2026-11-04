import pandas as pd

from nexova_incidents import validate_analyzer_rows
from nexova_incidents.validation import REQUIRED_COLUMNS_SEED


def test_seed_validator_is_shared_with_analyzer():
    row = {
        "date": "2024-01-01", "client_company": "Nexova", "category": "TECHNICAL",
        "description": "ATS login failure", "agent_id": "AGT-01", "status": "OPEN",
        "customer_email": "client@example.com", "ticket_id": "NX-001",
        "satisfaction_score": "",
    }
    assert validate_analyzer_rows([*REQUIRED_COLUMNS_SEED, "ticket_id", "satisfaction_score"], [row]) == {}
    invalid_row = {**row, "category": "unknown"}
    assert validate_analyzer_rows([*REQUIRED_COLUMNS_SEED, "ticket_id", "satisfaction_score"], [invalid_row]) == {"category": [2]}


def test_previous_analyzer_validation_remains_shared():
    columns = ["incident_id", "category", "title", "description", "status", "priority", "created_at", "assigned_to"]
    rows = [
        dict(zip(columns, ["INC-1", "training", "Title", "Description", "resolved", "high", "2026-09-25", "team"], strict=True)),
        dict(zip(columns, ["INC-1", "training", "Title", "Description", "bad", "urgent", "invalid", "team"], strict=True)),
    ]
    assert validate_analyzer_rows(columns, rows) == {
        "status fuera de rango": [3], "priority fuera de rango": [3],
        "fecha inválida": [3], "incident_id duplicado": [2, 3],
    }