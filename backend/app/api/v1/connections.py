from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.database_connection import DatabaseConnection
from app.models.user import User
from app.schemas.database_connection import (
    DatabaseConnectionCreate, DatabaseConnectionResponse, DatabaseConnectionUpdate,
    ConnectionTestResponse, SchemaInfo, TableInfo, ColumnInfo,
)
from app.services.connection_service import (
    create_connection, test_connection, get_schema, get_table_columns,
)

router = APIRouter(prefix="/connections", tags=["Database Connections"])


@router.get("", response_model=List[DatabaseConnectionResponse])
async def list_connections(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connections = db.query(DatabaseConnection).filter(DatabaseConnection.is_active == True).all()
    return connections


@router.get("/{connection_id}", response_model=DatabaseConnectionResponse)
async def get_connection(
    connection_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(DatabaseConnection).filter(DatabaseConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    return conn


@router.post("", response_model=DatabaseConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_new_connection(
    data: DatabaseConnectionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = create_connection(db, data, str(current_user.id))
    return conn


@router.put("/{connection_id}", response_model=DatabaseConnectionResponse)
async def update_connection(
    connection_id: UUID,
    data: DatabaseConnectionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(DatabaseConnection).filter(DatabaseConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "password" and value:
            from app.utils.encryption import encrypt_value
            conn.encrypted_password = encrypt_value(value)
        else:
            setattr(conn, field, value)
    db.commit()
    db.refresh(conn)
    return conn


@router.delete("/{connection_id}")
async def delete_connection(
    connection_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(DatabaseConnection).filter(DatabaseConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    conn.is_active = False
    db.commit()
    return {"message": "Connection deleted"}


@router.post("/{connection_id}/test", response_model=ConnectionTestResponse)
async def test_db_connection(
    connection_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(DatabaseConnection).filter(DatabaseConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    result = test_connection(conn)
    return result


@router.get("/{connection_id}/schema", response_model=SchemaInfo)
async def get_db_schema(
    connection_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(DatabaseConnection).filter(DatabaseConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    tables = get_schema(conn)
    return {"tables": tables}


@router.get("/{connection_id}/tables/{table_name}/columns", response_model=List[ColumnInfo])
async def get_columns(
    connection_id: UUID,
    table_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conn = db.query(DatabaseConnection).filter(DatabaseConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    columns = get_table_columns(conn, table_name)
    return columns
