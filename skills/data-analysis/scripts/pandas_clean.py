"""
Safe snippet for basic pandas cleaning. Copy and adapt for your dataset.
Run: python pandas_clean.py  (ensure pandas is installed)
"""
import argparse
from pathlib import Path
import sys

import pandas as pd


def load_csv(csv_path: Path) -> pd.DataFrame:
    try:
        csv_is_file = csv_path.is_file()
    except OSError:
        raise OSError("No se pudo acceder a la ruta del CSV.") from None
    if not csv_is_file:
        raise FileNotFoundError("No existe el archivo CSV indicado.")
    try:
        dataframe = pd.read_csv(csv_path)
    except PermissionError:
        raise PermissionError("No hay permiso para leer el archivo CSV.") from None
    except (OSError, pd.errors.EmptyDataError, pd.errors.ParserError, UnicodeError, ValueError):
        raise ValueError("No se pudo leer el CSV o su formato no es válido.") from None
    if len(dataframe.columns) == 0:
        raise ValueError("El archivo CSV no contiene encabezados.")
    return dataframe


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspecciona y limpia un archivo CSV.")
    parser.add_argument("csv_path", nargs="?", type=Path, default=Path("data.csv"), help="ruta al CSV")
    arguments = parser.parse_args()

    try:
        dataframe = load_csv(arguments.csv_path)
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("df_shape", dataframe.shape)
    print("df_column_count", len(dataframe.columns))

    dataframe = dataframe.dropna(axis=1, how="all")
    print("df_shape_after_drop_all_null_cols", dataframe.shape)

    dataframe.columns = dataframe.columns.str.strip().str.lower().str.replace(" ", "_")

    before = len(dataframe)
    dataframe = dataframe.drop_duplicates()
    print("rows_dropped_duplicates", before - len(dataframe))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
