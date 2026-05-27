import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    String,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.core.types import GUID, JSONType

import enum


class ChartType(str, enum.Enum):
    line = "line"
    bar = "bar"
    pie = "pie"
    area = "area"
    scatter = "scatter"
    funnel = "funnel"
    gauge = "gauge"
    kpi = "kpi"
    table = "table"
    pivot = "pivot"
    heatmap = "heatmap"
    treemap = "treemap"
    sankey = "sankey"
    map = "map"
    combo = "combo"
    donut = "donut"
    radar = "radar"


class Visualization(Base):
    __tablename__ = "visualizations"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    query_id = Column(GUID(), ForeignKey("queries.id"), nullable=False, index=True)
    chart_type = Column(Enum(ChartType), nullable=False)
    chart_config = Column(JSONType(), default=dict, nullable=False)
    created_by_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    query = relationship("Query", back_populates="visualizations")
    created_by = relationship("User")
