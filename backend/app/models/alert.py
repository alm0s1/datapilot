import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    Numeric,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.core.types import GUID, JSONType

import enum


class ConditionType(str, enum.Enum):
    threshold = "threshold"
    change = "change"
    anomaly = "anomaly"


class AlertExecutionStatus(str, enum.Enum):
    triggered = "triggered"
    not_triggered = "not_triggered"
    error = "error"


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    query_id = Column(GUID(), ForeignKey("queries.id"), nullable=False, index=True)
    condition_type = Column(Enum(ConditionType), nullable=False)
    condition_config = Column(JSONType(), nullable=False)
    notification_channels = Column(JSONType(), nullable=True)
    schedule_cron = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_by_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    query = relationship("Query")
    created_by = relationship("User")
    executions = relationship("AlertExecution", back_populates="alert", lazy="dynamic")


class AlertExecution(Base):
    __tablename__ = "alert_executions"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    alert_id = Column(GUID(), ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False, index=True)
    executed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    status = Column(Enum(AlertExecutionStatus), nullable=False)
    result_value = Column(Numeric, nullable=True)
    notification_sent = Column(Boolean, default=False, nullable=False)
    error_message = Column(Text, nullable=True)

    alert = relationship("Alert", back_populates="executions")
