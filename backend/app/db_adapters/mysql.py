import time
from typing import Any, Dict, List, Optional

from sqlalchemy import create_engine, text, inspect

from app.db_adapters.base import BaseAdapter


class MySQLAdapter(BaseAdapter):
    def _build_url(self, config: Dict[str, Any]) -> str:
        if config.get("connection_string"):
            return config["connection_string"]
        password = config.get("password", "")
        host = config.get("host", "localhost")
        port = config.get("port", 3306)
        database = config.get("database", "")
        username = config.get("username", "")
        return f"mysql+pymysql://{username}:{password}@{host}:{port}/{database}"

    def connect(self, config: Dict[str, Any]) -> Any:
        url = self._build_url(config)
        engine = create_engine(url, pool_size=5, max_overflow=10, pool_timeout=30)
        return engine

    def disconnect(self, connection: Any) -> None:
        if connection:
            connection.dispose()

    def test_connection(self, config: Dict[str, Any]) -> bool:
        engine = None
        try:
            engine = self.connect(config)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False
        finally:
            if engine:
                engine.dispose()

    def execute_query(
        self, config: Dict[str, Any], sql: str, params: Optional[Dict] = None, limit: int = 1000, timeout: int = 30
    ) -> Dict[str, Any]:
        engine = None
        try:
            engine = self.connect(config)
            start = time.time()
            with engine.connect() as conn:
                conn.execute(text(f"SET max_execution_time = {timeout * 1000}"))
                result = conn.execute(text(sql), params or {})
                columns = [{"name": col, "type": "unknown"} for col in result.keys()]
                rows = [list(row) for row in result.fetchmany(limit)]
                elapsed = int((time.time() - start) * 1000)

                return {
                    "columns": columns,
                    "rows": rows,
                    "metadata": {
                        "row_count": len(rows),
                        "execution_time_ms": elapsed,
                        "truncated": len(rows) >= limit,
                    },
                }
        finally:
            if engine:
                engine.dispose()

    def fetch_tables(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        engine = None
        try:
            engine = self.connect(config)
            inspector = inspect(engine)
            tables = []
            for table_name in inspector.get_table_names():
                tables.append({"name": table_name, "schema": config.get("database", "")})
            return tables
        finally:
            if engine:
                engine.dispose()

    def fetch_columns(self, config: Dict[str, Any], table_name: str) -> List[Dict[str, Any]]:
        engine = None
        try:
            engine = self.connect(config)
            inspector = inspect(engine)
            columns = []
            pk_cols = {c for c in (inspector.get_pk_constraint(table_name).get("constrained_columns") or [])}

            for col in inspector.get_columns(table_name):
                columns.append({
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                    "primary_key": col["name"] in pk_cols,
                })
            return columns
        finally:
            if engine:
                engine.dispose()
