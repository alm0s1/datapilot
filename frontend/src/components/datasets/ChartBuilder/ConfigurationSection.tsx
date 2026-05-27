"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, X, Filter, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ColumnProfile } from "@/types/dataset";
import type {
  ChartBuilderState,
  ChartBuilderAction,
  ColumnMapping,
  FilterCondition,
  AggregationType,
  DateHierarchy,
} from "./types";
import {
  AGGREGATION_OPTIONS,
  FILTER_OPERATOR_OPTIONS,
  DATE_HIERARCHY_OPTIONS,
  isDateType,
} from "./types";

interface ConfigurationSectionProps {
  columns: Record<string, ColumnProfile>;
  state: ChartBuilderState;
  dispatch: React.Dispatch<ChartBuilderAction>;
  createColumnMapping: (columnName: string) => ColumnMapping;
}

export default function ConfigurationSection({
  columns,
  state,
  dispatch,
  createColumnMapping,
}: ConfigurationSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const columnNames = Object.keys(columns);

  const showDateHierarchy = state.xAxis && isDateType(state.xAxis.dtype);

  // Add a new filter
  const handleAddFilter = () => {
    const firstColumn = columnNames[0];
    if (!firstColumn) return;

    const newFilter: FilterCondition = {
      id: crypto.randomUUID(),
      column: createColumnMapping(firstColumn),
      operator: "=",
      value: "",
    };
    dispatch({ type: "ADD_FILTER", payload: newFilter });
  };

  // Update a filter
  const handleUpdateFilter = (filter: FilterCondition, updates: Partial<FilterCondition>) => {
    dispatch({
      type: "UPDATE_FILTER",
      payload: { ...filter, ...updates },
    });
  };

  return (
    <div className="rounded-lg border">
      {/* Header */}
      <button
        className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Settings2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Configuration</span>
        {state.filters.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {state.filters.length} filter{state.filters.length !== 1 && "s"}
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Aggregation */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Aggregation
              </label>
              <select
                value={state.aggregation}
                onChange={(e) =>
                  dispatch({
                    type: "SET_AGGREGATION",
                    payload: e.target.value as AggregationType,
                  })
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {AGGREGATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Hierarchy (only if X axis is date) */}
            {showDateHierarchy && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Date Hierarchy
                </label>
                <select
                  value={state.dateHierarchy || ""}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_DATE_HIERARCHY",
                      payload: e.target.value ? (e.target.value as DateHierarchy) : null,
                    })
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">None (raw values)</option>
                  {DATE_HIERARCHY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                Filters
              </label>
              <Button variant="outline" size="sm" onClick={handleAddFilter}>
                <Plus className="mr-1 h-3 w-3" />
                Add Filter
              </Button>
            </div>

            {state.filters.length === 0 && (
              <p className="text-xs text-muted-foreground/70">
                No filters applied. Click &quot;Add Filter&quot; to filter your data.
              </p>
            )}

            {state.filters.map((filter) => (
              <div
                key={filter.id}
                className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2"
              >
                {/* Column */}
                <select
                  value={filter.column.originalName}
                  onChange={(e) =>
                    handleUpdateFilter(filter, {
                      column: createColumnMapping(e.target.value),
                    })
                  }
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  {columnNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>

                {/* Operator */}
                <select
                  value={filter.operator}
                  onChange={(e) =>
                    handleUpdateFilter(filter, {
                      operator: e.target.value as FilterCondition["operator"],
                    })
                  }
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  {FILTER_OPERATOR_OPTIONS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>

                {/* Value */}
                <input
                  type="text"
                  value={filter.value}
                  onChange={(e) =>
                    handleUpdateFilter(filter, { value: e.target.value })
                  }
                  placeholder="Value..."
                  className="flex-1 min-w-[120px] rounded-md border bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />

                {/* Remove */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() =>
                    dispatch({ type: "REMOVE_FILTER", payload: filter.id })
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
