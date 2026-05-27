from typing import Optional, Any, Dict, List
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class DashboardBase(BaseModel):
    name: str
    description: Optional[str] = None
    collection_id: Optional[UUID] = None


class DashboardCreate(DashboardBase):
    layout_config: Dict[str, Any] = {}
    filter_config: Optional[Dict[str, Any]] = None


class DashboardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    layout_config: Optional[Dict[str, Any]] = None
    filter_config: Optional[Dict[str, Any]] = None
    collection_id: Optional[UUID] = None


class WidgetBase(BaseModel):
    widget_type: str
    query_id: Optional[UUID] = None
    visualization_id: Optional[UUID] = None
    position_x: int = 0
    position_y: int = 0
    width: int = 4
    height: int = 3
    config: Dict[str, Any] = {}


class WidgetCreate(WidgetBase):
    pass


class WidgetUpdate(BaseModel):
    widget_type: Optional[str] = None
    query_id: Optional[UUID] = None
    visualization_id: Optional[UUID] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    config: Optional[Dict[str, Any]] = None


class WidgetResponse(WidgetBase):
    id: UUID
    dashboard_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DashboardResponse(DashboardBase):
    id: UUID
    layout_config: Dict[str, Any]
    filter_config: Optional[Dict[str, Any]]
    created_by_id: UUID
    created_at: datetime
    updated_at: datetime
    is_archived: bool
    is_public: bool
    public_token: Optional[str] = None
    widgets: List[WidgetResponse] = []

    model_config = {"from_attributes": True}


class DashboardListResponse(DashboardBase):
    id: UUID
    created_by_id: UUID
    created_at: datetime
    updated_at: datetime
    is_archived: bool
    is_public: bool

    model_config = {"from_attributes": True}
