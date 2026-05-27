"use client";

import { Sparkles, BarChart3, LineChart, PieChart, ScatterChart as ScatterIcon } from "lucide-react";
import type { ChartSuggestion } from "@/types/dataset";

interface SuggestionPresetsProps {
  suggestions: ChartSuggestion[];
  onSelect: (suggestion: ChartSuggestion) => void;
}

const chartIcons: Record<string, React.ReactNode> = {
  bar: <BarChart3 className="h-4 w-4" />,
  line: <LineChart className="h-4 w-4" />,
  pie: <PieChart className="h-4 w-4" />,
  scatter: <ScatterIcon className="h-4 w-4" />,
};

export default function SuggestionPresets({
  suggestions,
  onSelect,
}: SuggestionPresetsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        <span>Quick start with AI suggestions:</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.slice(0, 6).map((suggestion, index) => (
          <button
            key={`${suggestion.chart_type}-${suggestion.x_column}-${index}`}
            onClick={() => onSelect(suggestion)}
            className="group flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5"
          >
            <span className="text-muted-foreground group-hover:text-primary">
              {chartIcons[suggestion.chart_type] || <BarChart3 className="h-4 w-4" />}
            </span>
            <span className="capitalize">{suggestion.chart_type}</span>
            <span className="text-muted-foreground">·</span>
            <span className="max-w-[120px] truncate text-muted-foreground">
              {suggestion.x_column}
              {suggestion.y_column && ` vs ${suggestion.y_column}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
