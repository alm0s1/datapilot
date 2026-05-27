export interface DatabaseConnection {
  id: string;
  name: string;
  type: DatabaseType;
  host: string | null;
  port: number | null;
  database_name: string | null;
  username: string | null;
  ssl_enabled: boolean;
  is_active: boolean;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export type DatabaseType =
  | "postgresql"
  | "mysql"
  | "sqlite"
  | "sqlserver"
  | "oracle"
  | "mariadb"
  | "mongodb"
  | "redis"
  | "dataset";

export interface DatabaseConnectionCreate {
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  database_name?: string;
  username?: string;
  password?: string;
  ssl_enabled?: boolean;
  connection_string?: string;
}

export interface TableInfo {
  name: string;
  schema_name?: string;
  row_count?: number;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  foreign_key?: string;
}

export interface SchemaInfo {
  tables: TableInfo[];
}
