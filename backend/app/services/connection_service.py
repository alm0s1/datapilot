from typing import Dict, Any, List, Optional

from sqlalchemy.orm import Session

from app.models.database_connection import DatabaseConnection, DatabaseType
from app.schemas.database_connection import DatabaseConnectionCreate, DatabaseConnectionUpdate
from app.utils.encryption import encrypt_value, decrypt_value
from app.db_adapters.base import BaseAdapter
from app.db_adapters.postgresql import PostgreSQLAdapter
from app.db_adapters.mysql import MySQLAdapter
from app.db_adapters.sqlite import SQLiteAdapter
from app.db_adapters.dataset import DatasetAdapter


def _get_adapter(db_type: str) -> BaseAdapter:
    adapters = {
        DatabaseType.postgresql: PostgreSQLAdapter,
        DatabaseType.mysql: MySQLAdapter,
        DatabaseType.mariadb: MySQLAdapter,
        DatabaseType.sqlite: SQLiteAdapter,
        DatabaseType.dataset: DatasetAdapter,
    }
    adapter_cls = adapters.get(db_type)
    if not adapter_cls:
        raise ValueError(f"Unsupported database type: {db_type}")
    return adapter_cls()


def _get_config(connection: DatabaseConnection) -> Dict[str, Any]:
    if connection.type == DatabaseType.dataset:
        # For dataset connections, provide table_name from database_name field
        return {
            "table_name": connection.database_name,
        }
    password = ""
    if connection.encrypted_password:
        password = decrypt_value(connection.encrypted_password)
    return {
        "host": connection.host,
        "port": connection.port,
        "database": connection.database_name,
        "username": connection.username,
        "password": password,
        "ssl_enabled": connection.ssl_enabled,
        "connection_string": connection.connection_string,
    }


def create_connection(db: Session, data: DatabaseConnectionCreate, user_id: str) -> DatabaseConnection:
    encrypted_pwd = encrypt_value(data.password) if data.password else None
    conn = DatabaseConnection(
        name=data.name,
        type=data.type,
        host=data.host,
        port=data.port,
        database_name=data.database_name,
        username=data.username,
        encrypted_password=encrypted_pwd,
        connection_string=data.connection_string,
        ssl_enabled=data.ssl_enabled,
        ssl_cert=data.ssl_cert,
        created_by_id=user_id,
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


def test_connection(connection: DatabaseConnection) -> Dict[str, Any]:
    try:
        adapter = _get_adapter(connection.type)
        config = _get_config(connection)
        success = adapter.test_connection(config)
        return {"success": success, "message": "Connection successful" if success else "Connection failed"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def get_schema(connection: DatabaseConnection) -> List[Dict[str, Any]]:
    adapter = _get_adapter(connection.type)
    config = _get_config(connection)
    return adapter.fetch_tables(config)


def get_table_columns(connection: DatabaseConnection, table_name: str) -> List[Dict[str, Any]]:
    adapter = _get_adapter(connection.type)
    config = _get_config(connection)
    return adapter.fetch_columns(config, table_name)


def execute_on_connection(
    connection: DatabaseConnection, sql: str, limit: int = 1000, timeout: int = 30
) -> Dict[str, Any]:
    adapter = _get_adapter(connection.type)
    config = _get_config(connection)
    return adapter.execute_query(config, sql, limit=limit, timeout=timeout)
