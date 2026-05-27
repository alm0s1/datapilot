"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { datasetApi } from "@/lib/api/datasets";
import type { CleaningJobResponse, CleaningReport } from "@/types/dataset";

interface CleaningProgressPanelProps {
  datasetId: string;
  jobId: string;
  onComplete: (report: CleaningReport) => void;
  onError: (error: string) => void;
}

const STEP_LABELS: Record<string, string> = {
  loading: "Loading dataset...",
  loaded: "Dataset loaded",
  saving: "Saving cleaned data...",
  done: "Cleaning complete",
  column_name_normalization: "Normalizing column names...",
  text_normalization: "Normalizing text values...",
  null_representation: "Fixing null representations...",
  smart_duplicates: "Removing duplicates...",
  outlier_detection: "Detecting outliers...",
  date_correction: "Correcting date formats...",
  categorical_normalization: "Normalizing categorical values...",
  missing_value_imputation: "Imputing missing values...",
  unit_normalization: "Normalizing units...",
  format_validation: "Validating formats...",
  impossible_value_detection: "Detecting impossible values...",
};

export default function CleaningProgressPanel({
  datasetId,
  jobId,
  onComplete,
  onError,
}: CleaningProgressPanelProps) {
  const [status, setStatus] = useState<string>("queued");
  const [progressPct, setProgressPct] = useState(0);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const poll = useCallback(async () => {
    if (completedRef.current) return;

    try {
      const job: CleaningJobResponse = await datasetApi.getCleaningStatus(
        datasetId,
        jobId
      );

      setStatus(job.status);
      setProgressPct(job.progress_pct);
      setCurrentStep(job.current_step || null);

      if (job.status === "completed") {
        completedRef.current = true;
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (job.report) {
          onComplete(job.report);
        }
      } else if (job.status === "failed") {
        completedRef.current = true;
        if (intervalRef.current) clearInterval(intervalRef.current);
        onError(job.error || "Cleaning failed");
      }
    } catch {
      // Network error - keep polling
    }
  }, [datasetId, jobId, onComplete, onError]);

  useEffect(() => {
    // Handle synchronous completion (jobId = "sync")
    if (jobId === "sync") {
      completedRef.current = true;
      return;
    }

    poll(); // Initial fetch
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId, poll]);

  const stepLabel = currentStep
    ? STEP_LABELS[currentStep] || `Processing ${currentStep}...`
    : "Preparing...";

  return (
    <div className="space-y-4 rounded-lg border p-6">
      <div className="flex items-center gap-3">
        {status === "completed" ? (
          <CheckCircle2 className="h-6 w-6 text-emerald-400" />
        ) : status === "failed" ? (
          <XCircle className="h-6 w-6 text-red-400" />
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        )}
        <div>
          <p className="font-medium">
            {status === "completed"
              ? "Cleaning Complete"
              : status === "failed"
                ? "Cleaning Failed"
                : "Cleaning in Progress..."}
          </p>
          <p className="text-sm text-muted-foreground">{stepLabel}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status === "failed"
                ? "bg-red-500"
                : status === "completed"
                  ? "bg-emerald-500"
                  : "bg-primary"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
