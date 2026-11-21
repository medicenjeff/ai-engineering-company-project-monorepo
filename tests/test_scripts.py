import builtins
import runpy
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).parents[1]


def test_analyze_missing_csv_reports_stderr_and_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    script = runpy.run_path(str(ROOT / "scripts" / "analyze.py"))
    missing_path = tmp_path / "missing.csv"
    monkeypatch.setattr(sys, "argv", ["analyze.py", str(missing_path)])

    assert script["main"]() == 1
    error_output = capsys.readouterr().err
    assert "ERROR:" in error_output
    assert "No existe" in error_output
    assert "Traceback" not in error_output


def test_analyze_empty_csv_reports_error_without_traceback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    csv_path = tmp_path / "malformed.csv"
    csv_path.write_text("", encoding="utf-8")
    script = runpy.run_path(str(ROOT / "scripts" / "analyze.py"))
    monkeypatch.setattr(sys, "argv", ["analyze.py", str(csv_path)])
    monkeypatch.setattr(builtins, "input", lambda _: "n")

    assert script["main"]() == 1
    error_output = capsys.readouterr().err
    assert "ERROR:" in error_output
    assert "CSV" in error_output
    assert "Traceback" not in error_output


def test_analyze_summary_does_not_print_paths_or_input_values(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    csv_path = tmp_path / "private-input.csv"
    csv_path.write_text(
        "incident_id,category,title,description,status,priority,created_at,assigned_to,customer_email\n"
        "INC-001,technical_failure,Title,Description,open,low,2026-09-25,team,private@example.com\n",
        encoding="utf-8",
    )
    script = runpy.run_path(str(ROOT / "scripts" / "analyze.py"))
    monkeypatch.setattr(sys, "argv", ["analyze.py", str(csv_path)])
    monkeypatch.setattr(builtins, "input", lambda _: "n")

    assert script["main"]() == 0
    output = capsys.readouterr().out
    assert str(tmp_path) not in output
    assert "private-input.csv" not in output
    assert "private@example.com" not in output
    assert "customer_email" not in output


def test_analyze_export_failure_reports_stderr_and_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "results.csv").mkdir()
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(builtins, "input", lambda _: "s")
    script = runpy.run_path(str(ROOT / "scripts" / "analyze.py"))

    assert script["ask_for_export"]([]) is False
    error_output = capsys.readouterr().err
    assert "No se pudo escribir" in error_output
    assert "Traceback" not in error_output


def test_pandas_clean_missing_csv_returns_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    script = runpy.run_path(str(ROOT / "skills" / "data-analysis" / "scripts" / "pandas_clean.py"))
    monkeypatch.setattr(sys, "argv", ["pandas_clean.py", str(tmp_path / "missing.csv")])

    assert script["main"]() == 1
    error_output = capsys.readouterr().err
    assert "ERROR:" in error_output
    assert "No existe" in error_output
    assert "Traceback" not in error_output


def test_pandas_clean_does_not_print_csv_rows_or_column_names(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    csv_path = tmp_path / "private.csv"
    csv_path.write_text("private_email\nprivate@example.com\n", encoding="utf-8")
    script = runpy.run_path(str(ROOT / "skills" / "data-analysis" / "scripts" / "pandas_clean.py"))
    monkeypatch.setattr(sys, "argv", ["pandas_clean.py", str(csv_path)])

    assert script["main"]() == 0
    output = capsys.readouterr().out
    assert "private@example.com" not in output
    assert "private_email" not in output


def test_incident_seed_missing_csv_exits_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    script = runpy.run_path(str(ROOT / "scripts" / "seed_incidents.py"))
    monkeypatch.setattr(sys, "argv", ["seed_incidents.py", "--csv", str(tmp_path / "missing.csv")])

    with pytest.raises(SystemExit) as result:
        script["main"]()
    assert result.value.code == 1
    assert "No existe" in capsys.readouterr().err


def test_supplier_seed_missing_input_exits_one(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    script = runpy.run_path(str(ROOT / "src" / "ai_engineering_company_project_monorepo" / "seed.py"))
    monkeypatch.setattr(sys, "argv", ["seed.py", "--input", str(tmp_path / "missing.json")])

    with pytest.raises(SystemExit) as result:
        script["main"]()
    assert result.value.code == 1
    assert "No existe" in capsys.readouterr().err


@pytest.mark.parametrize(
    "csv_text, message",
    [
        (
            "date,date,client_company,category,description,agent_id,status,customer_email\n",
            "duplicate columns",
        ),
        (
            "date,client_company,category,description,agent_id,status,customer_email\n"
            "2024-01-01,Nexova,TECHNICAL,Issue,AGT-1,OPEN,client@example.com,extra\n",
            "columnas adicionales",
        ),
    ],
)
def test_incident_seed_rejects_malformed_csv_structure(
    tmp_path: Path, csv_text: str, message: str
) -> None:
    script = runpy.run_path(str(ROOT / "scripts" / "seed_incidents.py"))
    csv_path = tmp_path / "malformed.csv"
    csv_path.write_text(csv_text, encoding="utf-8")

    with pytest.raises(ValueError, match=message):
        script["load_csv_rows"](csv_path)