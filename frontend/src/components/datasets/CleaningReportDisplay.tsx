"use client";

import { useState, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Download,
  Sparkles,
  Zap,
  AlertTriangle,
  AlertOctagon,
  Shield,
  Table2,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { datasetApi } from "@/lib/api/datasets";
import type { CleaningReport, ActionReport, PreviewResponse, QualityScoreBreakdown } from "@/types/dataset";

interface CleaningReportDisplayProps {
  report: CleaningReport;
  datasetId?: string;
}

const ACTION_LABELS: Record<string, string> = {
  column_name_normalization: "Column Name Normalization",
  text_normalization: "Text Normalization",
  null_representation: "Null Representation Fix",
  smart_duplicates: "Duplicate Removal",
  outlier_detection: "Outlier Detection",
  date_correction: "Date Correction",
  categorical_normalization: "Categorical Normalization",
  missing_value_imputation: "Missing Value Imputation",
  unit_normalization: "Unit Normalization",
  format_validation: "Format Validation",
  impossible_value_detection: "Impossible Value Detection",
};

const ACTION_ICONS: Record<string, typeof Sparkles> = {
  column_name_normalization: Zap,
  text_normalization: Zap,
  null_representation: AlertTriangle,
  smart_duplicates: Shield,
  outlier_detection: AlertTriangle,
  date_correction: Zap,
  categorical_normalization: Sparkles,
  missing_value_imputation: Sparkles,
  unit_normalization: Zap,
  format_validation: Shield,
  impossible_value_detection: AlertOctagon,
};

function qualityColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function qualityBg(score: number) {
  if (score >= 80) return "bg-emerald-500/10";
  if (score >= 50) return "bg-amber-500/10";
  return "bg-red-500/10";
}

function DeltaBadge({ before, after }: { before: number; after: number }) {
  const delta = after - before;
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
        <ArrowUpRight className="h-3 w-3" />+{delta.toFixed(1)}
      </span>
    );
  if (delta < 0)
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
        <ArrowDownRight className="h-3 w-3" />{delta.toFixed(1)}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Minus className="h-3 w-3" />0
    </span>
  );
}

const DIMENSION_LABELS: Record<string, string> = {
  completeness: "Completeness",
  uniqueness: "Uniqueness",
  consistency: "Consistency",
  validity: "Validity",
  structural: "Structural",
  semantic: "Semantic",
};

