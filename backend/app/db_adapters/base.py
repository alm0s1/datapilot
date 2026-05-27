from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class BaseAdapter(ABC):
    """Abstract base class for all database adapters."""

    @abstractmethod
    def connect(self, config: Dict[str, Any]) -> Any:
        """Establish connection to the database."""
        pass

    @abstractmethod
    def disconnect(self, connection: Any) -> None:
        """Close the database connection."""
        pass

    @abstractmethod
    def test_connection(self, config: Dict[str, Any]) -> bool:
        """Test if connection can be established."""
        pass

    @abstractmethod
    def execute_query(
        self, config: Dict[str, Any], sql: str, params: Optional[Dict] = None, limit: int = 1000, timeout: int = 30
    ) -> Dict[str, Any]:
        """
        Execute a query and return results in standardized format.

        Returns:
            {
                "columns": [{"name": "col1", "type": "string"}, ...],
                "rows": [[val1, val2, ...], ...],
                "metadata": {"row_count": N, "execution_time_ms": T, "truncated": bool}
            }
        """
        pass

    @abstractmethod
    def fetch_tables(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Fetch all tables from the database.

        Returns:
            [{"name": "table1", "schema": "public", "row_count": 100}, ...]
        """
        pass

    @abstractmethod
    def fetch_columns(self, config: Dict[str, Any], table_name: str) -> List[Dict[str, Any]]:
        """
        Fetch columns for a specific table.

        Returns:
            [{"name": "col1", "type": "varchar", "nullable": True, "primary_key": False}, ...]
        """
        pass

    def get_connection_config(self, connection_model) -> Dict[str, Any]:
        """Extract connection config from model."""
        return {
            "host": connection_model.host,
            "port": connection_model.port,
            "database": connection_model.database_name,
            "username": connection_model.username,
            "password": connection_model.decrypted_password if hasattr(connection_model, "decrypted_password") else None,
            "ssl_enabled": connection_model.ssl_enabled,
            "connection_string": connection_model.connection_string,
        }
