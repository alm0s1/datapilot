"use client";

import { Button } from "@/components/ui/button";
import { CHART_TYPE_OPTIONS } from "./types";
import type { ChartType } from "@/types/query";
import { RotateCcw, Plus, Loader2, BarChart3, LineChart, PieChart, AreaChart, ScatterChart as ScatterIcon, Table, Activity } from "lucide-react";

interface ChartBuilderToolbarProps {
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
  onReset: () => void;
  onAddToDashboard: () => void;
  canAddToDashboard: boolean;
  isSaving: boolean;
}

const chartTypeIcons: Record<string, React.ReactNode> = {
  bar: <BarChart3 className="h-4 w-4" />,
  line: <LineChart className="h-4 w-4" />,
  area: <AreaChart className="h-4 w-4" />,
  pie: <PieChart className="h-4 w-4" />,
  scatter: <ScatterIcon className="h-4 w-4" />,
  kpi: <Activity className="h-4 w-4" />,
  table: <Table className="h-4 w-4" />,
};

export default function ChartBuilderToolbar({
  chartType,
  onChartTypeChange,
  onReset,
  onAddToDashboard,
  canAddToDashboard,
  isSaving,
}: ChartBuilderToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
      {/* Chart Type Selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Chart Type:</span>
        <div className="flex items-center gap-1 rounded-md border bg-background p-1">
          {CHART_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onChartTypeChange(option.value)}
              className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                chartType === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title={option.label}
            >
              {chartTypeIcons[option.value]}
              <span className="hidden sm:inline">{option.label.replace(" Chart", "").replace(" Card", "").replace(" Plot", "")}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset
        </Button>
        <Button
          size="sm"
          onClick={onAddToDashboard}
          disabled={!canAddToDashboard || isSaving}
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Add to Dashboard
        </Button>
      </div>
    </div>
  );
}
