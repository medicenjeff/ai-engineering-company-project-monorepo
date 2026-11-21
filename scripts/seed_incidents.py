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
    try:
        with csv_path.open(newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh, strict=True)
            if reader.fieldnames is None:
                raise ValueError("El CSV no contiene encabezados.")
            validate_headers(reader.fieldnames)
            rows = []
            for row in reader:
                if None in row:
                    raise ValueError(f"El CSV contiene columnas adicionales en la línea {reader.line_num}.")
                rows.append({key: value or "" for key, value in row.items()})
            return rows
    except FileNotFoundError:
        raise ValueError("No existe el archivo CSV indicado.") from None
    except PermissionError:
        raise ValueError("No hay permiso para leer el archivo CSV.") from None
    except (OSError, csv.Error, UnicodeError):
        raise ValueError("No se pudo leer el CSV o su formato no es válido.") from None


def validate_headers(fieldnames: list[str]) -> None:
    """Check that required columns are present in the CSV headers."""
    duplicates = sorted({column for column in fieldnames if fieldnames.count(column) > 1})
    if duplicates:
        raise ValueError(f"CSV contains duplicate columns: {', '.join(duplicates)}")
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

    try:
        database_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        raise OSError("No se pudo crear el directorio de destino de la base de datos.") from None

    try:
        with TinyDB(database_path) as database:
            table = database.table("incidents")
            incident_query = Query()

            for idx, raw in enumerate(rows, start=2):  # CSV line numbers (1-based, header=1)
                incident_id = raw.get("ticket_id", "").strip()

                errors = validate_seed_row(raw)
                if errors:
                    invalid_rows.append((idx, incident_id or f"row_{idx}", errors))
                    continue

                try:
                    incident = transform_row(raw)
                except (ValueError, KeyError, TypeError):
                    invalid_rows.append((idx, incident_id or f"row_{idx}", ["No se pudo convertir la fila; revisa fecha, categoría y estado."]))
                    continue

                if table.contains(incident_query.id == incident.id):
                    skipped_duplicates += 1
                    continue

                table.insert(incident.to_document())
                inserted += 1
    except (OSError, ValueError):
        raise OSError("No se pudo leer o escribir la base de datos configurada.") from None

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
        print(file=sys.stderr)
        print("  DETALLE DE REGISTROS INVÁLIDOS:", file=sys.stderr)
        print(f"  {'LÍNEA':>6}  {'CAMPO':<24}  ERROR", file=sys.stderr)
        print(f"  {'─'*6}  {'─'*24}  {'─'*32}", file=sys.stderr)
        for line_num, _row_id, errors in invalid_details:
            for err in errors:
                field = err.partition(":")[0]
                if not field.replace("_", "").isalnum():
                    field = "fila"
                print(f"  {line_num:>6}  {field:<24}  valor no válido", file=sys.stderr)
        print(file=sys.stderr)


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

    try:
        csv_is_file = args.csv.is_file()
    except OSError:
        print("ERROR: No se pudo acceder al CSV indicado.", file=sys.stderr)
        sys.exit(1)
    if not csv_is_file:
        print("ERROR: No existe un archivo CSV regular en la ruta indicada.", file=sys.stderr)
        sys.exit(1)

    try:
        results = seed_incidents(args.csv, args.database)
    except (ValueError, csv.Error, OSError) as error:
        print(f"ERROR durante la carga: {error}", file=sys.stderr)
        sys.exit(1)

    report_results(results)

    if results["invalid"] > 0:
        print(f"ERROR: Se rechazaron {results['invalid']} filas inválidas.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()