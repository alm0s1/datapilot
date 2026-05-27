export interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  layout_config: Record<string, unknown>;
  filter_config: Record<string, unknown> | null;
  collection_id: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  is_public: boolean;
  public_token: string | null;
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  id: string;
  dashboard_id: string;
  query_id: string | null;
  visualization_id: string | null;
  widget_type: WidgetType;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type WidgetType = "chart" | "text" | "filter" | "image" | "kpi";

export interface DashboardCreate {
  name: string;
  description?: string;
  collection_id?: string;
  layout_config?: Record<string, unknown>;
  filter_config?: Record<string, unknown>;
}

export interface WidgetCreate {
  widget_type: WidgetType;
  query_id?: string;
  visualization_id?: string;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  config?: Record<string, unknown>;
}
