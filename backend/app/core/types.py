"""
Database-agnostic type definitions.
Provides UUID and JSON types that work with both PostgreSQL and SQLite.
"""
import uuid
import json

from sqlalchemy import String, Text, TypeDecorator
from sqlalchemy.types import JSON


class GUID(TypeDecorator):
    """Platform-independent GUID type.
    Uses PostgreSQL's UUID type when available, otherwise stores as CHAR(36).
    """
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            if isinstance(value, uuid.UUID):
                return str(value)
            return str(uuid.UUID(value))
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            if not isinstance(value, uuid.UUID):
                return uuid.UUID(value)
        return value

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import UUID as PG_UUID
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(String(36))


class JSONType(TypeDecorator):
    """Platform-independent JSON type.
    Uses PostgreSQL's JSONB type when available, otherwise uses generic JSON.
    Falls back to TEXT with JSON serialization if JSON is not natively supported.
    """
    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import JSONB
            return dialect.type_descriptor(JSONB)
        return dialect.type_descriptor(JSON)

    def process_bind_param(self, value, dialect):
        if dialect.name not in ("postgresql",) and not isinstance(dialect.type_descriptor(JSON), JSON):
            if value is not None:
                return json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        if isinstance(value, str):
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                pass
        return value
