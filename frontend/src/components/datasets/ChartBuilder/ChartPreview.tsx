"use client";

import { useMemo } from "react";
import { Loader2, AlertCircle, BarChart3 } from "lucide-react";
import ChartRenderer from "@/components/visualizations/ChartRenderer";
import type { QueryResult, ChartType } from "@/types/query";
import type { ColumnMapping, AggregationType } from "./types";

interface ChartPreviewProps {
  queryResult: QueryResult | null;
  chartType: ChartType;
  xAxis: ColumnMapping | null;
  yAxis: ColumnMapping[];
  aggregation: AggregationType;
  isExecuting: boolean;
  error: string | null;
}

export default function ChartPreview({
  queryResult,
  chartType,
  xAxis,
  yAxis,
  aggregation,
  isExecuting,
  error,
}: ChartPreviewProps) {
  // Build chart config from state
  const chartConfig = useMemo(() => {
    const dimensions = xAxis ? [xAxis.sanitizedName] : [];
    
    // When aggregation is applied, the SQL generates columns like "sum_salary", "avg_salary"
    // We need to use those aliased names, not the original column names
    const metrics = yAxis.map((y) => {
      if (aggregation === "NONE") {
        return y.sanitizedName;
      }
      return `${aggregation.toLowerCase()}_${y.sanitizedName}`;
    });

    // If no metrics specified, try to infer from query result
    if (metrics.length === 0 && queryResult?.columns) {
      const inferredMetrics = queryResult.columns
        .filter((c) => !dimensions.includes(c.name))
        .map((c) => c.name)
        .slice(0, 3);
      metrics.push(...inferredMetrics);
    }

    return {
      type: chartType,
      dimensions,
      metrics,
    };
  }, [chartType, xAxis, yAxis, aggregation, queryResult]);

  // Empty state - no configuration
  if (!xAxis && yAxis.length === 0 && chartType !== "table") {
    return (
      <div className="rounded-lg border border-dashed p-12">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="font-medium text-muted-foreground">
              Configure your chart
            </p>
            <p className="text-sm text-muted-foreground/70">
              Select X and Y axis columns above to generate a chart
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isExecuting) {
    return (
      <div className="rounded-lg border p-12">
        <div className="flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Generating chart...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Query failed</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // No data state
  if (queryResult && queryResult.rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12">
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <p className="font-medium text-muted-foreground">No data</p>
          <p className="text-sm text-muted-foreground/70">
            The query returned no results. Try adjusting your filters.
          </p>
        </div>
      </div>
    );
  }

  // Waiting for execution (config is set but no result yet)
  if (!queryResult) {
    return (
      <div className="rounded-lg border border-dashed p-12">
        <div className="flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading data...</p>
        </div>
      </div>
    );
  }

  // Success - render chart
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {queryResult.metadata.row_count.toLocaleString()} rows
          {queryResult.metadata.truncated && " (truncated)"}
          {" · "}
          {queryResult.metadata.execution_time_ms}ms
        </p>
      </div>
      <ChartRenderer
        data={{
          columns: queryResult.columns,
          rows: queryResult.rows,
        }}
        config={chartConfig}
        height={350}
      />
    </div>
  );
}
