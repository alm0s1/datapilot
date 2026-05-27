from typing import Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class CollectionBase(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[UUID] = None


class CollectionCreate(CollectionBase):
    pass


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[UUID] = None


class CollectionResponse(CollectionBase):
    id: UUID
    created_by_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
