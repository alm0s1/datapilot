"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";
import ChartRenderer from "@/components/visualizations/ChartRenderer";
import { generateChartSql, sanitizeColumnName } from "@/lib/utils/chartSqlGenerator";
import { Button } from "@/components/ui/button";
import type { ChartSuggestion } from "@/types/dataset";
import type { ChartType } from "@/types/query";
import { Plus, AlertCircle, Loader2 } from "lucide-react";

interface SuggestionChartProps {
  suggestion: ChartSuggestion;
  connectionId: string;
  tableName: string;
  onAddToDashboard: (suggestion: ChartSuggestion) => void;
  isCreating?: boolean;
}

export default function SuggestionChart({
  suggestion,
  connectionId,
  tableName,
  onAddToDashboard,
  isCreating,
}: SuggestionChartProps) {
  const sql = useMemo(
    () => generateChartSql(suggestion, tableName),
    [suggestion, tableName],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["suggestion-chart", connectionId, sql],
    queryFn: async () => {
      const res = await apiClient.post("/queries/execute-raw", {
        connection_id: connectionId,
        sql,
        limit: 200,
        timeout_seconds: 10,
      });
      return res.data as {
        columns: { name: string; type: string }[];
        rows: unknown[][];
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const chartType = (suggestion.chart_type as ChartType) || "bar";
  const xCol = suggestion.x_column;
  const yCol = suggestion.y_column;

  // The SQL table uses sanitized column names, so returned data columns
  // will be sanitized.  Use them for ChartRenderer config.
  const sanitizedX = sanitizeColumnName(xCol);
  const sanitizedY = yCol ? sanitizeColumnName(yCol) : null;

  // Infer metric column name from the data (the column that isn't the x dim)
  const metricCol = useMemo(() => {
    if (sanitizedY) return sanitizedY;
    if (data?.columns) {
      const other = data.columns.find((c) => c.name !== sanitizedX);
      if (other) return other.name;
    }
    return "count";
  }, [sanitizedY, sanitizedX, data]);

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-all hover:border-primary/50 hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold capitalize text-foreground">
            {suggestion.chart_type} Chart
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {xCol}
            {yCol ? ` / ${yCol}` : ""}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="ml-2 h-7 shrink-0 gap-1 px-2 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onAddToDashboard(suggestion);
          }}
          disabled={isCreating}
        >
          {isCreating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          Add to Dashboard
        </Button>
      </div>

      {/* Chart body */}
      <div className="flex-1 px-1 py-1">
        {isLoading && (
          <div className="flex h-[160px] items-center justify-center">
            <div className="space-y-2 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">Loading...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex h-[160px] items-center justify-center">
            <div className="space-y-1 text-center">
              <AlertCircle className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground">
                Failed to load preview
              </p>
            </div>
          </div>
        )}

        {data && data.rows.length > 0 && (
          <ChartRenderer
            data={{ columns: data.columns, rows: data.rows }}
            config={{
              type: chartType,
              dimensions: [sanitizedX],
              metrics: [metricCol],
            }}
            height={160}
          />
        )}

        {data && data.rows.length === 0 && (
          <div className="flex h-[160px] items-center justify-center">
            <p className="text-[10px] text-muted-foreground">No data</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-3 py-2">
        <p className="line-clamp-2 text-[11px] text-muted-foreground">
          {suggestion.reasoning}
        </p>
      </div>
    </div>
  );
}
