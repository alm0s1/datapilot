export interface Query {
  id: string;
  name: string;
  description: string | null;
  connection_id: string;
  sql_query: string | null;
  query_type: QueryType;
  visual_config: Record<string, unknown> | null;
  collection_id: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

export type QueryType = "sql" | "visual" | "native";

export interface QueryCreate {
  name: string;
  description?: string;
  connection_id: string;
  sql_query?: string;
  query_type?: QueryType;
  visual_config?: Record<string, unknown>;
  collection_id?: string;
}

export interface QueryExecution {
  id: string;
  query_id: string;
  executed_at: string;
  execution_time_ms: number | null;
  row_count: number | null;
  status: "success" | "error" | "timeout" | "running";
  error_message: string | null;
}

export interface QueryResultColumn {
  name: string;
  type: string;
}

export interface QueryResult {
  columns: QueryResultColumn[];
  rows: unknown[][];
  metadata: {
    row_count: number;
    execution_time_ms: number;
    truncated: boolean;
  };
}

export type ChartType =
  | "line"
  | "bar"
  | "pie"
  | "area"
  | "scatter"
  | "funnel"
  | "gauge"
  | "kpi"
  | "table"
  | "pivot"
  | "heatmap"
  | "treemap"
  | "sankey"
  | "map"
  | "combo"
  | "donut"
  | "radar";

export interface Visualization {
  id: string;
  name: string;
  query_id: string;
  chart_type: ChartType;
  chart_config: Record<string, unknown>;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}
