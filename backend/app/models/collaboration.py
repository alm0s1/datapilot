import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.core.types import GUID, JSONType

import enum


class ResourceType(str, enum.Enum):
    dashboard = "dashboard"
    query = "query"
    visualization = "visualization"
    collection = "collection"
    connection = "connection"


class PermissionLevel(str, enum.Enum):
    owner = "owner"
    editor = "editor"
    viewer = "viewer"


class AnnotationType(str, enum.Enum):
    point = "point"
    range = "range"
    region = "region"


class Comment(Base):
    __tablename__ = "comments"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    resource_type = Column(Enum(ResourceType), nullable=False, index=True)
    resource_id = Column(GUID(), nullable=False, index=True)
    parent_id = Column(GUID(), ForeignKey("comments.id"), nullable=True)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

    user = relationship("User")
    replies = relationship("Comment", backref="parent", remote_side="Comment.id")


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    dashboard_id = Column(GUID(), ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False, index=True)
    widget_id = Column(GUID(), ForeignKey("dashboard_widgets.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    annotation_type = Column(Enum(AnnotationType), nullable=False)
    content = Column(Text, nullable=False)
    position_data = Column(JSONType(), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User")
    dashboard = relationship("Dashboard")


class VersionHistory(Base):
    __tablename__ = "version_history"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    resource_type = Column(Enum(ResourceType), nullable=False, index=True)
    resource_id = Column(GUID(), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    snapshot = Column(JSONType(), nullable=False)
    changed_by_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    change_description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    changed_by = relationship("User")


class ResourcePermission(Base):
    __tablename__ = "resource_permissions"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    resource_type = Column(Enum(ResourceType), nullable=False, index=True)
    resource_id = Column(GUID(), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=True)
    permission_level = Column(Enum(PermissionLevel), nullable=False)
    granted_by_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", foreign_keys=[user_id])
    granted_by = relationship("User", foreign_keys=[granted_by_id])
