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


class WidgetType(str, enum.Enum):
    chart = "chart"
    text = "text"
    filter = "filter"
    image = "image"
    kpi = "kpi"


class Dashboard(Base):
    __tablename__ = "dashboards"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    layout_config = Column(JSONType(), default=dict, nullable=False)
    filter_config = Column(JSONType(), nullable=True)
    collection_id = Column(GUID(), ForeignKey("collections.id"), nullable=True, index=True)
    created_by_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    is_public = Column(Boolean, default=False, nullable=False)
    public_token = Column(String(255), unique=True, nullable=True, index=True)

    created_by = relationship("User", back_populates="dashboards")
    collection = relationship("Collection", backref="dashboards")
    widgets = relationship("DashboardWidget", back_populates="dashboard", cascade="all, delete-orphan", lazy="selectin")


class DashboardWidget(Base):
    __tablename__ = "dashboard_widgets"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    dashboard_id = Column(GUID(), ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False, index=True)
    query_id = Column(GUID(), ForeignKey("queries.id"), nullable=True)
    visualization_id = Column(GUID(), ForeignKey("visualizations.id"), nullable=True)
    widget_type = Column(Enum(WidgetType), nullable=False)
    position_x = Column(Integer, default=0, nullable=False)
    position_y = Column(Integer, default=0, nullable=False)
    width = Column(Integer, default=4, nullable=False)
    height = Column(Integer, default=3, nullable=False)
    config = Column(JSONType(), default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    dashboard = relationship("Dashboard", back_populates="widgets")
    query = relationship("Query")
    visualization = relationship("Visualization")
