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
from app.core.types import GUID

import enum


class DatabaseType(str, enum.Enum):
    postgresql = "postgresql"
    mysql = "mysql"
    sqlite = "sqlite"
    sqlserver = "sqlserver"
    oracle = "oracle"
    mariadb = "mariadb"
    mongodb = "mongodb"
    redis = "redis"
    dataset = "dataset"


class DatabaseConnection(Base):
    __tablename__ = "database_connections"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    type = Column(Enum(DatabaseType), nullable=False)
    host = Column(String(255), nullable=True)
    port = Column(Integer, nullable=True)
    database_name = Column(String(255), nullable=True)
    username = Column(String(255), nullable=True)
    encrypted_password = Column(Text, nullable=True)
    connection_string = Column(Text, nullable=True)
    ssl_enabled = Column(Boolean, default=False, nullable=False)
    ssl_cert = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by_id = Column(GUID(), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    created_by = relationship("User", backref="database_connections")
    queries = relationship("Query", back_populates="connection", lazy="dynamic")
