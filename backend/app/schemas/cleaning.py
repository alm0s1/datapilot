"""Cleaning system schemas - actions, suggestions, plans, reports."""

from typing import Any, Dict, List, Literal, Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums (as Literal unions for JSON-friendly serialization)
# ---------------------------------------------------------------------------

CleaningActionType = Literal[
    "column_name_normalization",
    "text_normalization",
    "null_representation",
    "smart_duplicates",
    "outlier_detection",
    "date_correction",
    "categorical_normalization",
    "missing_value_imputation",
    "unit_normalization",
    "format_validation",
    "impossible_value_detection",
]

OutlierMethod = Literal["iqr", "zscore", "isolation_forest", "mad", "lof"]
OutlierAction = Literal["flag", "cap", "remove"]
ImputationMethod = Literal["mean", "median", "mode", "interpolation", "knn", "missforest", "name_based_gender"]
DedupMethod = Literal["exact", "levenshtein", "blocking"]
CleaningJobStatus = Literal["queued", "running", "completed", "failed"]

SuggestionSeverity = Literal["critical", "warning", "info"]
SuggestionCategory = Literal[
    "data_quality", "formatting", "validation", "imputation", "statistical",
]


# ---------------------------------------------------------------------------
# Core models
# ---------------------------------------------------------------------------

class CleaningAction(BaseModel):
    """Single cleaning operation to apply."""

    action_type: CleaningActionType
    target_column: Optional[str] = None  # None = dataset-wide operation
    parameters: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class CleaningSuggestion(BaseModel):
    """A suggested cleaning action with context for user review."""

    action: CleaningAction
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str
    estimated_rows_affected: int = 0
    before_sample: List[Any] = Field(default_factory=list)
    after_sample: List[Any] = Field(default_factory=list)
    # Tier 1 enrichment fields (all optional for backward compatibility)
    severity: Optional[str] = "info"
    category: Optional[str] = None
    impact_pct: Optional[float] = None
    is_destructive: bool = False
    evidence: Optional[Dict[str, Any]] = None
    semantic_type: Optional[str] = None
    # Tier 2: research-grade explainability fields
    repair_confidence: Optional[float] = None
    detector_agreement: Optional[float] = None
    detectors_used: Optional[List[str]] = None
    detection_rationale: Optional[str] = None
    repair_rationale: Optional[str] = None
    alternative_strategies: Optional[List[Dict[str, Any]]] = None
    risk_notes: Optional[List[str]] = None
    # AI enhancement fields
    ai_enhanced: Optional[bool] = None
    ai_reason: Optional[str] = None


class CleaningPlan(BaseModel):
    """List of approved cleaning actions to execute."""

    actions: List[CleaningAction]


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

class ActionReport(BaseModel):
    """Result of executing a single cleaning action."""

    action_type: str
    target_column: Optional[str] = None
    success: bool = True
    rows_affected: int = 0
    cells_modified: int = 0
    before_sample: List[Any] = Field(default_factory=list)
    after_sample: List[Any] = Field(default_factory=list)
    execution_time_ms: int = 0
    error_message: Optional[str] = None


class DimensionScore(BaseModel):
    """Score breakdown for a single quality dimension."""

    score: float = Field(ge=0, le=100)
    weight: float = Field(ge=0, le=100)
    weighted_score: float


class QualityScoreBreakdown(BaseModel):
    """Detailed quality score with per-dimension breakdown."""

    overall_score: int = Field(ge=0, le=100)
    dimensions: Dict[str, DimensionScore]
    method: str  # "profiling_enhanced" or "dataframe_only"


class CleaningReport(BaseModel):
    """Full report for a cleaning pipeline execution."""

    actions: List[ActionReport] = Field(default_factory=list)
    total_rows_before: int = 0
    total_rows_after: int = 0
    total_cells_modified: int = 0
    quality_score_before: int = 0  # 0-100
    quality_score_after: int = 0   # 0-100
    quality_breakdown_before: Optional[QualityScoreBreakdown] = None
    quality_breakdown_after: Optional[QualityScoreBreakdown] = None
    execution_time_seconds: float = 0.0
    impact_summary: Optional[Dict[str, Any]] = None
    # Post-cleaning validation
    validation_result: Optional[Dict[str, Any]] = None
    distribution_shifts: Optional[List[Dict[str, Any]]] = None
    audit_trail: Optional[List[Dict[str, Any]]] = None


# ---------------------------------------------------------------------------
# Job tracking
# ---------------------------------------------------------------------------

class CleaningJobResponse(BaseModel):
    """Response for async cleaning job status polling."""

    job_id: str
    dataset_id: str
    status: CleaningJobStatus = "queued"
    progress_pct: int = Field(default=0, ge=0, le=100)
    current_step: Optional[str] = None
    report: Optional[CleaningReport] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class SuggestRequest(BaseModel):
    """Request body for generating cleaning suggestions."""

    use_ai: bool = False


class CleanWithPlanRequest(BaseModel):
    """Request body for executing a cleaning plan."""

    plan: CleaningPlan
