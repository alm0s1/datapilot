"use client";

import { use, useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { databaseApi } from "@/lib/api/databases";
import { queryApi } from "@/lib/api/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Play,
  Save,
  Clock,
  Table2,
  AlertCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  BarChart3,
  ArrowLeft,
} from "lucide-react";
import type { QueryResult } from "@/types/query";
import SchemaBrowser from "@/components/query/SchemaBrowser";
import { SqlEditor } from "@/components/query/SqlEditor";
import apiClient from "@/lib/api/client";
import { toast } from "sonner";

export default function QueryViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [sql, setSql] = useState("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [showSchema, setShowSchema] = useState(true);
  const [resultTab, setResultTab] = useState<"table" | "chart">("table");

  const { data: savedQuery } = useQuery({
    queryKey: ["query", resolvedParams.id],
    queryFn: () => queryApi.get(resolvedParams.id),
  });

  const { data: connections } = useQuery({
    queryKey: ["databases"],
    queryFn: () => databaseApi.list(),
  });

  useEffect(() => {
    if (savedQuery) {
      setSql(savedQuery.sql_query || "");
      setConnectionId(savedQuery.connection_id);
    }
  }, [savedQuery]);

  const executeQuery = useCallback(async () => {
    if (!connectionId || !sql.trim()) return;
    setExecuting(true);
    setError(null);
    setResult(null);
    try {
      const execRes = await queryApi.execute(resolvedParams.id, {
        sql_override: sql !== savedQuery?.sql_query ? sql : undefined,
        limit: 1000,
        timeout_seconds: 30,
      });
      setResult(execRes);
      setResultTab("table");
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
  }, [connectionId, sql, resolvedParams.id, savedQuery?.sql_query]);

  const saveChanges = useCallback(async () => {
    try {
      await queryApi.update(resolvedParams.id, { sql_query: sql });
      queryClient.invalidateQueries({ queryKey: ["query", resolvedParams.id] });
      queryClient.invalidateQueries({ queryKey: ["queries"] });
      toast.success("Query saved");
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { detail?: string } };
        message?: string;
      };
      setError(err.response?.data?.detail || err.message || "Save failed");
    }
  }, [resolvedParams.id, sql, queryClient]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        executeQuery();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveChanges();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [executeQuery, saveChanges]);

  const handleInsertText = useCallback((text: string) => {
    setSql((prev) => prev + text);
  }, []);

  const exportCsv = useCallback(() => {
    if (!result) return;
    const headers = result.columns.map((c) => c.name).join(",");
    const rows = result.rows
      .map((row) =>
        row
          .map((cell) => {
            if (cell === null) return "";
            const str = String(cell);
            return str.includes(",") || str.includes('"')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(",")
      )
      .join("\n");
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${savedQuery?.name || "query"}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, savedQuery?.name]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0">
      {showSchema && (
        <div className="w-64 shrink-0 border-e bg-card">
          <SchemaBrowser connectionId={connectionId} onInsertText={handleInsertText} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3 ps-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowSchema(!showSchema)}>
              {showSchema ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => router.push("/query")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-bold">{savedQuery?.name || t.query.sqlEditor}</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
            >
              <option value="">Select database...</option>
              {connections?.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
              ))}
            </select>
            <Button size="sm" onClick={executeQuery} disabled={executing || !connectionId}>
              <Play className="me-2 h-4 w-4" />
              {executing ? t.common.loading : t.query.run}
            </Button>
            <Button variant="outline" size="sm" onClick={saveChanges}>
              <Save className="me-2 h-4 w-4" />
              {t.query.save}
            </Button>
          </div>
        </div>

        <SqlEditor
          value={sql}
          onChange={setSql}
          onExecute={executeQuery}
        />

        <Card className="min-h-[300px] overflow-hidden">
          <CardHeader className="py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  className={`rounded px-2 py-1 text-xs font-medium ${resultTab === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => setResultTab("table")}
                >
                  <Table2 className="me-1 inline h-3 w-3" />
                  {t.query.results}
                </button>
                <button
                  className={`rounded px-2 py-1 text-xs font-medium ${resultTab === "chart" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  onClick={() => setResultTab("chart")}
                >
                  <BarChart3 className="me-1 inline h-3 w-3" />
                  Chart
                </button>
              </div>
              <div className="flex items-center gap-3">
                {result && (
                  <>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Table2 className="h-3 w-3" />
                      {result.metadata.row_count} {t.query.rowCount}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {result.metadata.execution_time_ms}ms
                    </span>
                    <Button variant="ghost" size="sm" onClick={exportCsv}>
                      <Download className="me-1 h-3 w-3" />
                      <span className="text-xs">CSV</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[calc(100%-2.5rem)] overflow-auto p-0">
            {error && (
              <div className="flex items-center gap-2 p-4 text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}
            {result && resultTab === "table" && (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="border-b px-3 py-1.5 text-start text-xs font-medium text-muted-foreground">#</th>
                      {result.columns.map((col, i) => (
                        <th key={i} className="border-b px-3 py-1.5 text-start text-xs font-medium">
                          <div>{col.name}</div>
                          <div className="text-[10px] font-normal text-muted-foreground">{col.type}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, ri) => (
                      <tr key={ri} className="border-b hover:bg-muted/50">
                        <td className="px-3 py-1 text-xs text-muted-foreground">{ri + 1}</td>
                        {row.map((cell, ci) => (
                          <td key={ci} className="max-w-xs truncate px-3 py-1 font-mono text-xs">
                            {cell === null ? (
                              <span className="italic text-muted-foreground">NULL</span>
                            ) : typeof cell === "object" ? (
                              <span className="text-muted-foreground">{JSON.stringify(cell)}</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result && resultTab === "chart" && (
              <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="mx-auto mb-3 h-12 w-12" />
                  <p className="text-sm font-medium">Visualization</p>
                  <p className="mt-1 text-xs">
                    Add this query to a dashboard widget for chart visualization.
                  </p>
                </div>
              </div>
            )}
            {!result && !error && (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Play className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">Run the query to see results</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
