#!/usr/bin/env python3
"""Seed historical incidents from a CSV file into the database.

Usage:
    uv run python scripts/seed_incidents.py [--csv path/to/incidents.csv]
                                           [--database path/to/db.json]

The CSV is expected to have the following columns (previous-project format):
    incident_id, category, description, date, ubicación, status

Transformations applied (per BRIEFING):
    description   → title (breve título de la incidencia)
    description   → description (mismo texto, usado como descripción detallada)
    date          → created_at
    ubicación     → branch
    status        → mapped via CSV_STATUS_TO_MODEL (pending→in_progress, closed→resolved, etc.)
    category      → mapped via CSV_CATEGORY_TO_MODEL

All inserted records get origin="customer" as required.
Invalid CSV rows are reported to console and skipped.
The script is idempotent: it checks by incident_id before inserting.
"""

import argparse
import csv
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tinydb import Query, TinyDB

from ai_engineering_company_project_monorepo.models.incident import (
    Incident,
    IncidentCategory,
    IncidentOrigin,
    IncidentStatus,
)
from ai_engineering_company_project_monorepo.shared.incident_constants import (
    CSV_CATEGORY_TO_MODEL,
    CSV_STATUS_TO_MODEL,
    REQUIRED_COLUMNS_SEED,
    validate_seed_row,
)


def load_csv_rows(csv_path: Path) -> list[dict[str, str]]:
    """Read a CSV file and return a list of row dicts (all values as strings)."""
    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames is None:
            raise ValueError("CSV file has no headers")

        # Normalize headers: strip whitespace
        normalized: list[dict[str, str]] = []
        for row in reader:
            normalized.append(
                {k.strip(): v.strip() if v else "" for k, v in row.items()}
            )
        return normalized


def validate_headers(fieldnames: list[str]) -> None:
    """Check that required columns are present in the CSV headers."""
    missing = [col for col in REQUIRED_COLUMNS_SEED if col not in fieldnames]
    if missing:
        raise ValueError(
            f"CSV is missing required columns: {', '.join(missing)}. "
            f"Expected: {', '.join(REQUIRED_COLUMNS_SEED)}"
        )


def transform_row(raw: dict[str, str]) -> Incident:
    """Transform a raw CSV row into a validated Incident model instance.

    Applies all BRIEFING-specified mappings.
    """
    csv_description = raw["description"]

    status_raw = raw["status"].lower()
    mapped_status = CSV_STATUS_TO_MODEL.get(status_raw, "open")

    category_raw = raw["category"].lower()
    mapped_category = CSV_CATEGORY_TO_MODEL.get(category_raw)

    date_str = raw["date"].strip()
    parsed_date = datetime.fromisoformat(date_str)
    if parsed_date.tzinfo is None:
        parsed_date = parsed_date.replace(tzinfo=timezone.utc)

    branch = raw["ubicación"].strip().lower()

    category_enum = None
    if mapped_category:
        category_enum = IncidentCategory(mapped_category)

    return Incident(
        id=raw["incident_id"].strip(),
        title=csv_description,
        description=csv_description,
        category=category_enum,
        status=IncidentStatus(mapped_status),
        origin=IncidentOrigin.CUSTOMER,  # All historical records are customer-reported
        branch=branch,
        created_at=parsed_date,
        updated_at=parsed_date,
    )


def seed_incidents(csv_path: Path, database_path: Path) -> dict[str, int]:
    """Load incidents from CSV and insert them into TinyDB.

    Returns a dict with counts of inserted, skipped (duplicate), and
    invalid rows.
    """
    rows = load_csv_rows(csv_path)
    if not rows:
        raise ValueError("CSV file is empty (no data rows)")

    validate_headers(list(rows[0].keys()))

    inserted = 0
    skipped_duplicates = 0
    invalid_rows: list[tuple[int, str, list[str]]] = []  # (csv_line_number, incident_id, errors)

    database_path.parent.mkdir(parents=True, exist_ok=True)
    with TinyDB(database_path) as database:
        table = database.table("incidents")
        incident_query = Query()

        for idx, raw in enumerate(rows, start=2):  # CSV line numbers (1-based, header=1)
            incident_id = raw.get("incident_id", "").strip()

            # Validate the row
            errors = validate_seed_row(raw)
            if errors:
                invalid_rows.append((idx, incident_id or f"row_{idx}", errors))
                continue

            # Check for duplicates (idempotency)
            if table.contains(incident_query.id == incident_id):
                skipped_duplicates += 1
                continue

            # Transform and insert
            incident = transform_row(raw)
            table.insert(incident.to_document())
            inserted += 1

    return {
        "inserted": inserted,
        "skipped_duplicates": skipped_duplicates,
        "invalid": len(invalid_rows),
        "invalid_details": invalid_rows,
    }


def report_results(results: dict[str, int | list[tuple[int, str, list[str]]]]) -> None:
    """Print a summary of the seeding operation to the console."""
    separator = "=" * 70
    print(separator)
    print("  CARGA DE INCIDENCIAS HISTÓRICAS — RESUMEN")
    print(separator)
    print(f"  Insertadas:     {results['inserted']}")
    print(f"  Duplicadas (omitidas): {results['skipped_duplicates']}")
    print(f"  Inválidas (rechazadas): {results['invalid']}")
    print(separator)

    invalid_details: list[tuple[int, str, list[str]]] = results.get("invalid_details", [])  # type: ignore[assignment]
    if invalid_details:
        print()
        print("  DETALLE DE REGISTROS INVÁLIDOS:")
        print(f"  {'LÍNEA':>6}  {'ID':<20}  ERRORES")
        print(f"  {'─'*6}  {'─'*20}  {'─'*40}")
        for line_num, row_id, errors in invalid_details:
            for err in errors:
                print(f"  {line_num:>6}  {row_id:<20}  {err}")
        print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Carga incidencias históricas desde CSV a TinyDB."
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=Path("data/raw/incidents.csv"),
        help="Ruta al CSV de incidencias (columnas: incident_id, category, description, date, ubicación, status)",
    )
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("data/auth.json"),
        help="Ruta a la base de datos TinyDB (default: data/auth.json)",
    )
    args = parser.parse_args()

    if not args.csv.exists():
        parser.exit(1, f"ERROR: No se encontró el archivo CSV: {args.csv}\n")

    try:
        results = seed_incidents(args.csv, args.database)
    except (ValueError, csv.Error, OSError) as error:
        parser.exit(1, f"ERROR durante la carga: {error}\n")

    report_results(results)

    if results["invalid"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()