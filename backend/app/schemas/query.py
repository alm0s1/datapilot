from typing import Optional, Any, Dict, List
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class QueryBase(BaseModel):
    name: str
    description: Optional[str] = None
    connection_id: UUID
    sql_query: Optional[str] = None
    query_type: str = "sql"
    visual_config: Optional[Dict[str, Any]] = None
    collection_id: Optional[UUID] = None


class QueryCreate(QueryBase):
    pass


class QueryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sql_query: Optional[str] = None
    visual_config: Optional[Dict[str, Any]] = None
    collection_id: Optional[UUID] = None


class QueryResponse(QueryBase):
    id: UUID
    created_by_id: UUID
    created_at: datetime
    updated_at: datetime
    is_archived: bool

    model_config = {"from_attributes": True}


class QueryExecuteRequest(BaseModel):
    sql_override: Optional[str] = None
    limit: int = 1000
    timeout_seconds: int = 30


class QueryExecutionResponse(BaseModel):
    id: UUID
    query_id: UUID
    executed_at: datetime
    execution_time_ms: Optional[int]
    row_count: Optional[int]
    status: str
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}


class QueryResultColumn(BaseModel):
    name: str
    type: str


class QueryResult(BaseModel):
    columns: List[QueryResultColumn]
    rows: List[List[Any]]
    metadata: Dict[str, Any]


class VisualToSqlRequest(BaseModel):
    connection_id: UUID
    visual_config: Dict[str, Any]
