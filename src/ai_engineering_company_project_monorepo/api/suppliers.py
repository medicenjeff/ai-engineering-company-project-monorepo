from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from tinydb import TinyDB
from tinydb.table import Document

from ai_engineering_company_project_monorepo.api.dependencies import get_database
from ai_engineering_company_project_monorepo.models.supplier import (
    ProductCategory,
    SupplierCreate,
    SupplierRateUpdate,
    SupplierRecord,
    SupplierStatusUpdate,
)


router = APIRouter(prefix="/suppliers", tags=["suppliers"])
Database = Annotated[TinyDB, Depends(get_database)]


def _to_record(document: Document) -> SupplierRecord:
    return SupplierRecord(id=document.doc_id, **document)


@router.post("", response_model=SupplierRecord, status_code=status.HTTP_201_CREATED)
def create_supplier(payload: SupplierCreate, database: Database) -> SupplierRecord:
    updated_at = datetime.now(timezone.utc)
    document = {
        **payload.model_dump(mode="json"),
        "updated_at": updated_at.isoformat(),
    }
    supplier_id = database.table("suppliers").insert(document)
    return SupplierRecord(id=supplier_id, **document)


@router.get("", response_model=list[SupplierRecord])
def list_suppliers(
    database: Database,
    country: str | None = None,
    category: ProductCategory | None = None,
) -> list[SupplierRecord]:
    documents = database.table("suppliers").all()
    if country is not None:
        documents = [document for document in documents if document["country"] == country]
    if category is not None:
        documents = [
            document
            for document in documents
            if category.value in document["product_categories"]
        ]
    return [_to_record(document) for document in documents]


@router.get("/{id}", response_model=SupplierRecord)
def get_supplier(id: int, database: Database) -> SupplierRecord:
    document = database.table("suppliers").get(doc_id=id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found",
        )
    return _to_record(document)


@router.patch("/{id}/rate", response_model=SupplierRecord)
def update_supplier_rate(
    id: int,
    payload: SupplierRateUpdate,
    database: Database,
) -> SupplierRecord:
    table = database.table("suppliers")
    document = table.get(doc_id=id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found",
        )

    updated_at = datetime.now(timezone.utc)
    table.update(
        {"rate": str(payload.rate), "updated_at": updated_at.isoformat()},
        doc_ids=[id],
    )
    updated_document = table.get(doc_id=id)
    return _to_record(updated_document)


@router.patch("/{id}/status", response_model=SupplierRecord)
def update_supplier_status(
    id: int,
    payload: SupplierStatusUpdate,
    database: Database,
) -> SupplierRecord:
    table = database.table("suppliers")
    document = table.get(doc_id=id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found",
        )

    updated_at = datetime.now(timezone.utc)
    table.update(
        {"status": payload.status.value, "updated_at": updated_at.isoformat()},
        doc_ids=[id],
    )
    updated_document = table.get(doc_id=id)
    return _to_record(updated_document)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(id: int, database: Database) -> Response:
    removed_ids = database.table("suppliers").remove(doc_ids=[id])
    if not removed_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)