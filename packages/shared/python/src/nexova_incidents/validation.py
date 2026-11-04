"""Canonical validation rules shared by the analyzer API and historical seed."""

from collections.abc import Mapping, Sequence
from datetime import datetime

import pandas as pd
from pydantic import EmailStr, TypeAdapter, ValidationError

REQUIRED_COLUMNS_ANALYZER = (
    "incident_id", "category", "title", "description", "status", "priority",
    "created_at", "assigned_to",
)
REQUIRED_COLUMNS_SEED = (
    "date", "client_company", "category", "description", "agent_id", "status",
    "customer_email",
)
ALLOWED_STATUS = {"open", "pending", "resolved", "closed", "discarded"}
ALLOWED_PRIORITY = {"low", "medium", "high"}
CLOSED_STATUSES = {"resolved", "closed"}
STATUS_LABELS = {
    "open": "abierto", "pending": "pendiente", "resolved": "cerrado",
    "closed": "cerrado", "discarded": "descartado",
}
CSV_STATUS_TO_MODEL = {"OPEN": "open", "CLOSED": "resolved", "DISCARDED": "discarded"}
CSV_CATEGORY_TO_MODEL = {
    "TECHNICAL": "technical_failure", "BILLING": "process_error",
    "ACCESS": "technical_failure", "HR_QUERY": "process_error",
    "COMPLAINT": "client_complaint",
}
_EMAIL_VALIDATOR = TypeAdapter(EmailStr)


def is_non_empty(value: object) -> bool:
    return value is not None and (not isinstance(value, str) or bool(value.strip()))


def _clean(value: object) -> object:
    return "" if value is None or (isinstance(value, float) and value != value) else value


def validate_seed_row(row: Mapping[str, object]) -> list[str]:
    """Validate one incidents-nexova.csv row and identify every invalid field."""
    errors = [
        f"{column}: missing or empty"
        for column in REQUIRED_COLUMNS_SEED
        if not isinstance(row.get(column), str) or not str(row.get(column)).strip()
    ]

    description = row.get("description")
    if isinstance(description, str) and description.strip() and not description[:120].strip():
        errors.append("description: the first 120 characters must contain a title")

    category = row.get("category")
    if is_non_empty(category) and category not in CSV_CATEGORY_TO_MODEL:
        errors.append(f"category: '{category}' is not a recognized category")

    status = row.get("status")
    if is_non_empty(status) and status not in CSV_STATUS_TO_MODEL:
        errors.append(f"status: '{status}' is not a valid status")

    date_value = row.get("date")
    if isinstance(date_value, str) and date_value:
        try:
            parsed = datetime.strptime(date_value, "%Y-%m-%d")
            if parsed.date().isoformat() != date_value:
                raise ValueError("Date must use YYYY-MM-DD")
        except (ValueError, TypeError):
            errors.append(f"date: '{date_value}' is not a valid YYYY-MM-DD date")

    email = row.get("customer_email")
    if is_non_empty(email):
        try:
            _EMAIL_VALIDATOR.validate_python(email)
        except ValidationError:
            errors.append("customer_email: invalid email")

    score = row.get("satisfaction_score")
    if status == "CLOSED" and not is_non_empty(score):
        errors.append("satisfaction_score: required for CLOSED incidents")
    elif is_non_empty(score):
        try:
            if not 1 <= float(score) <= 5:
                raise ValueError("Score out of range")
        except (ValueError, TypeError):
            errors.append("satisfaction_score: must be a number between 1 and 5")
    return errors


def validate_analyzer_rows(
    columns: Sequence[str],
    rows: Sequence[Mapping[str, object]],
    row_numbers: Sequence[int] | None = None,
) -> dict[str, list[int]]:
    """Validate analyzer or Nexova seed CSV rows with shared rules."""
    numbers = row_numbers if row_numbers is not None else range(2, len(rows) + 2)
    if "ticket_id" in columns:
        if any(column not in columns for column in REQUIRED_COLUMNS_SEED):
            return {"columnas obligatorias ausentes": list(numbers)}
        issues: dict[str, list[int]] = {}
        for row_number, row in zip(numbers, rows, strict=True):
            for error in validate_seed_row(row):
                issues.setdefault(error.split(":", 1)[0], []).append(row_number)
        return issues

    missing_columns = [column for column in REQUIRED_COLUMNS_ANALYZER if column not in columns]
    if missing_columns:
        return {"columnas obligatorias ausentes": list(numbers)}

    issues = {}
    seen_ids: dict[str, list[int]] = {}
    for row_number, row in zip(numbers, rows, strict=True):
        row = {key: _clean(value) for key, value in row.items()}
        for column in REQUIRED_COLUMNS_ANALYZER:
            if not is_non_empty(row.get(column)):
                issues.setdefault("campo faltante", []).append(row_number)
                break

        status = row.get("status")
        if is_non_empty(status) and status not in ALLOWED_STATUS:
            issues.setdefault("status fuera de rango", []).append(row_number)
        priority = row.get("priority")
        if is_non_empty(priority) and priority not in ALLOWED_PRIORITY:
            issues.setdefault("priority fuera de rango", []).append(row_number)

        created_at = row.get("created_at")
        if is_non_empty(created_at):
            try:
                parsed_date = datetime.strptime(str(created_at).strip(), "%Y-%m-%d")
                if parsed_date.date().isoformat() != str(created_at).strip():
                    raise ValueError("Date must use YYYY-MM-DD")
            except (ValueError, TypeError):
                issues.setdefault("fecha inválida", []).append(row_number)

        incident_id = row.get("incident_id")
        if is_non_empty(incident_id):
            seen_ids.setdefault(str(incident_id).strip(), []).append(row_number)

    for duplicate_rows in seen_ids.values():
        if len(duplicate_rows) > 1:
            issues.setdefault("incident_id duplicado", []).extend(duplicate_rows)
    return issues


def validate_dataframe(dataframe: pd.DataFrame) -> dict[str, list[int]]:
    """Validate a pandas CSV frame through the canonical row validator."""
    rows = dataframe.astype(object).where(dataframe.notna(), "").to_dict("records")
    return validate_analyzer_rows(
        list(dataframe.columns),
        rows,
        [int(row_number) + 2 for row_number in dataframe.index],
    )