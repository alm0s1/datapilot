"""Data analyzer service - generates insights and chart suggestions."""

from typing import Any, Dict, List, Optional
import pandas as pd
import numpy as np

from app.config import settings
from app.utils.json_serializer import safe_numeric


def generate_rule_based_insights(profiling: Dict[str, Any], df: Optional[pd.DataFrame] = None) -> Dict[str, Any]:
    """Generate rule-based insights from profiling results."""
    insights = []
    suggested_charts = []
    key_metrics = []

    columns = profiling.get("columns", {})
    total_rows = profiling.get("total_rows", 0)
    total_columns = profiling.get("total_columns", 0)
    duplicates = profiling.get("duplicates_count", 0)

    # Key metrics
    key_metrics.append({"name": "Total Rows", "value": str(total_rows)})
    key_metrics.append({"name": "Total Columns", "value": str(total_columns)})

    if duplicates > 0:
        insights.append(f"Found {duplicates} duplicate rows ({round(duplicates / total_rows * 100, 1)}% of data).")

    # Analyze columns
    numeric_cols = []
    categorical_cols = []
    date_cols = []

    for col_name, col_prof in columns.items():
        dtype = col_prof.get("dtype", "")
        null_pct = col_prof.get("null_pct", 0)
        unique_count = col_prof.get("unique_count", 0)

        # High null warning
        if null_pct > 20:
            insights.append(f"Column '{col_name}' has {null_pct}% missing values - consider imputation or removal.")

        # Classify columns
        if "int" in dtype or "float" in dtype:
            numeric_cols.append(col_name)
            if col_prof.get("min") is not None and col_prof.get("max") is not None:
                key_metrics.append({
                    "name": f"{col_name} range",
                    "value": f"{col_prof['min']} - {col_prof['max']}"
                })
        elif "datetime" in dtype:
            date_cols.append(col_name)
        else:
            if unique_count > 0 and total_rows > 0:
                cardinality = unique_count / total_rows
                if cardinality > 0.9:
                    insights.append(f"Column '{col_name}' has very high cardinality ({unique_count} unique values) - likely an identifier.")
                elif cardinality < 0.05 and unique_count <= 20:
                    categorical_cols.append(col_name)
                else:
                    categorical_cols.append(col_name)

    # Correlation detection
    if df is not None and len(numeric_cols) >= 2:
        try:
            corr_matrix = df[numeric_cols].corr()
            for i, col1 in enumerate(numeric_cols):
                for col2 in numeric_cols[i + 1:]:
                    corr_val = corr_matrix.loc[col1, col2]
                    safe_corr = safe_numeric(corr_val)
                    if safe_corr is not None and abs(safe_corr) > 0.7:
                        direction = "positive" if safe_corr > 0 else "negative"
                        insights.append(
                            f"Strong {direction} correlation ({round(safe_corr, 2)}) between '{col1}' and '{col2}'."
                        )
        except Exception:
            pass

    # Chart suggestions
    if date_cols and numeric_cols:
        for num_col in numeric_cols[:3]:
            suggested_charts.append({
                "chart_type": "line",
                "x_column": date_cols[0],
                "y_column": num_col,
                "reasoning": f"Time series trend of {num_col} over {date_cols[0]}",
            })

    if categorical_cols and numeric_cols:
        for cat_col in categorical_cols[:2]:
            for num_col in numeric_cols[:2]:
                suggested_charts.append({
                    "chart_type": "bar",
                    "x_column": cat_col,
                    "y_column": num_col,
                    "reasoning": f"Compare {num_col} across {cat_col} categories",
                })

    if len(numeric_cols) >= 2:
        suggested_charts.append({
            "chart_type": "scatter",
            "x_column": numeric_cols[0],
            "y_column": numeric_cols[1],
            "reasoning": f"Explore relationship between {numeric_cols[0]} and {numeric_cols[1]}",
        })

    if categorical_cols:
        col = categorical_cols[0]
        col_prof = columns.get(col, {})
        if col_prof.get("unique_count", 0) <= 10:
            suggested_charts.append({
                "chart_type": "pie",
                "x_column": col,
                "y_column": None,
                "reasoning": f"Distribution of {col} ({col_prof.get('unique_count', 0)} categories)",
            })

    if not suggested_charts and numeric_cols:
        suggested_charts.append({
            "chart_type": "bar",
            "x_column": numeric_cols[0],
            "y_column": numeric_cols[1] if len(numeric_cols) > 1 else None,
            "reasoning": "Basic bar chart of numeric data",
        })

    return {
        "insights": insights,
        "suggested_charts": suggested_charts,
        "key_metrics": key_metrics,
    }


async def ai_analyze(profiling: Dict[str, Any]) -> Dict[str, Any]:
    """Generate AI-powered insights using OpenAI or Ollama."""
    columns_summary = []
    for col_name, col_prof in profiling.get("columns", {}).items():
        summary = f"- {col_name} ({col_prof.get('dtype', 'unknown')}): {col_prof.get('null_pct', 0)}% nulls, {col_prof.get('unique_count', 0)} unique"
        columns_summary.append(summary)

    prompt = f"""Analyze this dataset profile and provide insights:

Dataset: {profiling.get('total_rows', 0)} rows, {profiling.get('total_columns', 0)} columns
Duplicates: {profiling.get('duplicates_count', 0)}

Columns:
{chr(10).join(columns_summary)}

Provide:
1. 3-5 key insights about the data quality and patterns
2. 2-3 suggested analyses or visualizations
3. Any data quality concerns

Be concise and specific."""

    try:
        if settings.AI_PROVIDER == "openai" and settings.OPENAI_API_KEY:
            import openai
            client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
            response = client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "You are a data analyst assistant. Provide concise, actionable insights."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=500,
            )
            ai_text = response.choices[0].message.content or ""
            return {
                "insights": [line.strip() for line in ai_text.split("\n") if line.strip() and not line.strip().startswith("#")],
                "suggested_charts": [],
                "key_metrics": [],
            }
        elif settings.AI_PROVIDER == "ollama":
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{settings.OLLAMA_BASE_URL}/api/generate",
                    json={"model": settings.OLLAMA_MODEL, "prompt": prompt, "stream": False},
                    timeout=60,
                )
                data = resp.json()
                ai_text = data.get("response", "")
                return {
                    "insights": [line.strip() for line in ai_text.split("\n") if line.strip() and not line.strip().startswith("#")],
                    "suggested_charts": [],
                    "key_metrics": [],
                }
    except Exception as e:
        return {
            "insights": [f"AI analysis unavailable: {str(e)}"],
            "suggested_charts": [],
            "key_metrics": [],
        }

    return {
        "insights": ["AI analysis not configured. Set OPENAI_API_KEY or configure Ollama."],
        "suggested_charts": [],
        "key_metrics": [],
    }
