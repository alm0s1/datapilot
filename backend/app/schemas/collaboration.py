from typing import Optional, List, Any, Dict
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class CommentBase(BaseModel):
    resource_type: str
    resource_id: UUID
    content: str
    parent_id: Optional[UUID] = None


class CommentCreate(CommentBase):
    pass


class CommentUpdate(BaseModel):
    content: str


class CommentResponse(CommentBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    is_deleted: bool

    model_config = {"from_attributes": True}


class AnnotationBase(BaseModel):
    dashboard_id: UUID
    widget_id: Optional[UUID] = None
    annotation_type: str
    content: str
    position_data: Optional[Dict[str, Any]] = None


class AnnotationCreate(AnnotationBase):
    pass


class AnnotationUpdate(BaseModel):
    content: Optional[str] = None
    position_data: Optional[Dict[str, Any]] = None


class AnnotationResponse(AnnotationBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VersionHistoryResponse(BaseModel):
    id: UUID
    resource_type: str
    resource_id: UUID
    version_number: int
    snapshot: Dict[str, Any]
    changed_by_id: UUID
    change_description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ResourcePermissionCreate(BaseModel):
    resource_type: str
    resource_id: UUID
    user_id: UUID
    permission_level: str


class ResourcePermissionResponse(BaseModel):
    id: UUID
    resource_type: str
    resource_id: UUID
    user_id: UUID
    permission_level: str
    granted_by_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
