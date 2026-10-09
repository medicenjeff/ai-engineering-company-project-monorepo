from datetime import datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ProductCategory(str, Enum):
    EXECUTIVE_SEARCH = "executive_search"
    CUSTOMER_SERVICE_OUTSOURCING = "customer_service_outsourcing"
    CORPORATE_TRAINING = "corporate_training"


class SupplierStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class SupplierBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    country: str
    product_categories: list[ProductCategory] = Field(min_length=1)
    rate: Decimal = Field(gt=0)
    status: SupplierStatus


class SupplierCreate(SupplierBase):
    pass


class SupplierResponse(SupplierBase):
    updated_at: datetime


class SupplierRecord(SupplierResponse):
    id: int


class SupplierRateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rate: Decimal = Field(gt=0)


class SupplierStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: SupplierStatus


Supplier = SupplierResponse