from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


class IncidentCategory(str, Enum):
    """Categorías de incidencia según el negocio de Nexova.

    Basadas en las tres líneas de negocio (headhunting, outsourcing,
    formación corporativa) más categorías operativas internas.
    """

    RECRUITMENT = "recruitment"
    OUTSOURCING = "outsourcing"
    TRAINING = "training"
    PAYROLL = "payroll"
    COMPLIANCE = "compliance"
    INTERNAL = "internal"


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
    category: IncidentCategory | None = None
    status: IncidentStatus = IncidentStatus.OPEN
    origin: IncidentOrigin = IncidentOrigin.INTERNAL
    branch: str = "central"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self) -> None:
        """Validaciones de integridad tras la inicialización."""
        # Validar título
        if not self.title or not self.title.strip():
            raise ValueError("title is required and must not be empty")

        # Validar descripción
        if not self.description or not self.description.strip():
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

        # Validar category si se proporciona
        if self.category is not None and not isinstance(self.category, IncidentCategory):
            valid_categories = [c.value for c in IncidentCategory]
            raise ValueError(
                f"category must be one of: {', '.join(valid_categories)}"
            )

        # Validar branch
        if not self.branch or not self.branch.strip():
            raise ValueError("branch is required and must not be empty")

    def to_document(self) -> dict[str, object]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "category": self.category.value if self.category else None,
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
        category: IncidentCategory | None = None
        if category_raw is not None:
            if isinstance(category_raw, str):
                category = IncidentCategory(category_raw)
            elif not isinstance(category_raw, IncidentCategory):
                raise TypeError("category must be an IncidentCategory or string")

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