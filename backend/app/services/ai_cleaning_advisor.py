"""AI-powered cleaning advisor: uses OpenAI or Ollama to intelligently
analyze data profiles and enhance cleaning suggestions with smart reasoning."""

import json
import logging
from typing import Any, Dict, List, Optional

from app.config import settings

logger = logging.getLogger(__name__)


def _build_profile_summary(profiling_results: Dict[str, Any]) -> str:
    """Build a concise text summary of profiling results for the AI prompt."""
    lines = []
    total_rows = profiling_results.get("total_rows", 0)
    total_cols = profiling_results.get("total_columns", 0)
    dup_count = profiling_results.get("duplicates_count", 0)

    lines.append(f"Dataset: {total_rows} rows, {total_cols} columns, {dup_count} duplicate rows")
    lines.append("")

    for col_name, prof in profiling_results.get("columns", {}).items():
        dtype = prof.get("dtype", "unknown")
        null_pct = prof.get("null_pct", 0)
        unique = prof.get("unique_count", 0)
        sem_type = prof.get("semantic_type", "")

        col_line = f"- {col_name} (type={dtype}, null={null_pct}%, unique={unique}"
        if sem_type:
            col_line += f", semantic={sem_type}"

        # Add numeric stats
        if prof.get("mean") is not None:
            col_line += f", mean={prof['mean']:.2f}, std={prof.get('std', 0):.2f}"
            skew = prof.get("skewness")
            if skew is not None:
                col_line += f", skew={skew:.2f}"

        # Add outlier info
        outliers = prof.get("outliers", {})
        iqr_count = outliers.get("iqr_count", 0)
        if iqr_count > 0:
            col_line += f", outliers={iqr_count}"

        # Add normality
        norm = prof.get("normality_test", {})
        if norm.get("is_normal") is not None:
            col_line += f", normal={'yes' if norm['is_normal'] else 'no'}"

        # Add impossible values
        impossible = prof.get("impossible_values", {})
        imp_count = impossible.get("count", 0)
        if imp_count > 0:
            col_line += f", impossible_values={imp_count}"

        # Add top values for categorical
        top_vals = prof.get("top_values", [])
        if top_vals:
            top_3 = [f"'{v['value']}'({v['count']})" for v in top_vals[:3]]
            col_line += f", top_values=[{', '.join(top_3)}]"

        col_line += ")"
        lines.append(col_line)

    return "\n".join(lines)


def _build_sample_text(df_sample) -> str:
    """Convert a small DataFrame sample to text for the prompt."""
    return df_sample.head(10).to_string(index=False, max_colwidth=30)


def _build_existing_suggestions_text(suggestions: List[Any]) -> str:
    """Summarize existing rule-based suggestions for AI context."""
    if not suggestions:
        return "No rule-based suggestions generated."

    lines = []
    for i, s in enumerate(suggestions, 1):
        action = s.action.action_type
        col = s.action.target_column or "dataset-wide"
        method = s.action.parameters.get("method", "")
        conf = s.confidence
        reason_short = s.reason[:120]
        lines.append(
            f"{i}. [{action}] column='{col}' method={method} "
            f"confidence={conf:.2f} -- {reason_short}"
        )
    return "\n".join(lines)


SYSTEM_PROMPT = """You are a senior data scientist specializing in data quality and data cleaning.
You analyze dataset profiles and provide expert cleaning recommendations.

IMPORTANT RULES:
1. Return ONLY valid JSON, no markdown, no explanation outside JSON.
2. Be specific about column names and methods.
3. For confidence_adjustment, use values between -0.3 and +0.3.
4. Only suggest actions that are genuinely needed based on the data.
5. action_type must be one of: column_name_normalization, text_normalization, null_representation, smart_duplicates, outlier_detection, date_correction, categorical_normalization, missing_value_imputation, unit_normalization, format_validation, impossible_value_detection
6. method for outlier_detection: iqr, zscore, mad, lof, isolation_forest
7. method for missing_value_imputation: mean, median, mode, knn, missforest, name_based_gender
8. For new suggestions, provide complete information."""

USER_PROMPT_TEMPLATE = """Analyze this dataset and enhance the cleaning suggestions:

## Dataset Profile
{profile_summary}

## Data Sample (first 10 rows)
{sample_text}

## Current Rule-Based Suggestions
{suggestions_text}

## Your Task
Review the data profile and current suggestions. Return a JSON object with:

1. "enhanced_suggestions": Array of improvements to EXISTING suggestions. Each item:
   - "index": (int) 0-based index of the suggestion to enhance
   - "confidence_adjustment": (float) how much to adjust confidence (-0.3 to +0.3)
   - "ai_reason": (string) your expert reasoning about this issue
   - "better_method": (string or null) if you recommend a different method
   - "ai_risk_notes": (array of strings) any risks or caveats

2. "new_suggestions": Array of NEW cleaning issues the rules missed. Each item:
   - "action_type": (string) the cleaning action type
   - "target_column": (string or null) column name or null for dataset-wide
   - "method": (string) recommended method
   - "confidence": (float 0-1) your confidence
   - "reason": (string) explanation of the issue
   - "parameters": (object) any extra parameters

3. "data_quality_summary": (string) 2-3 sentence overall assessment

Return ONLY the JSON object, nothing else."""


async def ai_enhance_suggestions(
    profiling_results: Dict[str, Any],
    df_sample,
    rule_suggestions: List[Any],
) -> Optional[Dict[str, Any]]:
    """Call OpenAI/Ollama to enhance cleaning suggestions with AI reasoning.

    Returns parsed AI response dict, or None if AI is unavailable/fails.
    """
    profile_summary = _build_profile_summary(profiling_results)
    sample_text = _build_sample_text(df_sample)
    suggestions_text = _build_existing_suggestions_text(rule_suggestions)

    user_prompt = USER_PROMPT_TEMPLATE.format(
        profile_summary=profile_summary,
        sample_text=sample_text,
        suggestions_text=suggestions_text,
    )

    try:
        if settings.AI_PROVIDER == "openai" and settings.OPENAI_API_KEY:
            return await _call_openai(user_prompt)
        elif settings.AI_PROVIDER == "ollama":
            return await _call_ollama(user_prompt)
        else:
            logger.warning("AI provider not configured, skipping AI enhancement")
            return None
    except Exception as e:
        logger.error(f"AI cleaning advisor failed: {e}")
        return None


async def _call_openai(user_prompt: str) -> Optional[Dict[str, Any]]:
    """Call OpenAI API for cleaning advice."""
    import openai

    client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=2000,
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content or ""
    return _parse_ai_response(raw)


async def _call_ollama(user_prompt: str) -> Optional[Dict[str, Any]]:
    """Call Ollama API for cleaning advice."""
    import httpx

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.OLLAMA_BASE_URL}/api/generate",
            json={
                "model": settings.OLLAMA_MODEL,
                "prompt": f"{SYSTEM_PROMPT}\n\n{user_prompt}",
                "stream": False,
                "format": "json",
            },
            timeout=90,
        )
        data = resp.json()
        raw = data.get("response", "")
        return _parse_ai_response(raw)


def _parse_ai_response(raw: str) -> Optional[Dict[str, Any]]:
    """Parse AI response into structured dict, handling common JSON issues."""
    if not raw.strip():
        return None

    # Try direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Try extracting JSON from markdown code block
    import re
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Try finding first { to last }
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            pass

    logger.warning(f"Failed to parse AI response: {raw[:200]}")
    return None
