import time
from typing import Any, Dict, List, Optional

from sqlalchemy import text, inspect

from app.db_adapters.base import BaseAdapter
from app.core.database import engine as app_engine
from app.utils.json_serializer import to_native


class DatasetAdapter(BaseAdapter):
    """Adapter for querying dataset tables stored in the application database."""

    def connect(self, config: Dict[str, Any]) -> Any:
        return app_engine

    def disconnect(self, connection: Any) -> None:
        pass  # We don't dispose the app engine

    def test_connection(self, config: Dict[str, Any]) -> bool:
        try:
            with app_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    def execute_query(
        self, config: Dict[str, Any], sql: str, params: Optional[Dict] = None, limit: int = 1000, timeout: int = 30
    ) -> Dict[str, Any]:
        try:
            start = time.time()
            with app_engine.connect() as conn:
                result = conn.execute(text(sql), params or {})
                columns = [{"name": col, "type": "unknown"} for col in result.keys()]
                rows = [[to_native(v) for v in row] for row in result.fetchmany(limit)]
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
        except Exception as e:
            raise ValueError(f"Dataset query error: {str(e)}")

    def fetch_tables(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        table_name = config.get("table_name")
        if table_name:
            inspector = inspect(app_engine)
            all_tables = inspector.get_table_names()
            if table_name in all_tables:
                return [{"name": table_name, "schema": "main"}]
        return []

    def fetch_columns(self, config: Dict[str, Any], table_name: str) -> List[Dict[str, Any]]:
        try:
            inspector = inspect(app_engine)
            columns = []
            pk_cols = set()
            try:
                pk_constraint = inspector.get_pk_constraint(table_name)
                pk_cols = set(pk_constraint.get("constrained_columns") or [])
            except Exception:
                pass

            for col in inspector.get_columns(table_name):
                columns.append({
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                    "primary_key": col["name"] in pk_cols,
                })
            return columns
        except Exception as e:
            raise ValueError(f"Error fetching columns: {str(e)}")
