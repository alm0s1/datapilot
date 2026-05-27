from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.query import Query, QueryExecution
from app.models.user import User
from app.schemas.query import (
    QueryCreate, QueryResponse, QueryUpdate, QueryExecuteRequest,
    QueryExecutionResponse, QueryResult,
)
from app.services.query_executor import execute_query, execute_raw_sql

router = APIRouter(prefix="/queries", tags=["Queries"])


class RawSqlRequest(BaseModel):
    connection_id: UUID
    sql: str
    limit: int = 1000
    timeout_seconds: int = 30


@router.get("", response_model=List[QueryResponse])
async def list_queries(
    collection_id: UUID = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Query).filter(Query.is_archived == False)
    if collection_id:
        q = q.filter(Query.collection_id == collection_id)
    return q.offset(skip).limit(limit).all()


@router.get("/{query_id}", response_model=QueryResponse)
async def get_query(
    query_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Query).filter(Query.id == query_id).first()
    if not query:
        raise HTTPException(status_code=404, detail="Query not found")
    return query


@router.post("", response_model=QueryResponse, status_code=status.HTTP_201_CREATED)
async def create_query(
    data: QueryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = Query(
        **data.model_dump(),
        created_by_id=current_user.id,
    )
    db.add(query)
    db.commit()
    db.refresh(query)
    return query


@router.put("/{query_id}", response_model=QueryResponse)
async def update_query(
    query_id: UUID,
    data: QueryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Query).filter(Query.id == query_id).first()
    if not query:
        raise HTTPException(status_code=404, detail="Query not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(query, field, value)
    db.commit()
    db.refresh(query)
    return query


@router.delete("/{query_id}")
async def delete_query(
    query_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Query).filter(Query.id == query_id).first()
    if not query:
        raise HTTPException(status_code=404, detail="Query not found")
    query.is_archived = True
    db.commit()
    return {"message": "Query archived"}


@router.post("/{query_id}/execute", response_model=QueryResult)
async def execute(
    query_id: UUID,
    params: QueryExecuteRequest = QueryExecuteRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Query).filter(Query.id == query_id).first()
    if not query:
        raise HTTPException(status_code=404, detail="Query not found")
    try:
        result = execute_query(
            db, query, current_user.id,
            sql_override=params.sql_override,
            limit=params.limit,
            timeout=params.timeout_seconds,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{query_id}/executions", response_model=List[QueryExecutionResponse])
async def get_executions(
    query_id: UUID,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    executions = (
        db.query(QueryExecution)
        .filter(QueryExecution.query_id == query_id)
        .order_by(QueryExecution.executed_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return executions


@router.post("/execute-raw", response_model=QueryResult)
async def execute_raw(
    params: RawSqlRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Execute SQL directly without creating a saved query first."""
    try:
        result = execute_raw_sql(
            db,
            params.connection_id,
            params.sql,
            current_user.id,
            limit=params.limit,
            timeout=params.timeout_seconds,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
