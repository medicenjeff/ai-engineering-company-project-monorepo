import json
import sys
from datetime import datetime
from pathlib import Path

import pytest
from pydantic import ValidationError
from tinydb import TinyDB

from ai_engineering_company_project_monorepo.seed import main, seed_suppliers


def test_seed_validates_serializes_and_is_repeatablea(tmp_path: Path) -> None:
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