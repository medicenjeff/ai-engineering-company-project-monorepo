#!/usr/bin/env python3
"""Import the official Nexova CSV using the transformations in BRIEFING.md.

The original ticket ID is used only to derive a stable UUID for idempotency.
Without it, the UUID is derived from title and created_at.
"""

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from tinydb import Query, TinyDB

from ai_engineering_company_project_monorepo.models.incident import (
    Incident,
    IncidentCategory,
    IncidentOrigin,
    IncidentStatus,
)
from nexova_incidents import (
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
        validate_headers(reader.fieldnames)
        return [{key: value or "" for key, value in row.items() if key is not None} for row in reader]


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

    mapped_status = CSV_STATUS_TO_MODEL[raw["status"]]
    mapped_category = CSV_CATEGORY_TO_MODEL[raw["category"]]
    parsed_date = datetime.strptime(raw["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    title = csv_description[:120].strip()
    ticket_id = raw.get("ticket_id", "").strip()
    identity = f"ticket:{ticket_id}" if ticket_id else json.dumps([title, parsed_date.isoformat()])

    return Incident(
        id=str(uuid5(NAMESPACE_URL, f"nexova:incidents:{identity}")),
        title=title,
        description=csv_description,
        category=IncidentCategory(mapped_category),
        status=IncidentStatus(mapped_status),
        origin=IncidentOrigin.CUSTOMER,  # All historical records are customer-reported
        branch="central",
        created_at=parsed_date,
        updated_at=parsed_date,
    )


def seed_incidents(csv_path: Path, database_path: Path) -> dict[str, Any]:
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
            incident_id = raw.get("ticket_id", "").strip()

            # Validate the row
            errors = validate_seed_row(raw)
            if errors:
                invalid_rows.append((idx, incident_id or f"row_{idx}", errors))
                continue

            try:
                incident = transform_row(raw)
            except (ValueError, KeyError, TypeError) as error:
                invalid_rows.append((idx, incident_id or f"row_{idx}", [str(error)]))
                continue

            if table.contains(incident_query.id == incident.id):
                skipped_duplicates += 1
                continue

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
        default=Path("data/raw/incidents-nexova.csv"),
        help="Ruta al CSV histórico oficial de Nexova (ticket_id, date, category, description, status y campos del helpdesk)",
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