"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { databaseApi } from "@/lib/api/databases";
import { queryApi } from "@/lib/api/queries";
import { collectionApi } from "@/lib/api/collections";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  X,
  Sparkles,
  FolderOpen,
} from "lucide-react";
import type { QueryResult } from "@/types/query";
import SchemaBrowser from "@/components/query/SchemaBrowser";
import { SqlEditor } from "@/components/query/SqlEditor";
import { NL2SQLChatPanel } from "@/components/query/NL2SQLChatPanel";
import apiClient from "@/lib/api/client";
import { toast } from "sonner";

function NewQueryContent() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [sql, setSql] = useState("SELECT * FROM ");
  const [connectionId, setConnectionId] = useState<string>(
    searchParams.get("connection") || ""
  );
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [showSchema, setShowSchema] = useState(true);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [queryName, setQueryName] = useState("");
  const [queryDescription, setQueryDescription] = useState("");
  const [savedQueryId, setSavedQueryId] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [resultTab, setResultTab] = useState<"table" | "chart">("table");

  const { data: connections } = useQuery({
    queryKey: ["databases"],
    queryFn: () => databaseApi.list(),
  });

  const { data: collections } = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionApi.list(),
  });

  const executeQuery = useCallback(async () => {
    if (!connectionId || !sql.trim()) return;
    setExecuting(true);
    setError(null);
    setResult(null);
    try {
      const execRes = await apiClient.post("/queries/execute-raw", {
        connection_id: connectionId,
        sql: sql,
        limit: 1000,
        timeout_seconds: 30,
      });
      setResult(execRes.data);
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
  }, [connectionId, sql]);

  const saveQuery = useCallback(async () => {
    if (!connectionId || !queryName.trim()) return;
    try {
      if (savedQueryId) {
        await queryApi.update(savedQueryId, {
          name: queryName,
          description: queryDescription || undefined,
          sql_query: sql,
          collection_id: selectedCollectionId || undefined,
        });
      } else {
        const saved = await queryApi.create({
          name: queryName,
          description: queryDescription || undefined,
          connection_id: connectionId,
          sql_query: sql,
          query_type: "sql",
          collection_id: selectedCollectionId || undefined,
        });
        setSavedQueryId(saved.id);
      }
      setShowSaveDialog(false);
      queryClient.invalidateQueries({ queryKey: ["queries"] });
      toast.success("Query saved successfully");
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { detail?: string } };
        message?: string;
      };
      setError(err.response?.data?.detail || err.message || "Save failed");
    }
  }, [connectionId, queryName, queryDescription, sql, savedQueryId, selectedCollectionId, queryClient]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        executeQuery();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (savedQueryId) {
          saveQuery();
        } else {
          setShowSaveDialog(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [executeQuery, saveQuery, savedQueryId]);

  const handleInsertText = useCallback((text: string) => {
    setSql((prev) => prev + text);
  }, []);

  const handleAISqlGenerated = useCallback((generatedSql: string) => {
    setSql(generatedSql);
    toast.success("SQL applied to editor");
  }, []);

  const handleAIExecuteSql = useCallback((sqlToExecute: string) => {
    setSql(sqlToExecute);
    // Execute after state update
    setTimeout(() => {
      executeQuery();
    }, 100);
  }, [executeQuery]);

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
    a.download = `query-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 overflow-hidden">
      {/* Schema Browser Sidebar */}
      {showSchema && (
        <div className="w-64 shrink-0 border-e bg-card overflow-y-auto">
          <SchemaBrowser
            connectionId={connectionId}
            onInsertText={handleInsertText}
          />
        </div>
      )}

      {/* Main Editor Area */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 ps-3 overflow-y-auto">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSchema(!showSchema)}
              title="Toggle schema browser"
            >
              {showSchema ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </Button>
            <h1 className="text-lg font-bold">
              {savedQueryId ? queryName || t.query.sqlEditor : t.query.sqlEditor}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
            >
              <option value="">Select database...</option>
              {connections?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={executeQuery}
              disabled={executing || !connectionId}
            >
              <Play className="me-2 h-4 w-4" />
              {executing ? t.common.loading : t.query.run}
              <span className="ms-2 hidden text-xs opacity-60 sm:inline">
                {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+Enter
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (savedQueryId) {
                  saveQuery();
                } else {
                  setShowSaveDialog(true);
                }
              }}
            >
              <Save className="me-2 h-4 w-4" />
              {t.query.save}
            </Button>
            <Button
              variant={showAIPanel ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAIPanel(!showAIPanel)}
              className={showAIPanel ? "bg-primary/90" : ""}
            >
              <Sparkles className="me-2 h-4 w-4" />
              AI Assistant
            </Button>
          </div>
        </div>

        {/* Editor */}
        <SqlEditor
          value={sql}
          onChange={setSql}
          onExecute={executeQuery}
        />

        {/* AI Assistant Panel */}
        {showAIPanel && connectionId && (
          <NL2SQLChatPanel
            connectionId={connectionId}
            onSqlGenerated={handleAISqlGenerated}
            onExecuteSql={handleAIExecuteSql}
          />
        )}

        {/* Results */}
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
                      <th className="border-b px-3 py-1.5 text-start text-xs font-medium text-muted-foreground">
                        #
                      </th>
                      {result.columns.map((col, i) => (
                        <th
                          key={i}
                          className="border-b px-3 py-1.5 text-start text-xs font-medium"
                        >
                          <div>{col.name}</div>
                          <div className="text-[10px] font-normal text-muted-foreground">
                            {col.type}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, ri) => (
                      <tr key={ri} className="border-b hover:bg-muted/50">
                        <td className="px-3 py-1 text-xs text-muted-foreground">
                          {ri + 1}
                        </td>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="max-w-xs truncate px-3 py-1 font-mono text-xs"
                          >
                            {cell === null ? (
                              <span className="italic text-muted-foreground">
                                NULL
                              </span>
                            ) : typeof cell === "object" ? (
                              <span className="text-muted-foreground">
                                {JSON.stringify(cell)}
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
              </div>
            )}
            {result && resultTab === "chart" && (
              <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="mx-auto mb-3 h-12 w-12" />
                  <p className="text-sm font-medium">Visualization</p>
                  <p className="mt-1 text-xs">
                    Save this query first, then add it to a dashboard widget for
                    chart visualization.
                  </p>
                </div>
              </div>
            )}
            {!result && !error && (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Play className="mx-auto mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">
                    {t.query.run} a query to see results
                  </p>
                  <p className="mt-1 text-xs opacity-60">
                    {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+Enter
                    to execute
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Save Dialog Overlay */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t.query.save}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSaveDialog(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Name</label>
                <Input
                  value={queryName}
                  onChange={(e) => setQueryName(e.target.value)}
                  placeholder="My Query"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveQuery();
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Description (optional)
                </label>
                <Input
                  value={queryDescription}
                  onChange={(e) => setQueryDescription(e.target.value)}
                  placeholder="What does this query do?"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  <FolderOpen className="me-1 inline h-3.5 w-3.5" />
                  Collection (optional)
                </label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedCollectionId}
                  onChange={(e) => setSelectedCollectionId(e.target.value)}
                >
                  <option value="">No collection</option>
                  {collections?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowSaveDialog(false)}
                >
                  {t.common.cancel}
                </Button>
                <Button onClick={saveQuery} disabled={!queryName.trim()}>
                  <Save className="me-2 h-4 w-4" />
                  {t.common.save}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function NewQueryPage() {
  return (
    <Suspense>
      <NewQueryContent />
    </Suspense>
  );
}
