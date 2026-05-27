from typing import Optional, Any, Dict, List
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class CleaningConfig(BaseModel):
    trim_whitespace: bool = True
    normalize_types: bool = True
    handle_nulls: str = "none"  # none, drop_rows, fill_empty, forward_fill
    remove_duplicates: bool = True


class ColumnProfile(BaseModel):
    dtype: str
    null_count: int = 0
    null_pct: float = 0.0
    unique_count: int = 0
    min: Optional[Any] = None
    max: Optional[Any] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    std: Optional[float] = None
    top_values: Optional[List[Dict[str, Any]]] = None
    avg_length: Optional[float] = None


class ProfilingResults(BaseModel):
    columns: Dict[str, ColumnProfile]
    total_rows: int
    total_columns: int
    memory_mb: float
    duplicates_count: int


class ChartSuggestion(BaseModel):
    chart_type: str
    x_column: str
    y_column: Optional[str] = None
    reasoning: str


class KeyMetric(BaseModel):
    name: str
    value: str


class AnalysisResults(BaseModel):
    insights: List[str]
    suggested_charts: List[ChartSuggestion]
    key_metrics: List[KeyMetric]


class PreviewColumn(BaseModel):
    name: str
    detected_type: str


class PreviewResponse(BaseModel):
    columns: List[PreviewColumn]
    rows: List[List[Any]]
    total_rows: int


class DatasetCreate(BaseModel):
    name: str
    description: Optional[str] = None


class DatasetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class DatasetResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    original_filename: str
    file_type: str
    file_size_bytes: Optional[int] = None
    table_name: Optional[str] = None
    connection_id: Optional[UUID] = None
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    upload_status: str
    error_message: Optional[str] = None
    cleaning_config: Optional[Dict[str, Any]] = None
    profiling_results: Optional[Dict[str, Any]] = None
    analysis_results: Optional[Dict[str, Any]] = None
    cleaning_report: Optional[Dict[str, Any]] = None
    cleaning_job_id: Optional[str] = None
    created_by_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DatasetListItem(BaseModel):
    id: UUID
    name: str
    original_filename: str
    file_type: str
    file_size_bytes: Optional[int] = None
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    upload_status: str
    connection_id: Optional[UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CleanRequest(BaseModel):
    cleaning_config: CleaningConfig


class AnalyzeRequest(BaseModel):
    use_ai: bool = False
