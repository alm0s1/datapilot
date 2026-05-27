from typing import Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class DatabaseConnectionBase(BaseModel):
    name: str
    type: str
    host: Optional[str] = None
    port: Optional[int] = None
    database_name: Optional[str] = None
    username: Optional[str] = None
    ssl_enabled: bool = False


class DatabaseConnectionCreate(DatabaseConnectionBase):
    password: Optional[str] = None
    connection_string: Optional[str] = None
    ssl_cert: Optional[str] = None


class DatabaseConnectionUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssl_enabled: Optional[bool] = None
    connection_string: Optional[str] = None


class DatabaseConnectionResponse(DatabaseConnectionBase):
    id: UUID
    is_active: bool
    created_by_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConnectionTestResponse(BaseModel):
    success: bool
    message: str


class TableInfo(BaseModel):
    name: str
    schema_name: Optional[str] = None
    row_count: Optional[int] = None


class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool = True
    primary_key: bool = False
    foreign_key: Optional[str] = None


class SchemaInfo(BaseModel):
    tables: list[TableInfo]