function barColor(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function DimensionBreakdown({
  before,
  after,
}: {
  before?: QualityScoreBreakdown | null;
  after?: QualityScoreBreakdown | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const breakdown = after || before;
  if (!breakdown) return null;

  const dims = Object.entries(breakdown.dimensions).sort(
    (a, b) => b[1].weight - a[1].weight
  );

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2">
          Quality Dimensions
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {breakdown.method === "profiling_enhanced" ? "Enhanced" : "Basic"}
          </span>
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="space-y-3 border-t px-4 py-3">
          {dims.map(([key, dim]) => {
            const beforeDim = before?.dimensions?.[key];
            const label = DIMENSION_LABELS[key] || key;
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      weight: {dim.weight.toFixed(0)}%
                    </span>
                    <span className={qualityColor(dim.score)}>
                      {dim.score.toFixed(0)}
                    </span>
                    {beforeDim && (
                      <DeltaBadge
                        before={beforeDim.score}
                        after={dim.score}
                      />
                    )}
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className={`h-1.5 rounded-full transition-all ${barColor(dim.score)}`}
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionCard({ action }: { action: ActionReport }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ACTION_ICONS[action.action_type] || Sparkles;

  return (
    <Card
      className={`transition-all ${
        action.success ? "border-border/50" : "border-red-500/30 bg-red-500/5"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {action.success ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          )}
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                {ACTION_LABELS[action.action_type] || action.action_type}
              </span>
              {action.target_column && (
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {action.target_column}
                </code>
              )}
              <span className="text-xs text-muted-foreground">
                {action.rows_affected.toLocaleString()} rows affected
              </span>
              <span className="text-xs text-muted-foreground">
                {action.cells_modified.toLocaleString()} cells modified
              </span>
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {action.execution_time_ms}ms
              </span>
            </div>

            {action.error_message && (
              <p className="mt-1 text-xs text-red-400">{action.error_message}</p>
            )}

            {/* Expandable before/after */}
            {(action.before_sample.length > 0 || action.after_sample.length > 0) && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {expanded ? "Hide" : "Show"} before/after
              </button>
            )}

            {expanded && (
              <div className="mt-2 grid grid-cols-2 gap-3 rounded bg-muted/50 p-3 text-xs">
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">Before</p>
                  {action.before_sample.map((v, i) => (
                    <div key={i} className="truncate text-red-400/80">
                      {String(v ?? "null")}
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-1 font-medium text-muted-foreground">After</p>
                  {action.after_sample.map((v, i) => (
                    <div key={i} className="truncate text-emerald-400/80">
                      {String(v ?? "null")}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CleanedDataPreview({ datasetId }: { datasetId: string }) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const fetchPreview = useCallback(async () => {
    if (preview) {
      setVisible((v) => !v);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await datasetApi.getPreview(datasetId, true);
      setPreview(data);
      setVisible(true);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load preview");
    } finally {
      setLoading(false);
    }
  }, [datasetId, preview]);

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        onClick={fetchPreview}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : visible ? (
          <EyeOff className="mr-2 h-3.5 w-3.5" />
        ) : (
          <Eye className="mr-2 h-3.5 w-3.5" />
        )}
        {loading
          ? "Loading..."
          : visible
            ? "Hide Cleaned Data"
            : "Preview Cleaned Data"}
      </Button>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {visible && preview && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-sm font-medium">
              <Table2 className="h-4 w-4 text-emerald-500" />
              Cleaned Data
            </h4>
            <span className="text-xs text-muted-foreground">
              {preview.total_rows.toLocaleString()} rows &middot;{" "}
              {preview.columns.length} columns
            </span>
          </div>
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
      )}
    </div>
  );
}

export default function CleaningReportDisplay({
  report,
  datasetId,
}: CleaningReportDisplayProps) {
  const handleDownload = () => {
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cleaning-report.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const rowsDelta = report.total_rows_before - report.total_rows_after;
  const successCount = report.actions.filter((a) => a.success).length;

  return (
    <div className="space-y-4">
      {/* Quality Score Before/After */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className={`rounded-lg p-4 text-center ${qualityBg(
            report.quality_score_before
          )}`}
        >
          <p className="text-xs font-medium text-muted-foreground">
            Quality Before
          </p>
          <p
            className={`mt-1 text-3xl font-bold ${qualityColor(
              report.quality_score_before
            )}`}
          >
            {report.quality_score_before.toFixed(0)}
          </p>
        </div>
        <div
          className={`rounded-lg p-4 text-center ${qualityBg(
            report.quality_score_after
          )}`}
        >
          <p className="text-xs font-medium text-muted-foreground">
            Quality After
          </p>
          <p
            className={`mt-1 text-3xl font-bold ${qualityColor(
              report.quality_score_after
            )}`}
          >
            {report.quality_score_after.toFixed(0)}
          </p>
          <div className="mt-1">
            <DeltaBadge
              before={report.quality_score_before}
              after={report.quality_score_after}
            />
          </div>
        </div>
      </div>

      {/* Dimension Breakdown */}
      <DimensionBreakdown
        before={report.quality_breakdown_before}
        after={report.quality_breakdown_after}
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">Actions Run</p>
          <p className="mt-0.5 text-lg font-bold">
            {successCount}/{report.actions.length}
          </p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">Cells Modified</p>
          <p className="mt-0.5 text-lg font-bold">
            {report.total_cells_modified.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">Rows Removed</p>
          <p className="mt-0.5 text-lg font-bold">
            {rowsDelta > 0 ? rowsDelta.toLocaleString() : "0"}
          </p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">Execution Time</p>
          <p className="mt-0.5 text-lg font-bold">
            {report.execution_time_seconds.toFixed(1)}s
          </p>
        </div>
      </div>

      {/* Impact Summary */}
      {report.impact_summary && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <h3 className="text-sm font-medium">Impact Summary</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-sm">
            {report.impact_summary.critical_issues_fixed > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertOctagon className="h-3.5 w-3.5 text-red-400" />
                <span className="text-red-400 font-medium">
                  {report.impact_summary.critical_issues_fixed}
                </span>
                <span className="text-muted-foreground text-xs">critical fixed</span>
              </div>
            )}
            {report.impact_summary.warning_issues_fixed > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-amber-400 font-medium">
                  {report.impact_summary.warning_issues_fixed}
                </span>
                <span className="text-muted-foreground text-xs">warnings fixed</span>
              </div>
            )}
            {report.impact_summary.destructive_actions_applied > 0 && (
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-amber-400 font-medium">
                  {report.impact_summary.destructive_actions_applied}
                </span>
                <span className="text-muted-foreground text-xs">destructive actions</span>
              </div>
            )}
          </div>
          {report.impact_summary.max_rows_affected_pct > 50 && (
            <div className="mt-1 flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              High impact: up to {report.impact_summary.max_rows_affected_pct.toFixed(1)}% of
              rows were affected by a single action
            </div>
          )}
        </div>
      )}

      {/* Preview Cleaned Data */}
      {datasetId && <CleanedDataPreview datasetId={datasetId} />}

      {/* Post-Cleaning Validation */}
      {report.validation_result && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Post-Cleaning Validation
          </h3>
          <div
            className={`rounded-lg border p-4 ${
              report.validation_result.passed
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-red-500/30 bg-red-500/5"
            }`}
          >
            <div className="flex items-center gap-2">
              {report.validation_result.passed ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400" />
              )}
              <span className="text-sm font-medium">
                {report.validation_result.passed
                  ? "Validation Passed"
                  : "Validation Failed"}
              </span>
              {report.validation_result.quality_delta && (
                <span className="ml-auto text-xs text-muted-foreground">
                  Quality delta:{" "}
                  <span
                    className={
                      report.validation_result.quality_delta.overall_delta >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }
                  >
                    {report.validation_result.quality_delta.overall_delta > 0
                      ? "+"
                      : ""}
                    {report.validation_result.quality_delta.overall_delta}
                  </span>
                </span>
              )}
            </div>

            {/* Warnings */}
            {report.validation_result.warnings &&
              report.validation_result.warnings.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {report.validation_result.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-xs text-amber-400"
                    >
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

            {/* Row preservation */}
            {report.validation_result.row_preservation && (
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <div className="rounded bg-muted/50 p-2 text-center">
                  <div className="text-muted-foreground">Rows Before</div>
                  <div className="font-medium">
                    {report.validation_result.row_preservation.rows_before?.toLocaleString()}
                  </div>
                </div>
                <div className="rounded bg-muted/50 p-2 text-center">
                  <div className="text-muted-foreground">Rows After</div>
                  <div className="font-medium">
                    {report.validation_result.row_preservation.rows_after?.toLocaleString()}
                  </div>
                </div>
                <div className="rounded bg-muted/50 p-2 text-center">
                  <div className="text-muted-foreground">Removed</div>
                  <div className="font-medium">
                    {report.validation_result.row_preservation.rows_removed?.toLocaleString()}
                  </div>
                </div>
                <div className="rounded bg-muted/50 p-2 text-center">
                  <div className="text-muted-foreground">Removal %</div>
                  <div className="font-medium">
                    {report.validation_result.row_preservation.removal_pct}%
                  </div>
                </div>
              </div>
            )}

            {/* Distribution shifts */}
            {report.validation_result.distribution_shifts &&
              report.validation_result.distribution_shifts.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Distribution Shifts Detected
                  </p>
                  <div className="overflow-auto rounded border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium">
                            Column
                          </th>
                          <th className="px-2 py-1 text-left font-medium">
                            KS Statistic
                          </th>
                          <th className="px-2 py-1 text-left font-medium">
                            p-value
                          </th>
                          <th className="px-2 py-1 text-left font-medium">
                            Mean Before
                          </th>
                          <th className="px-2 py-1 text-left font-medium">
                            Mean After
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.validation_result.distribution_shifts.map(
                          (shift, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-2 py-1 font-mono">
                                {shift.column}
                              </td>
                              <td className="px-2 py-1">
                                {shift.ks_statistic?.toFixed(4)}
                              </td>
                              <td className="px-2 py-1">{shift.p_value?.toFixed(4)}</td>
                              <td className="px-2 py-1">
                                {shift.mean_before?.toFixed(2)}
                              </td>
                              <td className="px-2 py-1">
                                {shift.mean_after?.toFixed(2)}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      {/* Per-Action Cards */}
      {report.actions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Action Details
          </h3>
          {report.actions.map((action, i) => (
            <ActionCard key={i} action={action} />
          ))}
        </div>
      )}

      {/* Download */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="mr-2 h-3.5 w-3.5" />
          Download Report (JSON)
        </Button>
      </div>
    </div>
  );
}
