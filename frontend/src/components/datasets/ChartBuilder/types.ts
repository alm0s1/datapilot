import type { ChartType } from "@/types/query";
import type { ChartSuggestion } from "@/types/dataset";

export interface ColumnMapping {
  originalName: string;   // from profiling_results keys (display name)
  sanitizedName: string;  // for SQL (via sanitizeColumnName)
  dtype: string;          // from ColumnProfile.dtype
}

export interface FilterCondition {
  id: string;
  column: ColumnMapping;
  operator: FilterOperator;
  value: string;
}

export type FilterOperator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE";

export type AggregationType = "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "NONE";

export type DateHierarchy = "year" | "quarter" | "month" | "day";

export interface ChartBuilderState {
  chartType: ChartType;
  xAxis: ColumnMapping | null;
  yAxis: ColumnMapping[];
  groupBy: ColumnMapping | null;
  aggregation: AggregationType;
  filters: FilterCondition[];
  dateHierarchy: DateHierarchy | null;
}

// Reducer action types
export type ChartBuilderAction =
  | { type: "SET_CHART_TYPE"; payload: ChartType }
  | { type: "SET_X_AXIS"; payload: ColumnMapping }
  | { type: "CLEAR_X_AXIS" }
  | { type: "ADD_Y_AXIS"; payload: ColumnMapping }
  | { type: "REMOVE_Y_AXIS"; payload: string } // sanitizedName
  | { type: "SET_GROUP_BY"; payload: ColumnMapping }
  | { type: "CLEAR_GROUP_BY" }
  | { type: "SET_AGGREGATION"; payload: AggregationType }
  | { type: "ADD_FILTER"; payload: FilterCondition }
  | { type: "UPDATE_FILTER"; payload: FilterCondition }
  | { type: "REMOVE_FILTER"; payload: string } // filter id
  | { type: "SET_DATE_HIERARCHY"; payload: DateHierarchy | null }
  | { type: "APPLY_PRESET"; payload: ApplyPresetPayload }
  | { type: "RESET" };

export interface ApplyPresetPayload {
  suggestion: ChartSuggestion;
  columns: Record<string, { dtype: string }>;
}

// Initial state factory
export const createInitialState = (): ChartBuilderState => ({
  chartType: "bar",
  xAxis: null,
  yAxis: [],
  groupBy: null,
  aggregation: "SUM",
  filters: [],
  dateHierarchy: null,
});

// Chart type options for the selector
export const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: "bar", label: "Bar Chart" },
  { value: "line", label: "Line Chart" },
  { value: "area", label: "Area Chart" },
  { value: "pie", label: "Pie Chart" },
  { value: "scatter", label: "Scatter Plot" },
  { value: "kpi", label: "KPI Card" },
  { value: "table", label: "Data Table" },
];

// Aggregation options
export const AGGREGATION_OPTIONS: { value: AggregationType; label: string }[] = [
  { value: "SUM", label: "Sum" },
  { value: "AVG", label: "Average" },
  { value: "COUNT", label: "Count" },
  { value: "MIN", label: "Minimum" },
  { value: "MAX", label: "Maximum" },
  { value: "NONE", label: "No Aggregation" },
];

// Filter operator options
export const FILTER_OPERATOR_OPTIONS: { value: FilterOperator; label: string }[] = [
  { value: "=", label: "equals" },
  { value: "!=", label: "not equals" },
  { value: ">", label: "greater than" },
  { value: "<", label: "less than" },
  { value: ">=", label: "greater or equal" },
  { value: "<=", label: "less or equal" },
  { value: "LIKE", label: "contains" },
];

// Date hierarchy options
export const DATE_HIERARCHY_OPTIONS: { value: DateHierarchy; label: string }[] = [
  { value: "year", label: "Year" },
  { value: "quarter", label: "Quarter" },
  { value: "month", label: "Month" },
  { value: "day", label: "Day" },
];

// Helper to check if column type is numeric
export function isNumericType(dtype: string): boolean {
  const numericTypes = ["int64", "float64", "int32", "float32", "number", "numeric"];
  return numericTypes.some((t) => dtype.toLowerCase().includes(t));
}

// Helper to check if column type is date/datetime
export function isDateType(dtype: string): boolean {
  const dateTypes = ["datetime", "date", "timestamp"];
  return dateTypes.some((t) => dtype.toLowerCase().includes(t));
}
