"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { databaseApi } from "@/lib/api/databases";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Play,
  Save,
  Table2,
  Clock,
  AlertCircle,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  Code,
} from "lucide-react";
import type { QueryResult, QueryResultColumn } from "@/types/query";
import type { TableInfo, ColumnInfo } from "@/types/database";
import apiClient from "@/lib/api/client";

interface SelectedColumn {
  id: string;
  table: string;
  column: string;
  alias: string;
  aggregate: "" | "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";
}

interface FilterCondition {
  id: string;
  column: string;
  operator: string;
  value: string;
}

interface SortOrder {
  id: string;
  column: string;
  direction: "ASC" | "DESC";
}

export default function VisualQueryBuilderPage() {
  const t = useTranslations();

  const [connectionId, setConnectionId] = useState<string>("");
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [columns, setColumns] = useState<SelectedColumn[]>([]);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [sorts, setSorts] = useState<SortOrder[]>([]);
  const [limit, setLimit] = useState(100);
  const [groupBy, setGroupBy] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [generatedSql, setGeneratedSql] = useState("");
  const [showSql, setShowSql] = useState(false);

  const { data: connections } = useQuery({
    queryKey: ["databases"],
    queryFn: () => databaseApi.list(),
  });

  const { data: schema } = useQuery({
    queryKey: ["schema", connectionId],
    queryFn: () => databaseApi.getSchema(connectionId),
    enabled: !!connectionId,
  });

  const { data: tableColumns } = useQuery({
    queryKey: ["columns", connectionId, selectedTable],
    queryFn: () => databaseApi.getColumns(connectionId, selectedTable),
    enabled: !!connectionId && !!selectedTable,
  });

  const addColumn = useCallback(
    (col: ColumnInfo) => {
      setColumns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          table: selectedTable,
          column: col.name,
          alias: "",
          aggregate: "",
        },
      ]);
    },
    [selectedTable]
  );

  const removeColumn = useCallback((id: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateColumn = useCallback(
    (id: string, updates: Partial<SelectedColumn>) => {
      setColumns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const addFilter = useCallback(() => {
    setFilters((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        column: tableColumns?.[0]?.name || "",
        operator: "=",
        value: "",
      },
    ]);
  }, [tableColumns]);

  const removeFilter = useCallback((id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const updateFilter = useCallback(
    (id: string, updates: Partial<FilterCondition>) => {
      setFilters((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
      );
    },
    []
  );

  const addSort = useCallback(() => {
    setSorts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        column: columns[0]?.column || "",
        direction: "ASC",
      },
    ]);
  }, [columns]);

  const removeSort = useCallback((id: string) => {
    setSorts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const buildSql = useCallback(() => {
    if (!selectedTable || columns.length === 0) return "";

    const hasAggregates = columns.some((c) => c.aggregate);
    const selectParts = columns.map((c) => {
      let expr = `${c.table}.${c.column}`;
      if (c.aggregate) {
        expr = `${c.aggregate}(${c.table}.${c.column})`;
      }
      if (c.alias) {
        expr += ` AS ${c.alias}`;
      }
      return expr;
    });

    let sql = `SELECT ${selectParts.join(", ")}\nFROM ${selectedTable}`;

    if (filters.length > 0) {
      const whereParts = filters
        .filter((f) => f.column && f.value)
        .map((f) => {
          if (f.operator === "LIKE") {
            return `${f.column} LIKE '%${f.value}%'`;
          }
          if (f.operator === "IS NULL") {
            return `${f.column} IS NULL`;
          }
          if (f.operator === "IS NOT NULL") {
            return `${f.column} IS NOT NULL`;
          }
          return `${f.column} ${f.operator} '${f.value}'`;
        });
      if (whereParts.length > 0) {
        sql += `\nWHERE ${whereParts.join("\n  AND ")}`;
      }
    }

    if (hasAggregates && groupBy) {
      const nonAggCols = columns
        .filter((c) => !c.aggregate)
        .map((c) => `${c.table}.${c.column}`);
      if (nonAggCols.length > 0) {
        sql += `\nGROUP BY ${nonAggCols.join(", ")}`;
      }
    }

    if (sorts.length > 0) {
      const orderParts = sorts.map((s) => `${s.column} ${s.direction}`);
      sql += `\nORDER BY ${orderParts.join(", ")}`;
    }

    sql += `\nLIMIT ${limit}`;

    return sql;
  }, [selectedTable, columns, filters, sorts, limit, groupBy]);

  const sql = useMemo(() => buildSql(), [buildSql]);

  const executeQuery = useCallback(async () => {
    if (!connectionId || !sql.trim()) return;
    setExecuting(true);
    setError(null);
    setResult(null);
    setGeneratedSql(sql);
    try {
      const res = await apiClient.post("/queries/execute-raw", {
        connection_id: connectionId,
        sql: sql,
        limit: limit,
        timeout_seconds: 30,
      });
      setResult(res.data);
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { detail?: string } };
        message?: string;
      };
      setError(
        err.response?.data?.detail || err.message || "Query execution failed"
      );
    } finally {
      setExecuting(false);
    }
  }, [connectionId, sql, limit]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Config Panel */}
      <div className="w-80 shrink-0 overflow-y-auto space-y-4">
        {/* Connection & Table */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Data Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium">
                Database
              </label>
              <select
                className="w-full rounded-md border p-2 text-sm"
                value={connectionId}
                onChange={(e) => {
                  setConnectionId(e.target.value);
                  setSelectedTable("");
                  setColumns([]);
                  setFilters([]);
                  setSorts([]);
                }}
              >
                <option value="">Select database...</option>
                {connections?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Table</label>
              <select
                className="w-full rounded-md border p-2 text-sm"
                value={selectedTable}
                onChange={(e) => {
                  setSelectedTable(e.target.value);
                  setColumns([]);
                  setFilters([]);
                  setSorts([]);
                }}
                disabled={!connectionId}
              >
                <option value="">Select table...</option>
                {schema?.tables?.map((t: TableInfo) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Available Columns */}
        {tableColumns && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">
                Available Columns ({tableColumns.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {tableColumns.map((col: ColumnInfo) => (
                <button
                  key={col.name}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-muted"
                  onClick={() => addColumn(col)}
                >
                  <div className="flex items-center gap-2">
                    <Table2 className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono">{col.name}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {col.type}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Selected Columns */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-2">
            <CardTitle className="text-sm">
              Selected Columns ({columns.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {columns.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Click columns from the left panel to add them
              </p>
            ) : (
              <div className="space-y-2">
                {columns.map((col) => (
                  <div
                    key={col.id}
                    className="flex items-center gap-2 rounded border bg-muted/30 p-2"
                  >
                    <span className="w-32 truncate font-mono text-xs font-medium">
                      {col.column}
                    </span>
                    <select
                      className="h-7 rounded border bg-background px-1 text-xs"
                      value={col.aggregate}
                      onChange={(e) =>
                        updateColumn(col.id, {
                          aggregate: e.target
                            .value as SelectedColumn["aggregate"],
                        })
                      }
                    >
                      <option value="">No aggregate</option>
                      <option value="COUNT">COUNT</option>
                      <option value="SUM">SUM</option>
                      <option value="AVG">AVG</option>
                      <option value="MIN">MIN</option>
                      <option value="MAX">MAX</option>
                    </select>
                    <Input
                      className="h-7 w-24 text-xs"
                      placeholder="Alias"
                      value={col.alias}
                      onChange={(e) =>
                        updateColumn(col.id, { alias: e.target.value })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeColumn(col.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Filters & Sorting Row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Filters */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-2">
              <CardTitle className="text-sm">Filters</CardTitle>
              <Button variant="ghost" size="sm" onClick={addFilter}>
                <Plus className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent>
              {filters.length === 0 ? (
                <p className="text-xs text-muted-foreground">No filters</p>
              ) : (
                <div className="space-y-2">
                  {filters.map((f) => (
                    <div key={f.id} className="flex items-center gap-1">
                      <select
                        className="h-7 w-28 rounded border bg-background px-1 text-xs"
                        value={f.column}
                        onChange={(e) =>
                          updateFilter(f.id, { column: e.target.value })
                        }
                      >
                        <option value="">Column</option>
                        {tableColumns?.map((col: ColumnInfo) => (
                          <option key={col.name} value={col.name}>
                            {col.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="h-7 rounded border bg-background px-1 text-xs"
                        value={f.operator}
                        onChange={(e) =>
                          updateFilter(f.id, { operator: e.target.value })
                        }
                      >
                        <option value="=">=</option>
                        <option value="!=">!=</option>
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value="LIKE">LIKE</option>
                        <option value="IS NULL">IS NULL</option>
                        <option value="IS NOT NULL">IS NOT NULL</option>
                      </select>
                      <Input
                        className="h-7 flex-1 text-xs"
                        placeholder="Value"
                        value={f.value}
                        onChange={(e) =>
                          updateFilter(f.id, { value: e.target.value })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeFilter(f.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sort & Limit */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-2">
              <CardTitle className="text-sm">Sort & Limit</CardTitle>
              <Button variant="ghost" size="sm" onClick={addSort}>
                <Plus className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {sorts.map((s) => (
                <div key={s.id} className="flex items-center gap-1">
                  <select
                    className="h-7 flex-1 rounded border bg-background px-1 text-xs"
                    value={s.column}
                    onChange={(e) =>
                      setSorts((prev) =>
                        prev.map((x) =>
                          x.id === s.id
                            ? { ...x, column: e.target.value }
                            : x
                        )
                      )
                    }
                  >
                    <option value="">Column</option>
                    {columns.map((c) => (
                      <option key={c.id} value={c.column}>
                        {c.alias || c.column}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() =>
                      setSorts((prev) =>
                        prev.map((x) =>
                          x.id === s.id
                            ? {
                                ...x,
                                direction:
                                  x.direction === "ASC" ? "DESC" : "ASC",
                              }
                            : x
                        )
                      )
                    }
                  >
                    {s.direction === "ASC" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeSort(s.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <label className="text-xs font-medium">Limit:</label>
                <Input
                  type="number"
                  className="h-7 w-20 text-xs"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 100)}
                  min={1}
                  max={10000}
                />
                {columns.some((c) => c.aggregate) && (
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={groupBy}
                      onChange={(e) => setGroupBy(e.target.checked)}
                    />
                    Group By
                  </label>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSql(!showSql)}
          >
            <Code className="me-2 h-4 w-4" />
            {showSql ? "Hide SQL" : "View SQL"}
          </Button>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={executeQuery}
              disabled={
                executing || !connectionId || !selectedTable || columns.length === 0
              }
            >
              <Play className="me-2 h-4 w-4" />
              {executing ? "Running..." : t.query.run}
            </Button>
          </div>
        </div>

        {/* Generated SQL Preview */}
        {showSql && sql && (
          <Card>
            <CardContent className="p-3">
              <pre className="overflow-x-auto text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                {sql}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        <Card className="min-h-0 flex-1 overflow-hidden">
          <CardHeader className="py-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{t.query.results}</CardTitle>
              {result && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Table2 className="h-3 w-3" />
                    {result.metadata.row_count} {t.query.rowCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {result.metadata.execution_time_ms}ms
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="h-[calc(100%-2.5rem)] overflow-auto p-0">
            {error && (
              <div className="flex items-center gap-2 p-4 text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}
            {result && (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="border-b px-3 py-1.5 text-start text-xs font-medium text-muted-foreground">
                      #
                    </th>
                    {result.columns.map((col: QueryResultColumn, i: number) => (
                      <th
                        key={i}
                        className="border-b px-3 py-1.5 text-start text-xs font-medium"
                      >
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row: unknown[], ri: number) => (
                    <tr key={ri} className="border-b hover:bg-muted/50">
                      <td className="px-3 py-1 text-xs text-muted-foreground">
                        {ri + 1}
                      </td>
                      {row.map((cell: unknown, ci: number) => (
                        <td
                          key={ci}
                          className="max-w-xs truncate px-3 py-1 font-mono text-xs"
                        >
                          {cell === null ? (
                            <span className="italic text-muted-foreground">
                              NULL
                            </span>
                          ) : (
                            String(cell)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!result && !error && (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Table2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">
                    Select columns and run your query
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
