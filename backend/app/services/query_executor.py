import time
from typing import Dict, Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.query import Query, QueryExecution, ExecutionStatus
from app.models.database_connection import DatabaseConnection
from app.services.connection_service import execute_on_connection


def execute_query(
    db: Session,
    query: Query,
    user_id: UUID,
    sql_override: Optional[str] = None,
    limit: int = 1000,
    timeout: int = 30,
) -> Dict[str, Any]:
    sql = sql_override or query.sql_query
    if not sql:
        raise ValueError("No SQL query to execute")

    connection = db.query(DatabaseConnection).filter(DatabaseConnection.id == query.connection_id).first()
    if not connection:
        raise ValueError("Database connection not found")

    execution = QueryExecution(
        query_id=query.id,
        executed_by_id=user_id,
        status=ExecutionStatus.running,
    )
    db.add(execution)
    db.commit()

    try:
        start = time.time()
        result = execute_on_connection(connection, sql, limit=limit, timeout=timeout)
        elapsed = int((time.time() - start) * 1000)

        execution.status = ExecutionStatus.success
        execution.execution_time_ms = elapsed
        execution.row_count = result["metadata"]["row_count"]
        db.commit()

        return result
    except Exception as e:
        execution.status = ExecutionStatus.error
        execution.error_message = str(e)
        db.commit()
        raise


def execute_raw_sql(
    db: Session,
    connection_id: UUID,
    sql: str,
    user_id: UUID,
    limit: int = 1000,
    timeout: int = 30,
) -> Dict[str, Any]:
    connection = db.query(DatabaseConnection).filter(DatabaseConnection.id == connection_id).first()
    if not connection:
        raise ValueError("Database connection not found")

    return execute_on_connection(connection, sql, limit=limit, timeout=timeout)
