"""Shared constants and validation for incident processing.

Extracted from the original incident_analysis module so both the
analysis pipeline and the seed script use the same rules.
"""

from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from enum import Enum

# ── CSV column names (previous project / analyzer schema) ──────────────
REQUIRED_COLUMNS_ANALYZER = (
    "incident_id",
    "category",
    "title",
    "description",
    "status",
    "priority",
    "created_at",
    "assigned_to",
)

REQUIRED_COLUMNS_SEED = (
    "incident_id",
    "category",
    "description",
    "date",
    "ubicación",
    "status",
)

# ── Allowed values ─────────────────────────────────────────────────────
ALLOWED_STATUS = {"open", "pending", "resolved", "closed", "discarded"}
ALLOWED_STATUS_SEED = {"open", "pending", "in_progress", "resolved", "closed", "discarded"}
ALLOWED_PRIORITY = {"low", "medium", "high"}
CLOSED_STATUSES = {"resolved", "closed"}

STATUS_LABELS: dict[str, str] = {
    "open": "abierto",
    "pending": "pendiente",
    "resolved": "cerrado",
    "closed": "cerrado",
    "discarded": "descartado",
}

# ── CSV → Model mappings ───────────────────────────────────────────────
# Status mapping: maps CSV statuses to our Incident model status values
CSV_STATUS_TO_MODEL: dict[str, str] = {
    "open": "open",
    "pending": "in_progress",
    "in_progress": "in_progress",
    "resolved": "resolved",
    "closed": "resolved",
    "discarded": "discarded",
}

# Category mapping: maps CSV category strings to IncidentCategory values
CSV_CATEGORY_TO_MODEL: dict[str, str] = {
    "recruitment": "recruitment",
    "executive_search": "recruitment",
    "outsourcing": "outsourcing",
    "customer_service": "outsourcing",
    "training": "training",
    "corporate_training": "training",
    "leave": "internal",
    "payroll": "payroll",
    "compliance": "compliance",
    "hr": "internal",
    "internal": "internal",
    "it": "internal",
    "facilities": "internal",
    "other": "internal",
}


def is_non_empty(value: object) -> bool:
    """Return True if the value is not None and not a blank string."""
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip() != ""
    return True


def validate_seed_row(row: Mapping[str, object]) -> list[str]:
    """Validate a single seed CSV row and return a list of error messages.

    Each error message describes a specific validation failure.
    An empty list means the row is valid.
    """
    errors: list[str] = []

    # incident_id
    if not is_non_empty(row.get("incident_id")):
        errors.append("incident_id: missing or empty")

    # description (maps to title in the model)
    if not is_non_empty(row.get("description")):
        errors.append("description: missing or empty")

    # category
    category = row.get("category")
    if not is_non_empty(category):
        errors.append("category: missing or empty")
    elif isinstance(category, str) and category.strip() not in CSV_CATEGORY_TO_MODEL:
        errors.append(f"category: '{category}' is not a recognized category")

    # status
    status = row.get("status")
    if not is_non_empty(status):
        errors.append("status: missing or empty")
    elif isinstance(status, str) and status.strip() not in ALLOWED_STATUS_SEED:
        errors.append(f"status: '{status}' is not a valid status")

    # date (maps to created_at)
    date_val = row.get("date")
    if not is_non_empty(date_val):
        errors.append("date: missing or empty")
    elif isinstance(date_val, str):
        try:
            datetime.fromisoformat(date_val.strip()).replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            errors.append(f"date: '{date_val}' is not a valid ISO date")

    # ubicación (maps to branch)
    if not is_non_empty(row.get("ubicación")):
        errors.append("ubicación: missing or empty")

    return errors