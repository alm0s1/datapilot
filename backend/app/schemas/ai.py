from typing import Optional, List, Any, Dict
from pydantic import BaseModel


class NlToSqlRequest(BaseModel):
    question: str
    connection_id: str


class NlToSqlResponse(BaseModel):
    sql: str
    explanation: str
    confidence: float


class InsightRequest(BaseModel):
    query_id: Optional[str] = None
    data: Optional[List[Dict[str, Any]]] = None
    columns: Optional[List[str]] = None


class InsightResponse(BaseModel):
    insights: List[str]


class VisualizationSuggestionRequest(BaseModel):
    query_id: Optional[str] = None
    columns: Optional[List[Dict[str, str]]] = None
    sample_data: Optional[List[List[Any]]] = None


class VisualizationSuggestionResponse(BaseModel):
    chart_type: str
    reason: str
    config: Dict[str, Any]


class AnomalyDetectionRequest(BaseModel):
    query_id: str
    metric_column: str


class AnomalyItem(BaseModel):
    index: int
    value: float
    expected_range: List[float]


class AnomalyDetectionResponse(BaseModel):
    anomalies: List[AnomalyItem]
