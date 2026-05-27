"use client";

import { useReducer, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import apiClient from "@/lib/api/client";
import { queryApi } from "@/lib/api/queries";
import { dashboardApi } from "@/lib/api/dashboards";
import { generateDynamicChartSql, sanitizeColumnName } from "@/lib/utils/chartBuilderSqlGenerator";
import { chartBuilderReducer } from "./reducer";
import { createInitialState, type ColumnMapping, type ChartBuilderState } from "./types";
import type { Dataset, ChartSuggestion, ProfilingResults } from "@/types/dataset";
import type { QueryResult } from "@/types/query";

import SuggestionPresets from "./SuggestionPresets";
import ChartBuilderToolbar from "./ChartBuilderToolbar";
import ColumnMappingSection from "./ColumnMappingSection";
import ConfigurationSection from "./ConfigurationSection";
import SqlPreview from "./SqlPreview";
import ChartPreview from "./ChartPreview";

interface ChartBuilderProps {
  dataset: Dataset;
  suggestions: ChartSuggestion[];
}

export default function ChartBuilder({ dataset, suggestions }: ChartBuilderProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(chartBuilderReducer, undefined, createInitialState);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const profiling = dataset.profiling_results as ProfilingResults | undefined;
  const columns = profiling?.columns || {};

  // Generate SQL from current state
  const generatedSql = useMemo(() => {
    if (!dataset.table_name) return null;
    return generateDynamicChartSql(state, dataset.table_name);
  }, [state, dataset.table_name]);

  // Execute query when configuration changes (debounced)
  useEffect(() => {
    if (!generatedSql || !dataset.connection_id) {
      setQueryResult(null);
      setError(null);
      return;
    }

    // Check if we have enough configuration to execute
    const canExecute =
      state.chartType === "table" ||
      (state.xAxis && (state.yAxis.length > 0 || state.chartType === "pie")) ||
      (state.chartType === "kpi" && state.yAxis.length > 0);

    if (!canExecute) {
      setQueryResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsExecuting(true);
      setError(null);

      try {
        const res = await apiClient.post("/queries/execute-raw", {
          connection_id: dataset.connection_id,
          sql: generatedSql,
          limit: 200,
          timeout_seconds: 15,
        });
        setQueryResult(res.data as QueryResult);
      } catch (err: unknown) {
        console.error("Query execution failed:", err);
        // Extract error message from Axios error response
        let errorMessage = "Query execution failed";
        if (err && typeof err === "object") {
          const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
          if (axiosErr.response?.data?.detail) {
            errorMessage = axiosErr.response.data.detail;
          } else if (axiosErr.message) {
            errorMessage = axiosErr.message;
          }
        }
        setError(errorMessage);
        setQueryResult(null);
      } finally {
        setIsExecuting(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [generatedSql, dataset.connection_id, state.chartType, state.xAxis, state.yAxis]);

  // Handle preset selection
  const handlePresetSelect = useCallback(
    (suggestion: ChartSuggestion) => {
      dispatch({
        type: "APPLY_PRESET",
        payload: { suggestion, columns },
      });
    },
    [columns]
  );

  // Handle reset
  const handleReset = useCallback(() => {
    dispatch({ type: "RESET" });
    setQueryResult(null);
    setError(null);
  }, []);

  // Handle "Add to Dashboard"
  const handleAddToDashboard = useCallback(async () => {
    if (!dataset.connection_id || !dataset.table_name || !generatedSql) return;
    if (isSaving) return;

    setIsSaving(true);

    try {
      // Build query name
      const xLabel = state.xAxis?.originalName || "data";
      const yLabel = state.yAxis[0]?.originalName || "count";
      const queryName = `${dataset.name} - ${state.chartType} (${xLabel} vs ${yLabel})`;

      // Create saved Query
      const query = await queryApi.create({
        name: queryName,
        connection_id: dataset.connection_id,
        sql_query: generatedSql,
        query_type: "sql",
      });

      // Find or create "Dataset Insights" dashboard
      const dashboardName = `Dataset Insights - ${dataset.name}`;
      const dashboards = await dashboardApi.list();
      let dashboard = dashboards.find((d) => d.name === dashboardName);

      if (!dashboard) {
        dashboard = await dashboardApi.create({
          name: dashboardName,
          description: `Auto-generated insights from ${dataset.name}`,
        });
      }

      // Calculate position for new widget
      const existingWidgets = dashboard.widgets?.length ?? 0;
      const col = existingWidgets % 2;
      const row = Math.floor(existingWidgets / 2);

      // Add widget
      await dashboardApi.addWidget(dashboard.id, {
        widget_type: "chart",
        query_id: query.id,
        position_x: col * 6,
        position_y: row * 4,
        width: 6,
        height: 4,
        config: {
          chart_type: state.chartType,
          title: `${xLabel} vs ${yLabel}`,
          dimensions: state.xAxis ? [state.xAxis.sanitizedName] : [],
          metrics: state.yAxis.map((y) => y.sanitizedName),
        },
      });

      // Navigate to dashboard editor
      router.push(`/dashboard/${dashboard.id}/edit`);
    } catch (err) {
      console.error("Failed to create dashboard widget:", err);
      setError("Failed to add to dashboard");
    } finally {
      setIsSaving(false);
    }
  }, [dataset, state, generatedSql, isSaving, router]);

  // Create column mapping helper
  const createColumnMapping = useCallback(
    (columnName: string): ColumnMapping => ({
      originalName: columnName,
      sanitizedName: sanitizeColumnName(columnName),
      dtype: columns[columnName]?.dtype || "object",
    }),
    [columns]
  );

  if (!profiling || Object.keys(columns).length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        No profiling data available. Please analyze the dataset first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* AI Suggestion Presets */}
      {suggestions.length > 0 && (
        <SuggestionPresets suggestions={suggestions} onSelect={handlePresetSelect} />
      )}

      {/* Toolbar */}
      <ChartBuilderToolbar
        chartType={state.chartType}
        onChartTypeChange={(type) => dispatch({ type: "SET_CHART_TYPE", payload: type })}
        onReset={handleReset}
        onAddToDashboard={handleAddToDashboard}
        canAddToDashboard={!!generatedSql && !!queryResult}
        isSaving={isSaving}
      />

      {/* Column Mapping */}
      <ColumnMappingSection
        columns={columns}
        state={state}
        dispatch={dispatch}
        createColumnMapping={createColumnMapping}
      />

      {/* Configuration */}
      <ConfigurationSection
        columns={columns}
        state={state}
        dispatch={dispatch}
        createColumnMapping={createColumnMapping}
      />

      {/* SQL Preview */}
      <SqlPreview sql={generatedSql} />

      {/* Chart Preview */}
      <ChartPreview
        queryResult={queryResult}
        chartType={state.chartType}
        xAxis={state.xAxis}
        yAxis={state.yAxis}
        aggregation={state.aggregation}
        isExecuting={isExecuting}
        error={error}
      />
    </div>
  );
}
