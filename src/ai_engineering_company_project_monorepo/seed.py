import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from pydantic import TypeAdapter, ValidationError
from tinydb import Query, TinyDB

from ai_engineering_company_project_monorepo.models.supplier import (
    SupplierCreate,
    SupplierResponse,
)


def load_suppliers(source_path: Path) -> list[SupplierCreate]:
    source = source_path.read_text(encoding="utf-8")
    if source_path.suffix.lower() == ".md":
        match = re.search(
            r"(?ms)^Proveedores iniciales\b.*?^```json\s*(.*?)^```",
            source,
        )
        if match is None:
            raise ValueError("No se encontro el bloque JSON de proveedores iniciales.")
        source = match.group(1)
    return TypeAdapter(list[SupplierCreate]).validate_json(source)


def seed_suppliers(source_path: Path, database_path: Path) -> int:
    suppliers = load_suppliers(source_path)
    if not suppliers:
        raise ValueError("La lista de proveedores iniciales no puede estar vacia.")

    updated_at = datetime.now(timezone.utc)
    documents = [
        SupplierResponse(**supplier.model_dump(), updated_at=updated_at).model_dump(
            mode="json"
        )
        for supplier in suppliers
    ]
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with TinyDB(database_path) as database:
        table = database.table("suppliers")
        supplier_query = Query()
        inserted = 0
        for document in documents:
            existing_supplier = (supplier_query.name == document["name"]) & (
                supplier_query.country == document["country"]
            )
            if table.contains(existing_supplier):
                continue
            table.insert(document)
            inserted += 1
    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(description="Carga proveedores iniciales en TinyDB.")
    parser.add_argument("--input", type=Path, default=Path("CONTEXT.md"))
    parser.add_argument(
        "--database",
        type=Path,
        default=Path(os.getenv("TINYDB_PATH", "data/auth.json")),
    )
    arguments = parser.parse_args()
    try:
        count = seed_suppliers(arguments.input, arguments.database)
    except FileNotFoundError:
        parser.exit(
            1,
            "No se encontro el archivo de entrada o de base de datos. "
            f"Entrada: {arguments.input}; base: {arguments.database}. "
            "Proporciona los proveedores del CONTEXT como JSON con --input.\n",
        )
    except (OSError, ValidationError, ValueError, json.JSONDecodeError) as error:
        parser.exit(1, f"No se pudo completar la carga: {error}\n")
    print(f"Proveedores insertados: {count}. Base de datos: {arguments.database}")