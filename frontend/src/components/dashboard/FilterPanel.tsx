"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Filter, X, Plus, Calendar, Hash, Type } from "lucide-react";

export interface DashboardFilter {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  column: string;
  value: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "between";
}

interface FilterPanelProps {
  filters: DashboardFilter[];
  onFiltersChange: (filters: DashboardFilter[]) => void;
  onClose: () => void;
  availableColumns?: string[];
}

const operators: Record<string, { label: string; value: string }[]> = {
  text: [
    { label: "Equals", value: "eq" },
    { label: "Not Equals", value: "neq" },
    { label: "Contains", value: "contains" },
  ],
  number: [
    { label: "=", value: "eq" },
    { label: "!=", value: "neq" },
    { label: ">", value: "gt" },
    { label: "<", value: "lt" },
    { label: ">=", value: "gte" },
    { label: "<=", value: "lte" },
  ],
  date: [
    { label: "Equals", value: "eq" },
    { label: "Before", value: "lt" },
    { label: "After", value: "gt" },
    { label: "Between", value: "between" },
  ],
  select: [
    { label: "Equals", value: "eq" },
    { label: "Not Equals", value: "neq" },
  ],
};

const filterTypeIcons: Record<string, typeof Type> = {
  text: Type,
  number: Hash,
  date: Calendar,
  select: Filter,
};

export default function FilterPanel({
  filters,
  onFiltersChange,
  onClose,
  availableColumns = [],
}: FilterPanelProps) {
  const addFilter = () => {
    const newFilter: DashboardFilter = {
      id: crypto.randomUUID(),
      label: "",
      type: "text",
      column: availableColumns[0] || "",
      value: "",
      operator: "eq",
    };
    onFiltersChange([...filters, newFilter]);
  };

  const updateFilter = (id: string, updates: Partial<DashboardFilter>) => {
    onFiltersChange(
      filters.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const removeFilter = (id: string) => {
    onFiltersChange(filters.filter((f) => f.id !== id));
  };

  const clearAll = () => {
    onFiltersChange([]);
  };

  return (
    <Card className="border-t-2 border-t-primary">
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Dashboard Filters</CardTitle>
          {filters.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
              {filters.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {filters.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs">
              Clear All
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {filters.map((filter) => {
          const Icon = filterTypeIcons[filter.type] || Filter;
          const ops = operators[filter.type] || operators.text;
          return (
            <div
              key={filter.id}
              className="flex items-center gap-2 rounded-md border bg-muted/30 p-2"
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                className="h-7 w-28 text-xs"
                placeholder="Column"
                value={filter.column}
                onChange={(e) =>
                  updateFilter(filter.id, { column: e.target.value })
                }
                list={`columns-${filter.id}`}
              />
              {availableColumns.length > 0 && (
                <datalist id={`columns-${filter.id}`}>
                  {availableColumns.map((col) => (
                    <option key={col} value={col} />
                  ))}
                </datalist>
              )}
              <select
                className="h-7 rounded border bg-background px-1 text-xs"
                value={filter.type}
                onChange={(e) =>
                  updateFilter(filter.id, {
                    type: e.target.value as DashboardFilter["type"],
                    operator: "eq",
                  })
                }
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
              </select>
              <select
                className="h-7 rounded border bg-background px-1 text-xs"
                value={filter.operator}
                onChange={(e) =>
                  updateFilter(filter.id, {
                    operator: e.target.value as DashboardFilter["operator"],
                  })
                }
              >
                {ops.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <Input
                className="h-7 flex-1 text-xs"
                placeholder="Value"
                type={filter.type === "number" ? "number" : filter.type === "date" ? "date" : "text"}
                value={filter.value}
                onChange={(e) =>
                  updateFilter(filter.id, { value: e.target.value })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => removeFilter(filter.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}

        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={addFilter}
        >
          <Plus className="me-1 h-3 w-3" />
          Add Filter
        </Button>
      </CardContent>
    </Card>
  );
}

export function FilterBar({
  filters,
  onTogglePanel,
  onClear,
}: {
  filters: DashboardFilter[];
  onTogglePanel: () => void;
  onClear: () => void;
}) {
  if (filters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
      <Filter className="h-3.5 w-3.5 text-primary" />
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {filters.map((f) => (
          <span
            key={f.id}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
          >
            {f.column} {f.operator} {f.value || "..."}
          </span>
        ))}
      </div>
      <button
        className="text-xs text-muted-foreground hover:text-foreground"
        onClick={onTogglePanel}
      >
        Edit
      </button>
      <button
        className="text-xs text-muted-foreground hover:text-destructive"
        onClick={onClear}
      >
        Clear
      </button>
    </div>
  );
}
