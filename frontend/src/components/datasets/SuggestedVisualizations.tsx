"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import SuggestionChart from "./SuggestionChart";
import { generateChartSql, sanitizeColumnName } from "@/lib/utils/chartSqlGenerator";
import { queryApi } from "@/lib/api/queries";
import { dashboardApi } from "@/lib/api/dashboards";
import type { Dataset, ChartSuggestion } from "@/types/dataset";

interface SuggestedVisualizationsProps {
  dataset: Dataset;
  suggestions: ChartSuggestion[];
}

export default function SuggestedVisualizations({
  dataset,
  suggestions,
}: SuggestedVisualizationsProps) {
  const router = useRouter();
  const [creatingIndex, setCreatingIndex] = useState<number | null>(null);

  const handleAddToDashboard = useCallback(
    async (suggestion: ChartSuggestion, index: number) => {
      if (!dataset.connection_id || !dataset.table_name) return;
      if (creatingIndex !== null) return; // prevent concurrent

      setCreatingIndex(index);

      try {
        // 1. Generate SQL
        const sql = generateChartSql(suggestion, dataset.table_name);

        const yLabel = suggestion.y_column || "count";
        const queryName = `${dataset.name} - ${suggestion.chart_type} (${suggestion.x_column} vs ${yLabel})`;

        // 2. Create saved Query
        const query = await queryApi.create({
          name: queryName,
          connection_id: dataset.connection_id,
          sql_query: sql,
          query_type: "sql",
        });

        // 3. Find or create "Dataset Insights" dashboard
        const dashboardName = `Dataset Insights - ${dataset.name}`;
        const dashboards = await dashboardApi.list();
        let dashboard = dashboards.find((d) => d.name === dashboardName);

        if (!dashboard) {
          dashboard = await dashboardApi.create({
            name: dashboardName,
            description: `Auto-generated insights from ${dataset.name}`,
          });
        }

        // 4. Calculate position for new widget
        const existingWidgets = dashboard.widgets?.length ?? 0;
        const col = existingWidgets % 2; // 2 columns, alternate 0 and 1
        const row = Math.floor(existingWidgets / 2);

        // 5. Add widget
        await dashboardApi.addWidget(dashboard.id, {
          widget_type: "chart",
          query_id: query.id,
          position_x: col * 6,
          position_y: row * 4,
          width: 6,
          height: 4,
          config: {
            chart_type: suggestion.chart_type,
            title: suggestion.reasoning,
            dimensions: [sanitizeColumnName(suggestion.x_column)],
            metrics: [suggestion.y_column ? sanitizeColumnName(suggestion.y_column) : "count"],
          },
        });

        // 6. Navigate to dashboard editor
        router.push(`/dashboard/${dashboard.id}/edit`);
      } catch (err) {
        console.error("Failed to create dashboard widget:", err);
      } finally {
        setCreatingIndex(null);
      }
    },
    [dataset, creatingIndex, router],
  );

  if (!suggestions.length || !dataset.connection_id || !dataset.table_name) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {suggestions.map((suggestion, i) => (
        <SuggestionChart
          key={`${suggestion.chart_type}-${suggestion.x_column}-${i}`}
          suggestion={suggestion}
          connectionId={dataset.connection_id!}
          tableName={dataset.table_name!}
          onAddToDashboard={(s) => handleAddToDashboard(s, i)}
          isCreating={creatingIndex === i}
        />
      ))}
    </div>
  );
}
