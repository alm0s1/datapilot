import { sanitizeColumnName } from "@/lib/utils/chartSqlGenerator";
import type {
  ChartBuilderState,
  ChartBuilderAction,
  ColumnMapping,
  createInitialState,
} from "./types";

export function chartBuilderReducer(
  state: ChartBuilderState,
  action: ChartBuilderAction
): ChartBuilderState {
  switch (action.type) {
    case "SET_CHART_TYPE": {
      const newState = { ...state, chartType: action.payload };
      // Pie chart only supports single Y axis
      if (action.payload === "pie" && state.yAxis.length > 1) {
        newState.yAxis = state.yAxis.slice(0, 1);
      }
      // KPI only uses single metric
      if (action.payload === "kpi" && state.yAxis.length > 1) {
        newState.yAxis = state.yAxis.slice(0, 1);
      }
      return newState;
    }

    case "SET_X_AXIS":
      return {
        ...state,
        xAxis: action.payload,
        // Clear date hierarchy if new X axis is not a date type
        dateHierarchy: action.payload.dtype.toLowerCase().includes("date")
          ? state.dateHierarchy
          : null,
      };

    case "CLEAR_X_AXIS":
      return {
        ...state,
        xAxis: null,
        dateHierarchy: null,
      };

    case "ADD_Y_AXIS": {
      // Prevent duplicates
      if (state.yAxis.some((y) => y.sanitizedName === action.payload.sanitizedName)) {
        return state;
      }
      // Pie and KPI only support single Y axis
      if ((state.chartType === "pie" || state.chartType === "kpi") && state.yAxis.length >= 1) {
        return { ...state, yAxis: [action.payload] };
      }
      return {
        ...state,
        yAxis: [...state.yAxis, action.payload],
      };
    }

    case "REMOVE_Y_AXIS":
      return {
        ...state,
        yAxis: state.yAxis.filter((y) => y.sanitizedName !== action.payload),
      };

    case "SET_GROUP_BY":
      return { ...state, groupBy: action.payload };

    case "CLEAR_GROUP_BY":
      return { ...state, groupBy: null };

    case "SET_AGGREGATION":
      return { ...state, aggregation: action.payload };

    case "ADD_FILTER":
      return {
        ...state,
        filters: [...state.filters, action.payload],
      };

    case "UPDATE_FILTER":
      return {
        ...state,
        filters: state.filters.map((f) =>
          f.id === action.payload.id ? action.payload : f
        ),
      };

    case "REMOVE_FILTER":
      return {
        ...state,
        filters: state.filters.filter((f) => f.id !== action.payload),
      };

    case "SET_DATE_HIERARCHY":
      return { ...state, dateHierarchy: action.payload };

    case "APPLY_PRESET": {
      const { suggestion, columns } = action.payload;
      const xColProfile = columns[suggestion.x_column];
      const yColProfile = suggestion.y_column ? columns[suggestion.y_column] : null;

      const xAxis: ColumnMapping | null = xColProfile
        ? {
            originalName: suggestion.x_column,
            sanitizedName: sanitizeColumnName(suggestion.x_column),
            dtype: xColProfile.dtype,
          }
        : null;

      const yAxis: ColumnMapping[] = yColProfile && suggestion.y_column
        ? [
            {
              originalName: suggestion.y_column,
              sanitizedName: sanitizeColumnName(suggestion.y_column),
              dtype: yColProfile.dtype,
            },
          ]
        : [];

      // Determine default aggregation based on chart type
      let aggregation = state.aggregation;
      if (suggestion.chart_type === "bar" || suggestion.chart_type === "pie") {
        aggregation = yAxis.length > 0 ? "SUM" : "COUNT";
      } else if (suggestion.chart_type === "line" || suggestion.chart_type === "scatter") {
        aggregation = "NONE";
      }

      return {
        ...state,
        chartType: (suggestion.chart_type as ChartBuilderState["chartType"]) || "bar",
        xAxis,
        yAxis,
        groupBy: null,
        aggregation,
        filters: [],
        dateHierarchy: null,
      };
    }

    case "RESET":
      return {
        chartType: "bar",
        xAxis: null,
        yAxis: [],
        groupBy: null,
        aggregation: "SUM",
        filters: [],
        dateHierarchy: null,
      };

    default:
      return state;
  }
}
