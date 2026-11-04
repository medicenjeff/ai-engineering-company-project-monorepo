from io import BytesIO
from io import StringIO
import csv
from typing import Annotated

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from tinydb import TinyDB

from ai_engineering_company_project_monorepo.api.dependencies import get_database
from ai_engineering_company_project_monorepo.api.schemas import (
    IncidentCreate,
    IncidentResponse,
    IncidentSummary,
    IncidentUpdateStatus,
)
from ai_engineering_company_project_monorepo.models.incident import (
    Incident,
    IncidentBranch,
    IncidentCategory,
    IncidentOrigin,
    IncidentStatus,
)
from ai_engineering_company_project_monorepo.services.incident_analysis import (
    analyze_dataframe,
    summary_to_rows,
)
from ai_engineering_company_project_monorepo.services.incident_service import (
    compute_summary,
    create_incident,
    get_incident_by_id,
    list_incidents,
    update_incident_status,
)

router = APIRouter(prefix="/api/incidents", tags=["incidents"])
Database = Annotated[TinyDB, Depends(get_database)]
CsvFile = Annotated[UploadFile, File(description="Fichero CSV de incidencias")]


# ── Existing analysis endpoints ──────────────────────────────────────────


@router.post("/analyze")
async def analyze_incidents(request: Request, file: CsvFile) -> dict[str, object]:
    """Analyze an uploaded incidents CSV file."""
    try:
        dataframe = pd.read_csv(BytesIO(await file.read()))
    except (pd.errors.EmptyDataError, pd.errors.ParserError, UnicodeError) as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV inválido: {error}",
        ) from error

    if dataframe.empty and len(dataframe.columns) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El CSV no contiene cabeceras",
        )
    summary_obj = analyze_dataframe(dataframe)
    request.app.state.last_incident_analysis = summary_obj
    return summary_obj


@router.get("/results/export", response_class=StreamingResponse)
def export_incident_results(request: Request) -> StreamingResponse:
    """Download the most recent incident analysis as CSV."""
    summary_obj = getattr(request.app.state, "last_incident_analysis", None)
    if summary_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hay ningún análisis disponible para exportar",
        )

    csv_buffer = StringIO()
    writer = csv.DictWriter(csv_buffer, fieldnames=["metric", "value", "details"])
    writer.writeheader()
    writer.writerows(summary_to_rows(summary_obj))
    return StreamingResponse(
        iter([csv_buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=results.csv"},
    )


# ── CRUD management endpoints ────────────────────────────────────────────


@router.post("", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
def create_incident_endpoint(
    payload: IncidentCreate,
    database: Database,
) -> IncidentResponse:
    """Create a new incident. All required fields are validated by the schema."""
    incident = create_incident(
        database=database,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        origin=payload.origin,
        branch=payload.branch,
    )
    return _to_response(incident)


@router.get("/summary", response_model=IncidentSummary)
def get_incident_summary(database: Database) -> IncidentSummary:
    """Return aggregated metrics: total by status, category, origin and branch."""
    return compute_summary(database)


@router.get("", response_model=list[IncidentResponse])
def list_incidents_endpoint(
    database: Database,
    status: IncidentStatus | None = Query(default=None),
    origin: IncidentOrigin | None = Query(default=None),
    branch: IncidentBranch | None = Query(default=None),
    category: IncidentCategory | None = Query(default=None),
) -> list[IncidentResponse]:
    """Return the list of incidents with optional filters."""
    incidents = list_incidents(
        database,
        status=status,
        origin=origin,
        branch=branch,
        category=category,
    )
    return [_to_response(i) for i in incidents]


@router.get("/{id}", response_model=IncidentResponse)
def get_incident_detail(id: str, database: Database) -> IncidentResponse:
    """Return the detail of a single incident. Returns 404 if not found."""
    incident = get_incident_by_id(database, id)
    if incident is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incidencia no encontrada",
        )
    return _to_response(incident)


@router.patch("/{id}/status", response_model=IncidentResponse)
def update_status_endpoint(
    id: str,
    payload: IncidentUpdateStatus,
    database: Database,
) -> IncidentResponse:
    """Update only the status of an incident with lifecycle validation."""
    try:
        incident = update_incident_status(database, id, payload.status)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incidencia no encontrada",
        ) from None
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from None
    return _to_response(incident)


# ── Helpers ──────────────────────────────────────────────────────────────


def _to_response(incident: Incident) -> IncidentResponse:
    """Map a domain Incident to its Pydantic response schema."""
    return IncidentResponse(
        id=incident.id,
        title=incident.title,
        description=incident.description,
        category=incident.category.value if incident.category else None,
        status=incident.status.value,
        origin=incident.origin.value,
        branch=incident.branch,
        created_at=incident.created_at.isoformat(),
        updated_at=incident.updated_at.isoformat(),
    )
