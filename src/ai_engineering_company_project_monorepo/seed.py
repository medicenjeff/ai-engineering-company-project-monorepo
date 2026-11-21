import argparse
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from pydantic import TypeAdapter, ValidationError
from tinydb import Query, TinyDB

from ai_engineering_company_project_monorepo.models.supplier import (
    SupplierCreate,
    SupplierResponse,
)


def load_suppliers(source_path: Path) -> list[SupplierCreate]:
    try:
        source = source_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise
    except UnicodeError:
        raise ValueError("El archivo de entrada debe estar codificado en UTF-8.") from None
    except OSError:
        raise OSError("No se pudo leer el archivo de entrada.") from None
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
    try:
        database_path.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        raise OSError("No se pudo crear el directorio de destino de la base de datos.") from None

    try:
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
    except (OSError, ValueError):
        raise OSError("No se pudo leer o escribir la base de datos configurada.") from None
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
        input_is_file = arguments.input.is_file()
    except OSError:
        print("ERROR: No se pudo acceder al archivo de entrada indicado.", file=sys.stderr)
        sys.exit(1)
    if not input_is_file:
        print("ERROR: No existe un archivo de entrada regular.", file=sys.stderr)
        sys.exit(1)
    try:
        count = seed_suppliers(arguments.input, arguments.database)
    except FileNotFoundError:
        print("ERROR: No se encontró el archivo de entrada o la base de datos.", file=sys.stderr)
        sys.exit(1)
    except OSError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
    except ValidationError:
        print("ERROR: El archivo contiene datos de proveedores incompletos o inválidos.", file=sys.stderr)
        sys.exit(1)
    except ValueError as error:
        print(f"ERROR: No se pudo validar la entrada: {error}", file=sys.stderr)
        sys.exit(1)
    print(f"Proveedores insertados: {count}.")