from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum


class IncidentCategory(str, Enum):
    """Categorías del gestor centralizado definidas en BRIEFING.md."""

    TECHNICAL_FAILURE = "technical_failure"
    PROCESS_ERROR = "process_error"
    CLIENT_COMPLAINT = "client_complaint"
    CANDIDATE_ISSUE = "candidate_issue"
    STAFF_ISSUE = "staff_issue"
    SLA_BREACH = "sla_breach"
    DATA_QUALITY = "data_quality"
    OTHER = "other"


class IncidentBranch(str, Enum):
    CENTRAL = "central"
    VALENCIA_OPERATIONS = "valencia_operations"
    MIAMI_OFFICE = "miami_office"
    REMOTE = "remote"


class IncidentStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    DISCARDED = "discarded"


class IncidentOrigin(str, Enum):
    CUSTOMER = "customer"
    BRANCH = "branch"
    INTERNAL = "internal"


@dataclass(frozen=True, slots=True)
class Incident:
    id: str
    title: str
    description: str
    category: IncidentCategory = IncidentCategory.OTHER
    status: IncidentStatus = IncidentStatus.OPEN
    origin: IncidentOrigin = IncidentOrigin.INTERNAL
    branch: str = "central"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self) -> None:
        """Validaciones de integridad tras la inicialización."""
        if not isinstance(self.id, str) or not self.id.strip():
            raise ValueError("id is required and must not be empty")
        # Validar título
        if not isinstance(self.title, str) or not self.title.strip() or len(self.title) > 120:
            raise ValueError("title must contain between 1 and 120 characters")

        # Validar descripción
        if not isinstance(self.description, str) or not self.description.strip():
            raise ValueError("description is required and must not be empty")

        # Validar status
        if not isinstance(self.status, IncidentStatus):
            raise ValueError(
                "status must be one of: open, in_progress, resolved, discarded"
            )

        # Validar origin
        if not isinstance(self.origin, IncidentOrigin):
            raise ValueError(
                "origin must be one of: customer, branch, internal"
            )

        if not isinstance(self.category, IncidentCategory):
            valid_categories = [c.value for c in IncidentCategory]
            raise ValueError(
                f"category must be one of: {', '.join(valid_categories)}"
            )

        # Validar branch
        if not isinstance(self.branch, str) or self.branch not in IncidentBranch:
            raise ValueError("branch must be one of: central, valencia_operations, miami_office, remote")
        for name, value in (("created_at", self.created_at), ("updated_at", self.updated_at)):
            if not isinstance(value, datetime) or value.utcoffset() != timedelta(0):
                raise ValueError(f"{name} must be a timezone-aware UTC datetime")
        if self.updated_at < self.created_at:
            raise ValueError("updated_at must not precede created_at")

    def to_document(self) -> dict[str, object]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "category": self.category.value,
            "status": self.status.value,
            "origin": self.origin.value,
            "branch": self.branch,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    @classmethod
    def from_document(cls, document: Mapping[str, object]) -> "Incident":
        expected_fields = {
            "id",
            "title",
            "description",
            "category",
            "status",
            "origin",
            "branch",
            "created_at",
            "updated_at",
        }
        if document.keys() != expected_fields:
            raise ValueError("Incident document must contain exactly the supported fields")

        created_at = document["created_at"]
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        if not isinstance(created_at, datetime):
            raise TypeError("created_at must be a datetime or ISO 8601 string")

        updated_at = document["updated_at"]
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at)
        if not isinstance(updated_at, datetime):
            raise TypeError("updated_at must be a datetime or ISO 8601 string")

        category_raw = document["category"]
        if not isinstance(category_raw, str):
            raise TypeError("category must be an IncidentCategory or string")
        category = IncidentCategory(category_raw)

        status_raw = document["status"]
        if isinstance(status_raw, str):
            status = IncidentStatus(status_raw)
        elif isinstance(status_raw, IncidentStatus):
            status = status_raw
        else:
            raise TypeError("status must be an IncidentStatus or string")

        origin_raw = document["origin"]
        if isinstance(origin_raw, str):
            origin = IncidentOrigin(origin_raw)
        elif isinstance(origin_raw, IncidentOrigin):
            origin = origin_raw
        else:
            raise TypeError("origin must be an IncidentOrigin or string")

        return cls(
            id=document["id"],
            title=document["title"],
            description=document["description"],
            category=category,
            status=status,
            origin=origin,
            branch=document["branch"],
            created_at=created_at,
            updated_at=updated_at,
        )