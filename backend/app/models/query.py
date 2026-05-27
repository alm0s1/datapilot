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


class QueryType(str, enum.Enum):
    sql = "sql"
    visual = "visual"
    native = "native"


class ExecutionStatus(str, enum.Enum):
    success = "success"
    error = "error"
    timeout = "timeout"
    running = "running"


class Query(Base):
    __tablename__ = "queries"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    connection_id = Column(GUID(), ForeignKey("database_connections.id"), nullable=False, index=True)
    sql_query = Column(Text, nullable=True)
    query_type = Column(Enum(QueryType), default=QueryType.sql, nullable=False)
    visual_config = Column(JSONType(), nullable=True)
    collection_id = Column(GUID(), ForeignKey("collections.id"), nullable=True, index=True)
    created_by_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)

    connection = relationship("DatabaseConnection", back_populates="queries")
    created_by = relationship("User", back_populates="queries")
    collection = relationship("Collection", backref="queries")
    executions = relationship("QueryExecution", back_populates="query", lazy="dynamic")
    visualizations = relationship("Visualization", back_populates="query", lazy="dynamic")


class QueryExecution(Base):
    __tablename__ = "query_executions"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    query_id = Column(GUID(), ForeignKey("queries.id", ondelete="CASCADE"), nullable=False, index=True)
    executed_by_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    executed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    execution_time_ms = Column(Integer, nullable=True)
    row_count = Column(Integer, nullable=True)
    status = Column(Enum(ExecutionStatus), nullable=False)
    error_message = Column(Text, nullable=True)
    result_cache_key = Column(String(255), nullable=True)

    query = relationship("Query", back_populates="executions")
    executed_by = relationship("User")
