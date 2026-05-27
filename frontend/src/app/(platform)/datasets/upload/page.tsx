"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { datasetApi } from "@/lib/api/datasets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FileUploader from "@/components/datasets/FileUploader";
import ProfilingDisplay from "@/components/datasets/ProfilingDisplay";
import SuggestedVisualizations from "@/components/datasets/SuggestedVisualizations";
import CleaningSuggestionPanel from "@/components/datasets/CleaningSuggestionPanel";
import CleaningProgressPanel from "@/components/datasets/CleaningProgressPanel";
import CleaningReportDisplay from "@/components/datasets/CleaningReportDisplay";
import type {
  Dataset,
  CleaningConfig,
  CleaningAction,
  CleaningSuggestion,
  CleaningReport,
  PreviewResponse,
  ProfilingResults,
  AnalysisResults,
} from "@/types/dataset";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
  BarChart3,
  LineChart,
  PieChart,
  ScatterChart as ScatterIcon,
  FileSearch,
  Wand2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = [
  "Upload",
  "Preview & Clean",
  "Profile",
  "Analyze & Finalize",
];

// Sub-states for the Smart Cleaning step (step 3)
type CleaningPhase = "suggestions" | "progress" | "report";

export default function UploadWizardPage() {
  const t = useTranslations();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Core state
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [cleaningConfig, setCleaningConfig] = useState<CleaningConfig>({
    trim_whitespace: true,
    normalize_types: true,
    handle_nulls: "none",
    remove_duplicates: true,
  });
  const [profiling, setProfiling] = useState<ProfilingResults | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResults | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [datasetDesc, setDatasetDesc] = useState("");
  const [finalized, setFinalized] = useState(false);

  // Smart cleaning state
  const [suggestions, setSuggestions] = useState<CleaningSuggestion[]>([]);
  const [useAi, setUseAi] = useState(false);
  const [cleaningPhase, setCleaningPhase] = useState<CleaningPhase>("suggestions");
  const [cleaningJobId, setCleaningJobId] = useState<string | null>(null);
  const [cleaningReport, setCleaningReport] = useState<CleaningReport | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // -------------------------------------------------------------------------
  // Step 1: Upload file
  // -------------------------------------------------------------------------
  const handleUpload = async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const ds = await datasetApi.upload(file);
      setDataset(ds);
      setDatasetName(ds.name);

      // Auto-fetch preview
      const prev = await datasetApi.getPreview(ds.id);
      setPreview(prev);
      setStep(2);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "Upload failed");
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Step 2: Apply basic cleaning
  // -------------------------------------------------------------------------
  const handleBasicClean = async () => {
    if (!dataset) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await datasetApi.clean(dataset.id, cleaningConfig);
      setPreview(result);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Cleaning failed");
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Step 2 → 3: Generate suggestions
  // -------------------------------------------------------------------------
  const handleGenerateSuggestions = async () => {
    if (!dataset) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await datasetApi.suggest(dataset.id, useAi);
      setSuggestions(result);
      setCleaningPhase("suggestions");
      setCleaningReport(null);
      setCleaningJobId(null);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to generate suggestions");
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Step 3: Apply approved cleaning actions
  // -------------------------------------------------------------------------
  const handleApplyActions = async (actions: CleaningAction[]) => {
    if (!dataset || actions.length === 0) return;
    setIsApplying(true);
    setError(null);
    try {
      const job = await datasetApi.cleanWithPlan(dataset.id, { actions });

      if (job.status === "completed" && job.report) {
        // Synchronous completion
        setCleaningReport(job.report);
        setCleaningPhase("report");
      } else {
        // Async — show progress panel
        setCleaningJobId(job.job_id);
        setCleaningPhase("progress");
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to apply cleaning actions");
    } finally {
      setIsApplying(false);
    }
  };

  const handleCleaningComplete = useCallback((report: CleaningReport) => {
    setCleaningReport(report);
    setCleaningPhase("report");
  }, []);

  const handleCleaningError = useCallback((msg: string) => {
    setError(msg);
    setCleaningPhase("suggestions");
  }, []);

  // -------------------------------------------------------------------------
  // Step 2 → 3: Profile
  // -------------------------------------------------------------------------
  const handleProfile = async () => {
    if (!dataset) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await datasetApi.getProfile(dataset.id);
      setProfiling(result);
      setStep(3);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Profiling failed");
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Step 4: Analyze & Finalize
  // -------------------------------------------------------------------------
  const handleAnalyze = async () => {
    if (!dataset) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await datasetApi.analyze(dataset.id, false);
      setAnalysis(result);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Analysis failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!dataset) return;
    setIsLoading(true);
    setError(null);
    try {
      if (datasetName !== dataset.name || datasetDesc) {
        await datasetApi.update(dataset.id, {
          name: datasetName,
          description: datasetDesc,
        });
      }
      const stored = await datasetApi.store(dataset.id);
      setDataset(stored);

      const analysisResult = await datasetApi.analyze(dataset.id, false);
      setAnalysis(analysisResult);

      setFinalized(true);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Finalize failed");
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const chartIcon = (type: string) => {
    switch (type) {
      case "line":
        return <LineChart className="h-5 w-5 text-blue-500" />;
      case "bar":
        return <BarChart3 className="h-5 w-5 text-green-500" />;
      case "pie":
        return <PieChart className="h-5 w-5 text-orange-500" />;
      case "scatter":
        return <ScatterIcon className="h-5 w-5 text-purple-500" />;
      default:
        return <BarChart3 className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/datasets")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Upload Dataset</h1>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const stepNum = (i + 1) as Step;
          const isActive = step === stepNum;
          const isDone = step > stepNum || finalized;
          return (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px w-8 ${isDone ? "bg-primary" : "bg-muted"}`}
                />
              )}
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span>{stepNum}</span>
                )}
                <span className="hidden sm:inline">{label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ============================================================== */}
      {/* Step 1: Upload                                                  */}
      {/* ============================================================== */}
      {step === 1 && (
        <div className="rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">
            Choose a file to upload
          </h2>
          <FileUploader onFileSelected={handleUpload} isUploading={isLoading} />
        </div>
      )}

      {/* ============================================================== */}
      {/* Step 2: Preview & Clean (basic + smart combined)                */}
      {/* ============================================================== */}
      {step === 2 && preview && (
        <div className="space-y-4">
          <div className="rounded-lg border p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Data Preview</h2>
              <span className="text-sm text-muted-foreground">
                {preview.total_rows.toLocaleString()} rows total
              </span>
            </div>

            {/* Preview table */}
            <div className="max-h-80 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {preview.columns.map((col) => (
                      <th
                        key={col.name}
                        className="whitespace-nowrap px-3 py-2 text-start font-medium"
                      >
                        <div>{col.name}</div>
                        <div className="font-normal text-muted-foreground">
                          {col.detected_type}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-t hover:bg-muted/50">
                      {row.map((val, j) => (
                        <td key={j} className="whitespace-nowrap px-3 py-1.5">
                          {val === null || val === undefined ? (
                            <span className="italic text-muted-foreground">
                              null
                            </span>
                          ) : (
                            String(val)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Basic cleaning config */}
          <div className="rounded-lg border p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Wand2 className="h-5 w-5" /> Basic Cleaning
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cleaningConfig.trim_whitespace}
                  onChange={(e) =>
                    setCleaningConfig({
                      ...cleaningConfig,
                      trim_whitespace: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                Trim whitespace
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cleaningConfig.normalize_types}
                  onChange={(e) =>
                    setCleaningConfig({
                      ...cleaningConfig,
                      normalize_types: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                Normalize column types
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cleaningConfig.remove_duplicates}
                  onChange={(e) =>
                    setCleaningConfig({
                      ...cleaningConfig,
                      remove_duplicates: e.target.checked,
                    })
                  }
                  className="rounded"
                />
                Remove duplicates
              </label>
              <div className="space-y-1">
                <label className="text-sm">Handle null values</label>
                <select
                  value={cleaningConfig.handle_nulls}
                  onChange={(e) =>
                    setCleaningConfig({
                      ...cleaningConfig,
                      handle_nulls: e.target
                        .value as CleaningConfig["handle_nulls"],
                    })
                  }
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                >
                  <option value="none">Keep as-is</option>
                  <option value="drop_rows">Drop rows with nulls</option>
                  <option value="fill_empty">Fill with empty/zero</option>
                  <option value="forward_fill">Forward fill</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                onClick={handleBasicClean}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Apply Basic Cleaning
              </Button>
              {preview.rows_removed !== undefined &&
                preview.rows_removed > 0 && (
                  <span className="flex items-center text-sm text-green-600">
                    <Check className="mr-1 h-4 w-4" />
                    {preview.rows_removed} rows removed
                  </span>
                )}
            </div>
          </div>

          {/* Smart cleaning section */}
          <div className="rounded-lg border p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Sparkles className="h-5 w-5 text-amber-500" /> Smart Cleaning
                {useAi && (
                  <span className="flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">
                    <Sparkles className="h-3 w-3" />
                    AI-enhanced
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {cleaningPhase === "suggestions" && suggestions.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUseAi(!useAi);
                      handleGenerateSuggestions();
                    }}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-3.5 w-3.5 text-violet-400" />
                    )}
                    {useAi ? "Regenerate without AI" : "Enhance with AI"}
                  </Button>
                )}
                {suggestions.length === 0 && cleaningPhase === "suggestions" && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useAi}
                        onChange={(e) => setUseAi(e.target.checked)}
                        className="rounded"
                      />
                      <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                      <span className="text-muted-foreground">AI-enhanced</span>
                    </label>
                    <Button
                      size="sm"
                      onClick={handleGenerateSuggestions}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-3.5 w-3.5" />
                      )}
                      Generate Suggestions
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Sub-phase: Suggestions */}
            {cleaningPhase === "suggestions" && suggestions.length > 0 && (
              <CleaningSuggestionPanel
                suggestions={suggestions}
                onApply={handleApplyActions}
                isApplying={isApplying}
              />
            )}

            {/* Sub-phase: No suggestions yet */}
            {cleaningPhase === "suggestions" && suggestions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Click &quot;Generate Suggestions&quot; to analyze your data and get
                intelligent cleaning recommendations.
              </p>
            )}

            {/* Sub-phase: Progress */}
            {cleaningPhase === "progress" && dataset && cleaningJobId && (
              <CleaningProgressPanel
                datasetId={dataset.id}
                jobId={cleaningJobId}
                onComplete={handleCleaningComplete}
                onError={handleCleaningError}
              />
            )}

            {/* Sub-phase: Report */}
            {cleaningPhase === "report" && cleaningReport && (
              <CleaningReportDisplay report={cleaningReport} datasetId={dataset?.id?.toString()} />
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              onClick={handleProfile}
              disabled={isLoading || cleaningPhase === "progress"}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSearch className="mr-2 h-4 w-4" />
              )}
              Generate Profile
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Step 3: Profile                                                 */}
      {/* ============================================================== */}
      {step === 3 && profiling && (
        <div className="space-y-4">
          <div className="rounded-lg border p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <FileSearch className="h-5 w-5" /> Data Profile
            </h2>
            <ProfilingDisplay profiling={profiling} />
          </div>

          {/* Show cleaning report summary if available */}
          {cleaningReport && (
            <div className="rounded-lg border p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Sparkles className="h-5 w-5 text-amber-500" /> Cleaning Summary
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Quality Score</p>
                  <p className="mt-0.5 text-lg font-bold text-emerald-400">
                    {cleaningReport.quality_score_after.toFixed(0)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Actions</p>
                  <p className="mt-0.5 text-lg font-bold">
                    {cleaningReport.actions.filter((a) => a.success).length}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Cells Modified</p>
                  <p className="mt-0.5 text-lg font-bold">
                    {cleaningReport.total_cells_modified.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Time</p>
                  <p className="mt-0.5 text-lg font-bold">
                    {cleaningReport.execution_time_seconds.toFixed(1)}s
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              onClick={() => {
                handleAnalyze();
                setStep(4);
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Analyze & Finalize
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Step 4: Analyze & Finalize                                      */}
      {/* ============================================================== */}
      {step === 4 && (
        <div className="space-y-4">
          {!finalized ? (
            <>
              {/* Dataset name */}
              <div className="space-y-4 rounded-lg border p-6">
                <h2 className="text-lg font-semibold">Dataset Details</h2>
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={datasetName}
                    onChange={(e) => setDatasetName(e.target.value)}
                    placeholder="Dataset name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Description (optional)
                  </label>
                  <Input
                    value={datasetDesc}
                    onChange={(e) => setDatasetDesc(e.target.value)}
                    placeholder="What is this dataset about?"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Analysis results */}
              {analysis && (
                <div className="space-y-4 rounded-lg border p-6">
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Sparkles className="h-5 w-5 text-amber-500" /> Analysis
                    Insights
                  </h2>
                  {analysis.insights.length > 0 && (
                    <ul className="space-y-1">
                      {analysis.insights.map((insight, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span className="shrink-0 text-primary">
                            &#8226;
                          </span>
                          {insight}
                        </li>
                      ))}
                    </ul>
                  )}

                  {analysis.key_metrics.length > 0 && (
                    <div className="flex flex-wrap gap-3">
                      {analysis.key_metrics.map((m, i) => (
                        <div
                          key={i}
                          className="rounded-md bg-muted px-3 py-1.5 text-xs"
                        >
                          <span className="text-muted-foreground">
                            {m.name}:{" "}
                          </span>
                          <span className="font-medium">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {analysis.suggested_charts.length > 0 && (
                    <div>
                      <h3 className="mb-3 text-sm font-medium">
                        Suggested Visualizations
                      </h3>
                      {dataset?.connection_id && dataset?.table_name ? (
                        <SuggestedVisualizations
                          dataset={dataset}
                          suggestions={analysis.suggested_charts}
                        />
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {analysis.suggested_charts.map((chart, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-3 rounded-lg border p-3"
                            >
                              {chartIcon(chart.chart_type)}
                              <div>
                                <p className="text-sm font-medium capitalize">
                                  {chart.chart_type} Chart
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {chart.reasoning}
                                </p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  X: {chart.x_column}
                                  {chart.y_column
                                    ? ` / Y: ${chart.y_column}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={handleFinalize}
                  disabled={isLoading || !datasetName.trim()}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Finalize & Store
                </Button>
              </div>
            </>
          ) : (
            /* Success State */
            <div className="space-y-4 rounded-lg border p-8 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
              <h2 className="text-xl font-bold">Dataset Ready!</h2>
              <p className="text-muted-foreground">
                Your dataset <strong>{dataset?.name}</strong> has been cleaned,
                profiled, and stored.
                <br />
                It is now available in the Query Editor as a database connection.
              </p>

              {analysis && analysis.insights.length > 0 && (
                <div className="mx-auto max-w-md rounded-lg bg-muted/50 p-4 text-start text-sm">
                  <p className="mb-2 flex items-center gap-1 font-medium">
                    <Sparkles className="h-4 w-4 text-amber-500" /> Key Insights
                  </p>
                  <ul className="space-y-1 text-muted-foreground">
                    {analysis.insights.slice(0, 3).map((ins, i) => (
                      <li key={i}>&#8226; {ins}</li>
                    ))}
                  </ul>
                </div>
              )}

              {cleaningReport && (
                <div className="mx-auto max-w-md rounded-lg bg-muted/50 p-4 text-start text-sm">
                  <p className="mb-2 flex items-center gap-1 font-medium">
                    <Wand2 className="h-4 w-4 text-emerald-500" /> Cleaning
                    Summary
                  </p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>
                      Quality score: {cleaningReport.quality_score_before.toFixed(0)}{" "}
                      &rarr; {cleaningReport.quality_score_after.toFixed(0)}
                    </li>
                    <li>
                      Cells modified:{" "}
                      {cleaningReport.total_cells_modified.toLocaleString()}
                    </li>
                    <li>
                      Actions applied:{" "}
                      {cleaningReport.actions.filter((a) => a.success).length}
                    </li>
                  </ul>
                </div>
              )}

              <div className="flex justify-center gap-3">
                <Button
                  onClick={() => router.push(`/datasets/${dataset?.id}`)}
                >
                  View Dataset
                </Button>
                {dataset?.connection_id && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push(
                        `/query/new?connection=${dataset.connection_id}`
                      )
                    }
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Query this Dataset
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => router.push("/dashboard")}
                >
                  Go to Dashboards
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
