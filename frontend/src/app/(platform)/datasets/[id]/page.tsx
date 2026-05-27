"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { datasetApi } from "@/lib/api/datasets";
import { Button } from "@/components/ui/button";
import ProfilingDisplay from "@/components/datasets/ProfilingDisplay";
import ChartBuilder from "@/components/datasets/ChartBuilder";
import CleaningReportDisplay from "@/components/datasets/CleaningReportDisplay";
import type { AnalysisResults, ProfilingResults, CleaningReport } from "@/types/dataset";
import {
  ArrowLeft,
  FileSpreadsheet,
  ExternalLink,
  Trash2,
  Sparkles,
  Loader2,
  RefreshCw,
  Download,
  FileDown,
  FileText,
} from "lucide-react";

export default function DatasetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const datasetId = params.id as string;

  const { data: dataset, isLoading } = useQuery({
    queryKey: ["dataset", datasetId],
    queryFn: () => datasetApi.get(datasetId),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => datasetApi.analyze(datasetId, false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dataset", datasetId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => datasetApi.delete(datasetId),
    onSuccess: () => router.push("/datasets"),
  });

  const handleDelete = () => {
    if (confirm("Delete this dataset? The stored table will also be dropped.")) {
      deleteMutation.mutate();
    }
  };

  const handleDownloadCleaned = () => {
    const url = datasetApi.downloadCleanedFile(datasetId);
    const token = localStorage.getItem("access_token");
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        const name = dataset?.original_filename || "dataset.csv";
        const baseName = name.replace(/\.[^/.]+$/, "");
        a.download = `${baseName}_cleaned.csv`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => alert("Failed to download cleaned file"));
  };

  const handleDownloadReport = () => {
    const url = datasetApi.downloadReportFile(datasetId);
    const token = localStorage.getItem("access_token");
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        const name = dataset?.original_filename || "dataset";
        const baseName = name.replace(/\.[^/.]+$/, "");
        a.download = `${baseName}_cleaning_report.json`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => alert("Failed to download report"));
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "-";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="p-6 text-center text-muted-foreground">Dataset not found</div>
    );
  }

  const profiling = dataset.profiling_results as ProfilingResults | undefined;
  const analysis = dataset.analysis_results as AnalysisResults | undefined;
  const cleaningReport = dataset.cleaning_report as CleaningReport | undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/datasets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <FileSpreadsheet className="h-6 w-6 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold">{dataset.name}</h1>
          {dataset.description && <p className="text-sm text-muted-foreground">{dataset.description}</p>}
        </div>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">File</p>
          <p className="text-sm font-medium">{dataset.original_filename}</p>
          <p className="text-[10px] text-muted-foreground uppercase">{dataset.file_type} &middot; {formatSize(dataset.file_size_bytes)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Rows</p>
          <p className="text-xl font-bold">{dataset.row_count?.toLocaleString() ?? "-"}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Columns</p>
          <p className="text-xl font-bold">{dataset.column_count ?? "-"}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="text-sm font-medium capitalize">{dataset.upload_status}</p>
          <p className="text-[10px] text-muted-foreground">{new Date(dataset.created_at).toLocaleDateString()}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {dataset.connection_id && (
          <Button onClick={() => router.push(`/query/new?connection=${dataset.connection_id}`)}>
            <ExternalLink className="mr-2 h-4 w-4" /> Query this Dataset
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending}
        >
          {analyzeMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Re-analyze
        </Button>
        {cleaningReport && (
          <>
            <Button variant="outline" onClick={handleDownloadCleaned}>
              <FileDown className="mr-2 h-4 w-4" />
              Download Cleaned File
            </Button>
            <Button variant="outline" onClick={handleDownloadReport}>
              <FileText className="mr-2 h-4 w-4" />
              Download Report
            </Button>
          </>
        )}
        <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
          {deleteMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Delete
        </Button>
      </div>

      {/* Cleaning Report */}
      {cleaningReport && (
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-amber-500" /> Cleaning Report
          </h2>
          <CleaningReportDisplay report={cleaningReport} datasetId={datasetId} />
        </div>
      )}

      {/* Profiling */}
      {profiling && (
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">Data Profile</h2>
          <ProfilingDisplay profiling={profiling} />
        </div>
      )}

      {/* Analysis */}
      {analysis && (
        <div className="rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" /> Analysis
          </h2>

          {analysis.insights.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium">Insights</h3>
              <ul className="space-y-1">
                {analysis.insights.map((ins, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="shrink-0 text-primary">&#8226;</span>
                    {ins}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.key_metrics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {analysis.key_metrics.map((m, i) => (
                <div key={i} className="rounded bg-muted px-3 py-1.5 text-xs">
                  <span className="text-muted-foreground">{m.name}: </span>
                  <span className="font-medium">{m.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chart Builder */}
      {profiling && dataset.connection_id && (
        <div className="rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Chart Builder</h2>
          <ChartBuilder dataset={dataset} suggestions={analysis?.suggested_charts || []} />
        </div>
      )}
    </div>
  );
}
