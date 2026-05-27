"use client";

import { useMemo } from "react";
import { X, Hash, Type, Calendar, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ColumnProfile } from "@/types/dataset";
import type { ChartBuilderState, ChartBuilderAction, ColumnMapping } from "./types";
import { isNumericType, isDateType } from "./types";

interface ColumnMappingSectionProps {
  columns: Record<string, ColumnProfile>;
  state: ChartBuilderState;
  dispatch: React.Dispatch<ChartBuilderAction>;
  createColumnMapping: (columnName: string) => ColumnMapping;
}

function getColumnIcon(dtype: string) {
  if (isNumericType(dtype)) {
    return <Hash className="h-3.5 w-3.5 text-blue-500" />;
  }
  if (isDateType(dtype)) {
    return <Calendar className="h-3.5 w-3.5 text-amber-500" />;
  }
  return <Type className="h-3.5 w-3.5 text-green-500" />;
}

export default function ColumnMappingSection({
  columns,
  state,
  dispatch,
  createColumnMapping,
}: ColumnMappingSectionProps) {
  const columnNames = useMemo(() => Object.keys(columns), [columns]);

  // Get available columns (not already used)
  const availableForY = useMemo(() => {
    const usedColumns = new Set<string>();
    if (state.xAxis) usedColumns.add(state.xAxis.originalName);
    if (state.groupBy) usedColumns.add(state.groupBy.originalName);
    state.yAxis.forEach((y) => usedColumns.add(y.originalName));
    return columnNames.filter((name) => !usedColumns.has(name));
  }, [columnNames, state.xAxis, state.yAxis, state.groupBy]);

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <h4 className="text-sm font-medium">Column Mapping</h4>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* X Axis */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            X Axis (Dimension)
          </label>
          <div className="flex items-center gap-2">
            <select
              value={state.xAxis?.originalName || ""}
              onChange={(e) => {
                if (e.target.value) {
                  dispatch({
                    type: "SET_X_AXIS",
                    payload: createColumnMapping(e.target.value),
                  });
                } else {
                  dispatch({ type: "CLEAR_X_AXIS" });
                }
              }}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select column...</option>
              {columnNames.map((name) => (
                <option key={name} value={name}>
                  {name} ({columns[name]?.dtype})
                </option>
              ))}
            </select>
            {state.xAxis && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => dispatch({ type: "CLEAR_X_AXIS" })}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {state.xAxis && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {getColumnIcon(state.xAxis.dtype)}
              <span>{state.xAxis.dtype}</span>
            </div>
          )}
        </div>

        {/* Y Axis */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Y Axis (Metrics)
          </label>
          <div className="space-y-2">
            {state.yAxis.map((y) => (
              <div
                key={y.sanitizedName}
                className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5"
              >
                {getColumnIcon(y.dtype)}
                <span className="flex-1 truncate text-sm">{y.originalName}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() =>
                    dispatch({ type: "REMOVE_Y_AXIS", payload: y.sanitizedName })
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {(state.chartType !== "pie" && state.chartType !== "kpi") ||
            state.yAxis.length === 0 ? (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    dispatch({
                      type: "ADD_Y_AXIS",
                      payload: createColumnMapping(e.target.value),
                    });
                  }
                }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Add metric column...</option>
                {availableForY
                  .filter((name) => {
                    // For Y axis, prefer numeric columns
                    const dtype = columns[name]?.dtype || "";
                    return isNumericType(dtype);
                  })
                  .map((name) => (
                    <option key={name} value={name}>
                      {name} ({columns[name]?.dtype})
                    </option>
                  ))}
                {/* Also show non-numeric columns in case user wants to count them */}
                {availableForY
                  .filter((name) => {
                    const dtype = columns[name]?.dtype || "";
                    return !isNumericType(dtype);
                  })
                  .map((name) => (
                    <option key={name} value={name}>
                      {name} ({columns[name]?.dtype})
                    </option>
                  ))}
              </select>
            ) : null}
          </div>
        </div>

        {/* Group By */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Group By (Optional)
          </label>
          <div className="flex items-center gap-2">
            <select
              value={state.groupBy?.originalName || ""}
              onChange={(e) => {
                if (e.target.value) {
                  dispatch({
                    type: "SET_GROUP_BY",
                    payload: createColumnMapping(e.target.value),
                  });
                } else {
                  dispatch({ type: "CLEAR_GROUP_BY" });
                }
              }}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">None</option>
              {columnNames
                .filter(
                  (name) =>
                    name !== state.xAxis?.originalName &&
                    !state.yAxis.some((y) => y.originalName === name)
                )
                .map((name) => (
                  <option key={name} value={name}>
                    {name} ({columns[name]?.dtype})
                  </option>
                ))}
            </select>
            {state.groupBy && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => dispatch({ type: "CLEAR_GROUP_BY" })}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {state.groupBy && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {getColumnIcon(state.groupBy.dtype)}
              <span>{state.groupBy.dtype}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
