from typing import Optional, Any, Dict
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class VisualizationBase(BaseModel):
    name: str
    query_id: UUID
    chart_type: str
    chart_config: Dict[str, Any] = {}


class VisualizationCreate(VisualizationBase):
    pass


class VisualizationUpdate(BaseModel):
    name: Optional[str] = None
    chart_type: Optional[str] = None
    chart_config: Optional[Dict[str, Any]] = None


class VisualizationResponse(VisualizationBase):
    id: UUID
    created_by_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
