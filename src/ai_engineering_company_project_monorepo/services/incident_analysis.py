from typing import Any

import pandas as pd

from nexova_incidents import (
    ALLOWED_PRIORITY,
    ALLOWED_STATUS,
    CLOSED_STATUSES,
    REQUIRED_COLUMNS_ANALYZER,
    STATUS_LABELS,
    validate_analyzer_rows,
)

REQUIRED_COLUMNS = REQUIRED_COLUMNS_ANALYZER


def validate_dataframe(dataframe: pd.DataFrame) -> dict[str, list[int]]:
    """Return CSV line numbers grouped by validation problem."""
    rows = dataframe.astype(object).where(dataframe.notna(), "").to_dict("records")
    return validate_analyzer_rows(
        list(dataframe.columns),
        rows,
        [int(row_number) + 2 for row_number in dataframe.index],
    )


def analyze_dataframe(dataframe: pd.DataFrame) -> dict[str, Any]:
    """Validate a dataframe and return the canonical analysis summary."""
    issues = validate_dataframe(dataframe)
    invalid_row_numbers = {
        row_number for row_numbers in issues.values() for row_number in row_numbers
    }
    valid_dataframe = dataframe.drop(
        index=[row_number - 2 for row_number in invalid_row_numbers],
        errors="ignore",
    )

    if all(column in valid_dataframe.columns for column in ("category", "status")):
        categories = {
            str(category): int(count)
            for category, count in valid_dataframe["category"].value_counts().sort_index().items()
        }
        statuses = (
            valid_dataframe["status"]
            .map({**STATUS_LABELS, "OPEN": "abierto", "CLOSED": "cerrado", "DISCARDED": "descartado"})
            .fillna(valid_dataframe["status"])
            .value_counts()
            .sort_index()
        )
        status_counts = {
            str(status): int(count) for status, count in statuses.items()
        }
    else:
        categories = {}
        status_counts = {}

    if "satisfaction_score" in valid_dataframe.columns and "status" in valid_dataframe.columns:
        scores = pd.to_numeric(
            valid_dataframe.loc[
                valid_dataframe["status"].isin(CLOSED_STATUSES | {"CLOSED"}),
                "satisfaction_score",
            ],
            errors="coerce",
        ).where(lambda values: values.between(1, 5)).dropna()
    else:
        scores = pd.Series(dtype="float64")

    return {
        "total_processed": len(dataframe),
        "valid_records": len(valid_dataframe),
        "invalid_records": len(dataframe) - len(valid_dataframe),
        "by_category": categories,
        "by_status": status_counts,
        "average_satisfaction_closed": (
            round(float(scores.mean()), 2) if not scores.empty else None
        ),
        "satisfaction_scored_closed_cases": len(scores),
        "validation_issues": {
            issue_type: {"count": len(rows), "rows": rows}
            for issue_type, rows in issues.items()
        },
    }


def summary_to_rows(summary: dict[str, Any]) -> list[dict[str, object]]:
    """Convert an analysis summary into rows suitable for CSV export."""
    results: list[dict[str, object]] = [
        {"metric": "total_procesados", "value": summary["total_processed"], "details": ""},
        {"metric": "registros_validos", "value": summary["valid_records"], "details": ""},
        {"metric": "registros_invalidos", "value": summary["invalid_records"], "details": ""},
    ]
    results.extend(
        {
            "metric": f"categoria_{category}",
            "value": count,
            "details": "registros válidos",
        }
        for category, count in summary["by_category"].items()
    )
    results.extend(
        {
            "metric": f"estado_{status}",
            "value": count,
            "details": "registros válidos",
        }
        for status, count in summary["by_status"].items()
    )
    results.append(
        {
            "metric": "satisfaccion_media_casos_cerrados",
            "value": summary["average_satisfaction_closed"] or "",
            "details": (
                f"{summary['satisfaction_scored_closed_cases']} caso(s) con puntuación"
            ),
        }
    )
    results.extend(
        {
            "metric": f"problema_{issue_type}",
            "value": issue_details["count"],
            "details": f"filas CSV: {', '.join(map(str, issue_details['rows']))}",
        }
        for issue_type, issue_details in summary["validation_issues"].items()
    )
    return results
