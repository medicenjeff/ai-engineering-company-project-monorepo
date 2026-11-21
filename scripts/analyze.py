"""Analyze an incidents CSV file from the command line."""

import argparse
from pathlib import Path
import sys
from typing import Any

import pandas as pd

from ai_engineering_company_project_monorepo.services.incident_analysis import (
    analyze_dataframe,
    summary_to_rows,
)


def analyze_csv(csv_path: Path) -> pd.DataFrame:
    """Load the CSV file into a pandas DataFrame."""
    try:
        dataframe = pd.read_csv(csv_path)
    except FileNotFoundError:
        raise ValueError("No existe el fichero CSV indicado.") from None
    except PermissionError:
        raise ValueError("No hay permiso para leer el fichero CSV.") from None
    except (OSError, pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeError, ValueError):
        raise ValueError("No se pudo leer el CSV o su formato no es válido.") from None
    if dataframe.empty and len(dataframe.columns) == 0:
        raise ValueError("El fichero CSV no contiene cabeceras.")
    return dataframe


def build_result_rows(summary: dict[str, Any]) -> list[dict[str, object]]:
    """Build one exportable row for each calculated metric."""
    return summary_to_rows(summary)


def print_summary(
    csv_path: Path,
    columns: list[str],
    results: list[dict[str, object]],
) -> None:
    """Print the analysis results in an aligned console table."""
    separator = "=" * 78
    print(separator)
    print("RESUMEN DEL ANÁLISIS")
    print(separator)
    print("Fichero   : CSV cargado")
    print(f"Columnas  : {len(columns)}")
    print("-" * 78)
    print(f"{'MÉTRICA':<42} {'VALOR':>10}  DETALLES")
    print("-" * 78)
    for result in results:
        print(
            f"{str(result['metric']):<42} "
            f"{str(result['value']):>10}  {result['details']}"
        )
    print(separator)


def export_results(results: list[dict[str, object]], output_path: Path) -> None:
    """Export the calculated metrics to a CSV file."""
    try:
        pd.DataFrame(results, columns=["metric", "value", "details"]).to_csv(
            output_path, index=False
        )
    except (OSError, TypeError, ValueError) as error:
        raise OSError(f"No se pudo escribir el archivo de resultados: {output_path}") from error


def ask_for_export(results: list[dict[str, object]]) -> bool:
    """Ask whether the user wants to export the results."""
    while True:
        try:
            answer = input("¿Deseas exportar los resultados a CSV? [s / n]. ").strip().lower()
        except EOFError:
            return True
        except OSError:
            print("ERROR: No se pudo leer la respuesta de entrada.", file=sys.stderr)
            return False
        if answer == "s":
            output_path = Path("results.csv")
            try:
                export_results(results, output_path)
            except OSError as error:
                print(f"ERROR: {error}", file=sys.stderr)
                return False
            print(f"Resultados exportados en: {output_path}")
            return True
        if answer == "n":
            print("No se han exportado los resultados.")
            return True
        print("Respuesta no válida. Escribe s o n.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Analiza un fichero CSV de incidencias."
    )
    parser.add_argument("csv_path", type=Path, help="ruta al fichero CSV")
    args = parser.parse_args()

    try:
        source_is_file = args.csv_path.is_file()
    except OSError:
        print("ERROR: No se pudo acceder al fichero CSV indicado.", file=sys.stderr)
        return 1
    if not source_is_file:
        print("ERROR: No existe un fichero CSV regular en la ruta indicada.", file=sys.stderr)
        return 1

    try:
        dataframe = analyze_csv(args.csv_path)
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    try:
        summary = analyze_dataframe(dataframe)
    except (KeyError, TypeError, ValueError):
        print("ERROR: No se pudo analizar el contenido del CSV; revisa sus columnas y valores.", file=sys.stderr)
        return 1
    results = build_result_rows(summary)
    print_summary(args.csv_path, [str(column) for column in dataframe.columns], results)
    return 0 if ask_for_export(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
