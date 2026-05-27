export interface Dataset {
  id: string;
  name: string;
  description?: string;
  original_filename: string;
  file_type: string;
  file_size_bytes?: number;
  table_name?: string;
  connection_id?: string;
  row_count?: number;
  column_count?: number;
  upload_status: DatasetStatus;
  error_message?: string;
  cleaning_config?: CleaningConfig;
  profiling_results?: ProfilingResults;
  analysis_results?: AnalysisResults;
  cleaning_report?: CleaningReport;
  cleaning_job_id?: string;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export type DatasetStatus =
  | "uploading"
  | "parsing"
  | "cleaning"
  | "profiling"
  | "storing"
  | "completed"
  | "failed";

export interface CleaningConfig {
  trim_whitespace: boolean;
  normalize_types: boolean;
  handle_nulls: "none" | "drop_rows" | "fill_empty" | "forward_fill";
  remove_duplicates: boolean;
}

// ---------------------------------------------------------------------------
// Enhanced profiler types
// ---------------------------------------------------------------------------

export interface ColumnNameIssues {
  has_spaces: boolean;
  has_special_chars: boolean;
  starts_with_digit: boolean;
  suggested: string;
}

export interface PatternDetection {
  email_count: number;
  phone_count: number;
  url_count: number;
  date_formats: string[];
  unit_suffixes: string[];
}

export interface OutlierInfo {
  iqr_count: number;
  zscore_count: number;
}

export interface ColumnProfile {
  dtype: string;
  null_count: number;
  null_pct: number;
  unique_count: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;
  top_values?: { value: string; count: number }[];
  avg_length?: number;
  range_days?: number;
  // Enhanced profiler fields
  potential_null_strings?: Record<string, number>;
  column_name_issues?: ColumnNameIssues;
  outliers?: OutlierInfo;
  case_variations?: string[][];
  similar_values?: string[][];
  patterns?: PatternDetection;
}

export interface ProfilingResults {
  columns: Record<string, ColumnProfile>;
  total_rows: number;
  total_columns: number;
  memory_mb: number;
  duplicates_count: number;
}

export interface ChartSuggestion {
  chart_type: string;
  x_column: string;
  y_column?: string;
  reasoning: string;
}

export interface KeyMetric {
  name: string;
  value: string;
}

export interface AnalysisResults {
  insights: string[];
  suggested_charts: ChartSuggestion[];
  key_metrics: KeyMetric[];
}

export interface PreviewColumn {
  name: string;
  detected_type: string;
}

export interface PreviewResponse {
  columns: PreviewColumn[];
  rows: unknown[][];
  total_rows: number;
  rows_removed?: number;
}

export interface DatasetListItem {
  id: string;
  name: string;
  original_filename: string;
  file_type: string;
  file_size_bytes?: number;
  row_count?: number;
  column_count?: number;
  upload_status: DatasetStatus;
  connection_id?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Advanced Cleaning System types
// ---------------------------------------------------------------------------

export type CleaningActionType =
  | "column_name_normalization"
  | "text_normalization"
  | "null_representation"
  | "smart_duplicates"
  | "outlier_detection"
  | "date_correction"
  | "categorical_normalization"
  | "missing_value_imputation"
  | "unit_normalization"
  | "format_validation"
  | "impossible_value_detection";

export type CleaningJobStatus = "queued" | "running" | "completed" | "failed";

export type SuggestionSeverity = "critical" | "warning" | "info";
export type SuggestionCategory =
  | "data_quality"
  | "formatting"
  | "validation"
  | "imputation"
  | "statistical";

export interface CleaningAction {
  action_type: CleaningActionType;
  target_column?: string;
  parameters: Record<string, unknown>;
  enabled: boolean;
}

export interface CleaningSuggestion {
  action: CleaningAction;
  confidence: number;
  reason: string;
  estimated_rows_affected: number;
  before_sample: unknown[];
  after_sample: unknown[];
  severity?: SuggestionSeverity;
  category?: SuggestionCategory;
  impact_pct?: number;
  is_destructive?: boolean;
  evidence?: Record<string, unknown>;
  semantic_type?: string;
  // Research-grade explainability fields
  repair_confidence?: number;
  detector_agreement?: number;
  detectors_used?: string[];
  detection_rationale?: string;
  repair_rationale?: string;
  alternative_strategies?: Array<{ method: string; reason: string }>;
  risk_notes?: string[];
  // AI enhancement fields
  ai_enhanced?: boolean;
  ai_reason?: string;
}

export interface CleaningPlan {
  actions: CleaningAction[];
}

export interface ActionReport {
  action_type: string;
  target_column?: string;
  success: boolean;
  rows_affected: number;
  cells_modified: number;
  before_sample: unknown[];
  after_sample: unknown[];
  execution_time_ms: number;
  error_message?: string;
}

export interface DimensionScore {
  score: number;
  weight: number;
  weighted_score: number;
}

export interface QualityScoreBreakdown {
  overall_score: number;
  dimensions: Record<string, DimensionScore>;
  method: "profiling_enhanced" | "dataframe_only";
}

export interface CleaningReport {
  actions: ActionReport[];
  total_rows_before: number;
  total_rows_after: number;
  total_cells_modified: number;
  quality_score_before: number;
  quality_score_after: number;
  quality_breakdown_before?: QualityScoreBreakdown;
  quality_breakdown_after?: QualityScoreBreakdown;
  execution_time_seconds: number;
  impact_summary?: {
    critical_issues_fixed: number;
    warning_issues_fixed: number;
    destructive_actions_applied: number;
    max_rows_affected_pct: number;
  };
  // Post-cleaning validation
  validation_result?: {
    passed: boolean;
    warnings: string[];
    quality_delta: {
      score_before: number;
      score_after: number;
      overall_delta: number;
    };
    distribution_shifts: Array<{
      column: string;
      significant: boolean;
      ks_statistic: number;
      p_value: number;
      mean_before: number;
      mean_after: number;
    }>;
    row_preservation: {
      rows_before: number;
      rows_after: number;
      rows_removed: number;
      removal_pct: number;
    };
  };
  distribution_shifts?: Array<{
    column: string;
    significant: boolean;
    ks_statistic: number;
  }>;
  audit_trail?: Array<Record<string, unknown>>;
}

export interface CleaningJobResponse {
  job_id: string;
  dataset_id: string;
  status: CleaningJobStatus;
  progress_pct: number;
  current_step?: string;
  report?: CleaningReport;
  error?: string;
}
