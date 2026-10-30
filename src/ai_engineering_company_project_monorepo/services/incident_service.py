"""Service layer for incident CRUD operations backed by TinyDB."""

from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4

from tinydb import Query, TinyDB

from ai_engineering_company_project_monorepo.models.incident import (
    Incident,
    IncidentCategory,
    IncidentOrigin,
    IncidentStatus,
)


# ── Valid state transitions ──────────────────────────────────────────────
_ALLOWED_TRANSITIONS: dict[IncidentStatus, set[IncidentStatus]] = {
    IncidentStatus.OPEN: {IncidentStatus.IN_PROGRESS, IncidentStatus.DISCARDED},
    IncidentStatus.IN_PROGRESS: {IncidentStatus.RESOLVED, IncidentStatus.DISCARDED},
}

_FINAL_STATUSES: set[IncidentStatus] = {
    IncidentStatus.RESOLVED,
    IncidentStatus.DISCARDED,
}


def validate_status_transition(
    current: IncidentStatus,
    target: IncidentStatus,
) -> None:
    """Raise ValueError if the transition from *current* to *target* is not allowed."""
    if current == target:
        raise ValueError(
            f"La incidencia ya está en estado '{current.value}'"
        )

    if current in _FINAL_STATUSES:
        raise ValueError(
            f"No se puede cambiar el estado desde '{current.value}': "
            "es un estado final"
        )

    allowed = _ALLOWED_TRANSITIONS.get(current)
    if allowed is None or target not in allowed:
        display_allowed = ", ".join(s.value for s in (allowed or set()))
        raise ValueError(
            f"Transición no válida: de '{current.value}' solo se puede "
            f"ir a {display_allowed}"
        )


def create_incident(
    database: TinyDB,
    *,
    title: str,
    description: str,
    category: IncidentCategory | None = None,
    origin: IncidentOrigin = IncidentOrigin.INTERNAL,
    branch: str = "central",
) -> Incident:
    """Insert a new incident document and return the domain model."""
    now = datetime.now(timezone.utc)
    incident = Incident(
        id=str(uuid4()),
        title=title,
        description=description,
        category=category,
        origin=origin,
        branch=branch,
        created_at=now,
        updated_at=now,
    )
    database.table("incidents").insert(incident.to_document())
    return incident


def get_incident_by_id(database: TinyDB, incident_id: str) -> Incident | None:
    """Return a single incident by its UUID, or None."""
    record = database.table("incidents").get(Query().id == incident_id)
    return Incident.from_document(record) if record is not None else None


def list_incidents(
    database: TinyDB,
    *,
    status: IncidentStatus | None = None,
    origin: IncidentOrigin | None = None,
    branch: str | None = None,
    category: IncidentCategory | None = None,
) -> list[Incident]:
    """Return incidents matching the optional filters."""
    table = database.table("incidents")
    records = table.all()
    incidents = [Incident.from_document(doc) for doc in records]

    if status is not None:
        incidents = [i for i in incidents if i.status == status]
    if origin is not None:
        incidents = [i for i in incidents if i.origin == origin]
    if branch is not None:
        incidents = [i for i in incidents if i.branch == branch]
    if category is not None:
        incidents = [i for i in incidents if i.category == category]

    return incidents


def update_incident_status(
    database: TinyDB,
    incident_id: str,
    new_status: IncidentStatus,
) -> Incident:
    """Update the status of an incident after validating the transition.

    Returns the updated Incident.
    Raises ValueError if the transition is invalid.
    Raises KeyError if the incident does not exist.
    """
    table = database.table("incidents")
    record = table.get(Query().id == incident_id)
    if record is None:
        raise KeyError(f"Incident '{incident_id}' not found")

    incident = Incident.from_document(record)
    validate_status_transition(incident.status, new_status)

    now = datetime.now(timezone.utc)
    updated = replace(incident, status=new_status, updated_at=now)
    table.update(updated.to_document(), doc_ids=[record.doc_id])
    return updated


def compute_summary(database: TinyDB) -> dict[str, dict[str, int]]:
    """Return aggregate metrics across all incidents.

    Returns a dict with four keys:
        by_status, by_category, by_origin, by_branch
    each mapping a label → count.
    """
    records = database.table("incidents").all()
    incidents = [Incident.from_document(doc) for doc in records]

    by_status: dict[str, int] = {}
    by_category: dict[str, int] = {}
    by_origin: dict[str, int] = {}
    by_branch: dict[str, int] = {}

    for incident in incidents:
        by_status[incident.status.value] = by_status.get(incident.status.value, 0) + 1
        cat = incident.category.value if incident.category else "none"
        by_category[cat] = by_category.get(cat, 0) + 1
        by_origin[incident.origin.value] = by_origin.get(incident.origin.value, 0) + 1
        by_branch[incident.branch] = by_branch.get(incident.branch, 0) + 1

    return {
        "by_status": dict(sorted(by_status.items())),
        "by_category": dict(sorted(by_category.items())),
        "by_origin": dict(sorted(by_origin.items())),
        "by_branch": dict(sorted(by_branch.items())),
    }