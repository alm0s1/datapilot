"""Cleaning suggestion engine - analyzes profiling results and generates
intelligent cleaning recommendations with adaptive confidence scores,
severity classification, impact assessment, and evidence.

The engine reads the enhanced profiler output and proposes CleaningSuggestion
objects for user review (suggest-then-apply workflow).
"""

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.schemas.cleaning import CleaningAction, CleaningSuggestion
from app.services.confidence_model import (
    ConfidenceResult,
    DetectorSignal,
    UnifiedConfidenceModel,
)
from app.services.decision_engine import DecisionEngine


# ---------------------------------------------------------------------------
# Category mapping (action_type -> SuggestionCategory)
# ---------------------------------------------------------------------------

_CATEGORY_MAP: Dict[str, str] = {
    "column_name_normalization": "formatting",
    "text_normalization": "formatting",
    "null_representation": "data_quality",
    "smart_duplicates": "data_quality",
    "outlier_detection": "statistical",
    "date_correction": "formatting",
    "categorical_normalization": "formatting",
    "missing_value_imputation": "data_quality",
    "unit_normalization": "formatting",
    "format_validation": "validation",
    "impossible_value_detection": "data_quality",
}

# Actions that remove rows are destructive
_DESTRUCTIVE_ACTIONS = {"smart_duplicates", "impossible_value_detection"}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_suggestions(
    profiling_results: Dict[str, Any],
    df: pd.DataFrame,
) -> List[CleaningSuggestion]:
    """Generate cleaning suggestions from profiling results and a data sample.

    Args:
        profiling_results: Output from profile_dataframe().
        df: The actual DataFrame (used for before/after samples).

    Returns:
        List of CleaningSuggestion sorted by severity (critical first),
        then confidence (highest first).
    """
    suggestions: List[CleaningSuggestion] = []
    columns_profile = profiling_results.get("columns", {})
    total_rows = profiling_results.get("total_rows", len(df))
    duplicates_count = profiling_results.get("duplicates_count", 0)

    # Initialize research-grade modules
    confidence_model = UnifiedConfidenceModel()
    decision_engine = DecisionEngine()

    # Compute dataset-wide stats for decision engine
    n_numeric_cols = sum(
        1
        for p in columns_profile.values()
        if p.get("dtype", "").startswith(("int", "float"))
    )
    df_stats = {
        "total_rows": total_rows,
        "n_numeric_cols": n_numeric_cols,
    }

    # Build cross-column hint lookup for name-gender pairs
    cross_hints = profiling_results.get("cross_column_hints", [])
    name_gender_map: Dict[str, str] = {}  # gender_col -> name_col
    for hint in cross_hints:
        if hint.get("hint_type") == "name_gender_pair":
            name_gender_map[hint["gender_col"]] = hint["name_col"]

    # -------------------------------------------------------------------
    # Dataset-wide suggestions
    # -------------------------------------------------------------------

    # Column name normalization
    name_issues = _check_column_name_issues(columns_profile)
    if name_issues:
        has_mixed = any(
            columns_profile.get(c, {}).get("column_name_issues", {}).get("has_spaces")
            and columns_profile.get(c, {}).get("column_name_issues", {}).get("has_special_chars")
            for c in name_issues
        )
        confidence = min(0.95, 0.90 + (0.05 if has_mixed else 0.0))
        suggestions.append(_build_suggestion(
            action_type="column_name_normalization",
            parameters={},
            confidence=confidence,
            reason=f"Found {len(name_issues)} column(s) with naming issues "
                   f"(spaces, special characters, or leading digits): "
                   f"{', '.join(name_issues[:5])}",
            estimated_rows_affected=0,
            total_rows=total_rows,
            before_sample=[str(c) for c in list(df.columns)[:5]],
            after_sample=[
                columns_profile.get(c, {}).get("column_name_issues", {}).get("suggested", c)
                for c in list(df.columns)[:5]
            ],
            evidence={"columns_affected": name_issues[:10]},
        ))

    # Exact duplicate removal
    if duplicates_count > 0:
        dup_pct = round(duplicates_count / total_rows * 100, 1) if total_rows > 0 else 0
        confidence = min(0.95, 0.80 + (dup_pct / 100) * 0.3)
        suggestions.append(_build_suggestion(
            action_type="smart_duplicates",
            parameters={"method": "exact"},
            confidence=confidence,
            reason=f"Found {duplicates_count} exact duplicate rows ({dup_pct}% of data).",
            estimated_rows_affected=duplicates_count,
            total_rows=total_rows,
            before_sample=[f"{total_rows} rows"],
            after_sample=[f"{total_rows - duplicates_count} rows"],
            evidence={"duplicate_count": duplicates_count, "duplicate_pct": dup_pct},
        ))

    # -------------------------------------------------------------------
    # Per-column suggestions
    # -------------------------------------------------------------------

    for col_name, profile in columns_profile.items():
        dtype = profile.get("dtype", "")
        null_pct = profile.get("null_pct", 0)
        unique_count = profile.get("unique_count", 0)
        semantic_type = profile.get("semantic_type", "")
        is_string_col = dtype in ("object", "string", "str", "StringDtype")

        # --- Null representation detection ---
        null_strings = profile.get("potential_null_strings", {})
        if null_strings:
            total_null_like = sum(null_strings.values())
            top_values = sorted(null_strings.items(), key=lambda x: -x[1])
            detail = ", ".join(f"'{k}': {v}" for k, v in top_values[:5])
            before = _get_column_sample(df, col_name, 5)

            null_ratio = total_null_like / total_rows if total_rows > 0 else 0
            confidence = min(0.95, 0.80 + null_ratio * 0.3)

            suggestions.append(_build_suggestion(
                action_type="null_representation",
                target_column=col_name,
                parameters={"null_values": list(null_strings.keys())},
                confidence=confidence,
                reason=f"Detected {total_null_like} null-like string values in "
                       f"'{col_name}' ({detail}). These should be converted to "
                       f"proper null values.",
                estimated_rows_affected=total_null_like,
                total_rows=total_rows,
                before_sample=before,
                after_sample=[None if str(v).strip() in null_strings else v for v in before],
                evidence={"null_strings_found": dict(top_values[:5]),
                          "total_null_like": total_null_like},
                sem_type=semantic_type,
            ))

        # --- Text normalization (whitespace issues) ---
        if is_string_col:
            avg_length = profile.get("avg_length", 0)
            if avg_length and avg_length > 0:
                sample = df[col_name].dropna().head(100) if col_name in df.columns else pd.Series()
                if len(sample) > 0:
                    ws_mask = sample.astype(str).str.contains(r"^\s+|\s+$|\s{2,}")
                    ws_count = int(ws_mask.sum())
                    if ws_count > 0:
                        ws_ratio = ws_count / len(sample)
                        confidence = min(0.90, 0.70 + ws_ratio * 0.4)
                        before = _get_column_sample(df, col_name, 5)
                        suggestions.append(_build_suggestion(
                            action_type="text_normalization",
                            target_column=col_name,
                            parameters={"strip": True, "collapse_whitespace": True},
                            confidence=confidence,
                            reason=f"Column '{col_name}' contains values with leading/trailing "
                                   f"whitespace or multiple consecutive spaces.",
                            estimated_rows_affected=int(len(sample) * ws_ratio),
                            total_rows=total_rows,
                            before_sample=before,
                            after_sample=[str(v).strip() if isinstance(v, str) else v for v in before],
                            evidence={"whitespace_ratio": round(ws_ratio, 3),
                                      "sample_with_issues": ws_count},
                            sem_type=semantic_type,
                        ))

        # --- Case variations ---
        case_variations = profile.get("case_variations", [])
        if case_variations:
            groups_desc = "; ".join(
                f"({', '.join(repr(v) for v in group)})"
                for group in case_variations[:3]
            )
            before = _get_column_sample(df, col_name, 5)

            variation_count = sum(len(g) - 1 for g in case_variations)
            variation_ratio = variation_count / max(unique_count, 1)
            confidence = min(0.90, 0.75 + variation_ratio * 0.3)

            suggestions.append(_build_suggestion(
                action_type="categorical_normalization",
                target_column=col_name,
                parameters={"strategy": "case"},
                confidence=confidence,
                reason=f"Column '{col_name}' has {len(case_variations)} group(s) of values "
                       f"that differ only by case: {groups_desc}. "
                       f"These should be merged to a consistent form.",
                estimated_rows_affected=variation_count,
                total_rows=total_rows,
                before_sample=before,
                after_sample=before,
                evidence={"case_variation_groups": case_variations[:5],
                          "variation_ratio": round(variation_ratio, 3)},
                sem_type=semantic_type,
            ))

        # --- Similar values (fuzzy) ---
        similar_values = profile.get("similar_values", [])
        if similar_values:
            groups_desc = "; ".join(
                f"({', '.join(repr(v) for v in group)})"
                for group in similar_values[:3]
            )
            before = _get_column_sample(df, col_name, 5)

            total_similar = sum(len(g) - 1 for g in similar_values)
            cluster_density = total_similar / max(unique_count, 1)
            confidence = min(0.88, 0.55 + cluster_density * 0.4)

            suggestions.append(_build_suggestion(
                action_type="categorical_normalization",
                target_column=col_name,
                parameters={"strategy": "levenshtein", "threshold": 85},
                confidence=confidence,
                reason=f"Column '{col_name}' has {len(similar_values)} group(s) of similar "
                       f"but not identical values: {groups_desc}. "
                       f"These may be typos or inconsistent entries.",
                estimated_rows_affected=total_similar,
                total_rows=total_rows,
                before_sample=before,
                after_sample=before,
                evidence={"similar_groups": similar_values[:5],
                          "cluster_density": round(cluster_density, 3)},
                sem_type=semantic_type,
            ))

        # --- Outlier detection (numeric columns) ---
        outliers = profile.get("outliers", {})
        iqr_count = outliers.get("iqr_count", 0)
        zscore_count = outliers.get("zscore_count", 0)
        if iqr_count > 0:
            pct = round(iqr_count / total_rows * 100, 1) if total_rows > 0 else 0
            before = _get_column_sample(df, col_name, 5)

            # Use decision engine to select optimal method
            outlier_decision = decision_engine.select_outlier_method(profile)

            # Build detector signals for confidence model
            signals = [
                DetectorSignal("iqr", iqr_count > 0, 0.75),
            ]
            if zscore_count > 0:
                signals.append(DetectorSignal("zscore", True, 0.70))
            normality_info = profile.get("normality_test", {})
            if normality_info.get("is_normal") is False:
                signals.append(
                    DetectorSignal("normality_fail", True, 0.60, weight=0.5)
                )

            conf_result = confidence_model.compute(
                signals=signals,
                sample_size=total_rows,
                issue_type="outlier",
                repair_strategy="outlier_cap",
                impact_pct=pct,
            )

            # Build alternative strategies
            alt_strategies = []
            if outlier_decision.method != "mad":
                alt_strategies.append(
                    {"method": "mad", "reason": "Robust to skewness"}
                )
            if outlier_decision.method != "lof":
                alt_strategies.append(
                    {"method": "lof", "reason": "Detects local outliers"}
                )
            if outlier_decision.method != "isolation_forest":
                alt_strategies.append(
                    {"method": "isolation_forest", "reason": "Scalable for large data"}
                )

            # Risk notes
            risk_notes = []
            if pct > 10:
                risk_notes.append(
                    f"High outlier percentage ({pct}%) may indicate a natural distribution"
                )
            skew = profile.get("skewness")
            if skew is not None and abs(skew) > 2:
                risk_notes.append(
                    f"Skewness={skew:.1f} -- IQR may produce false positives"
                )

            suggestions.append(_build_suggestion(
                action_type="outlier_detection",
                target_column=col_name,
                parameters={
                    "method": outlier_decision.method,
                    "action": "cap",
                    **outlier_decision.params,
                },
                confidence=conf_result.detection_confidence,
                reason=f"Column '{col_name}' has {iqr_count} outliers ({pct}%) "
                       f"detected via IQR method (Z-score: {zscore_count}). "
                       f"Recommended method: {outlier_decision.method} "
                       f"({outlier_decision.rationale}).",
                estimated_rows_affected=iqr_count,
                total_rows=total_rows,
                before_sample=before,
                after_sample=before,
                evidence={
                    "iqr_count": iqr_count,
                    "zscore_count": zscore_count,
                    "outlier_pct": pct,
                    "skewness": profile.get("skewness"),
                    "iqr_zscore_agree": iqr_count > 0 and zscore_count > 0,
                    "selected_method": outlier_decision.method,
                },
                sem_type=semantic_type,
                repair_confidence=conf_result.repair_confidence,
                detector_agreement=conf_result.agreement_score,
                detectors_used=conf_result.detectors_used,
                detection_rationale=conf_result.rationale,
                repair_rationale=outlier_decision.rationale,
                alternative_strategies=alt_strategies,
                risk_notes=risk_notes if risk_notes else None,
            ))

        # --- Missing value imputation ---
        # For gender columns with a name column, allow higher null_pct (up to 80%)
        # since name-based inference is reliable regardless of missingness rate
        available_name_col = name_gender_map.get(col_name)
        max_null_pct = 80 if (semantic_type == "gender" and available_name_col) else 30
        if null_pct > 0 and null_pct < max_null_pct:
            null_count = profile.get("null_count", 0)
            is_numeric = "int" in dtype or "float" in dtype

            # Skip imputation for high-cardinality / identifier columns
            uniqueness_ratio = unique_count / total_rows if total_rows > 0 else 0
            col_lower = col_name.lower()
            is_identifier = (
                uniqueness_ratio > 0.5
                or any(kw in col_lower for kw in [
                    "phone", "email", "id", "name", "address",
                    "url", "path", "file", "token", "key", "code",
                ])
            )
            if is_identifier and not is_numeric:
                pass  # Don't suggest mode imputation for identifiers
            else:
                # For gender columns with a paired name column, use name-based inference
                available_name_col = name_gender_map.get(col_name)
                if semantic_type == "gender" and available_name_col:
                    impute_decision = decision_engine.select_gender_imputation_method(
                        profile, available_name_col
                    )
                else:
                    # Use decision engine for method selection
                    impute_decision = decision_engine.select_imputation_method(
                        profile, df_stats
                    )
                method = impute_decision.method

                # Use confidence model for unified scoring
                imp_signals = [
                    DetectorSignal(
                        "null_detector", True,
                        min(0.90, 0.50 + (null_pct / 100) * 2),
                    )
                ]
                repair_strategy = (
                    "ml_impute" if method == "missforest"
                    else "simple_replace" if method == "name_based_gender"
                    else "statistical_impute"
                )
                imp_conf = confidence_model.compute(
                    signals=imp_signals,
                    sample_size=total_rows,
                    issue_type="default",
                    repair_strategy=repair_strategy,
                    impact_pct=null_pct,
                )
                confidence = imp_conf.detection_confidence
                # Penalize financial/PII types
                if semantic_type in ("salary", "phone", "email"):
                    confidence = max(0.40, confidence - 0.10)

                before = [None] * min(null_count, 5)
                after_val = method
                if method == "name_based_gender":
                    after_val = "inferred from name"

                # Build alternative strategies
                alt_impute = []
                if method != "mode":
                    alt_impute.append(
                        {"method": "mode", "reason": "Fill with most common value"}
                    )
                if method != "name_based_gender" and semantic_type == "gender" and available_name_col:
                    alt_impute.append(
                        {"method": "name_based_gender", "reason": "Infer gender from name column"}
                    )
                if method != "median" and is_numeric:
                    alt_impute.append(
                        {"method": "median", "reason": "Simple, robust for numeric"}
                    )
                if method != "knn" and is_numeric:
                    alt_impute.append(
                        {"method": "knn", "reason": "Uses neighbor values"}
                    )
                if method != "missforest" and is_numeric:
                    alt_impute.append(
                        {"method": "missforest", "reason": "ML-based multivariate"}
                    )

                suggestions.append(_build_suggestion(
                    action_type="missing_value_imputation",
                    target_column=col_name,
                    parameters={"method": method, **impute_decision.params},
                    confidence=confidence,
                    reason=f"Column '{col_name}' has {null_count} missing values ({null_pct}%). "
                           f"Recommended: {method} ({impute_decision.rationale}).",
                    estimated_rows_affected=null_count,
                    total_rows=total_rows,
                    before_sample=before,
                    after_sample=[f"[{after_val}]"] * min(null_count, 5),
                    evidence={"null_count": null_count, "null_pct": null_pct,
                              "imputation_method": method,
                              "semantic_type": semantic_type},
                    sem_type=semantic_type,
                    repair_confidence=imp_conf.repair_confidence,
                    detector_agreement=imp_conf.agreement_score,
                    detectors_used=imp_conf.detectors_used,
                    detection_rationale=imp_conf.rationale,
                    repair_rationale=impute_decision.rationale,
                    alternative_strategies=alt_impute if alt_impute else None,
                ))

        # --- Date format detection ---
        patterns = profile.get("patterns", {})
        date_formats = patterns.get("date_formats", []) if patterns else []
        if date_formats and is_string_col:
            target_fmt = "%Y-%m-%d"

            # Build before/after showing values that would actually change
            col_vals = df[col_name].dropna().astype(str).str.strip()
            mismatched = []
            converted = []
            for val in col_vals:
                # Try to parse and see if re-formatting changes the value
                for fmt in date_formats:
                    try:
                        dt = pd.to_datetime(val, format=fmt, errors="raise")
                        formatted = dt.strftime(target_fmt)
                        if formatted != val:
                            mismatched.append(val)
                            converted.append(formatted)
                        break
                    except Exception:
                        continue
                if len(mismatched) >= 5:
                    break

            if mismatched:
                before = mismatched[:5]
                after = converted[:5]
            else:
                before = _get_column_sample(df, col_name, 5)
                after = before

            # Higher confidence when only one format is detected
            confidence = 0.90 if len(date_formats) == 1 else 0.80
            rows_affected = len(mismatched) if mismatched else total_rows

            suggestions.append(_build_suggestion(
                action_type="date_correction",
                target_column=col_name,
                parameters={"target_format": target_fmt},
                confidence=confidence,
                reason=f"Column '{col_name}' contains date-like strings with "
                       f"detected formats: {', '.join(date_formats[:3])}. "
                       f"Standardizing to ISO format (YYYY-MM-DD) is recommended.",
                estimated_rows_affected=rows_affected,
                total_rows=total_rows,
                before_sample=before,
                after_sample=after,
                evidence={"detected_formats": date_formats,
                          "format_count": len(date_formats)},
                sem_type=semantic_type,
            ))

        # --- Email validation ---
        email_count = patterns.get("email_count", 0) if patterns else 0
        if email_count > 0 and is_string_col:
            sample_size = min(total_rows, 1000)
            validity_pct = round(email_count / sample_size * 100, 1)
            if validity_pct > 50:
                invalid_count = sample_size - email_count
                invalid_pct = round(100 - validity_pct, 1)

                # Show invalid emails in before/after preview
                import re as _re
                _email_pat = _re.compile(
                    r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
                )
                col_vals = df[col_name].dropna().astype(str).str.strip()
                invalid_vals = [
                    v for v in col_vals
                    if not _email_pat.match(v)
                ][:5]
                if invalid_vals:
                    before = invalid_vals
                    after = ["[flagged]"] * len(invalid_vals)
                else:
                    before = _get_column_sample(df, col_name, 5)
                    after = before

                confidence = min(0.95, 0.80 + (invalid_pct / 100) * 0.3)

                suggestions.append(_build_suggestion(
                    action_type="format_validation",
                    target_column=col_name,
                    parameters={"format_type": "email", "action": "flag"},
                    confidence=confidence,
                    reason=f"Column '{col_name}' appears to contain email addresses "
                           f"({validity_pct}% match email pattern). "
                           f"Invalid emails can be flagged for review.",
                    estimated_rows_affected=invalid_count,
                    total_rows=total_rows,
                    before_sample=before,
                    after_sample=after,
                    evidence={"valid_email_count": email_count,
                              "invalid_pct": invalid_pct,
                              "sample_size": sample_size},
                    sem_type=semantic_type,
                ))

        # --- Unit normalization ---
        unit_suffixes = patterns.get("unit_suffixes", []) if patterns else []
        if len(unit_suffixes) > 1:
            before = _get_column_sample(df, col_name, 5)

            confidence = 0.75 if len(unit_suffixes) == 2 else 0.70

            suggestions.append(_build_suggestion(
                action_type="unit_normalization",
                target_column=col_name,
                parameters={"target_unit": unit_suffixes[0]},
                confidence=confidence,
                reason=f"Column '{col_name}' contains mixed units: "
                       f"{', '.join(unit_suffixes)}. "
                       f"Normalizing to a common unit ({unit_suffixes[0]}) is recommended.",
                estimated_rows_affected=total_rows,
                total_rows=total_rows,
                before_sample=before,
                after_sample=before,
                evidence={"units_found": unit_suffixes},
                sem_type=semantic_type,
            ))

        # --- Impossible value detection ---
        impossible = profile.get("impossible_values", {})
        imp_count = impossible.get("count", 0)
        if imp_count > 0:
            before = _get_column_sample(df, col_name, 5)
            examples = impossible.get("examples", [])
            rule = impossible.get("rule", "")

            suggestions.append(_build_suggestion(
                action_type="impossible_value_detection",
                target_column=col_name,
                parameters={
                    "semantic_type": semantic_type,
                    "strategy": "flag",
                    "rules": {"rule": rule},
                },
                confidence=0.95,
                reason=f"Column '{col_name}' has {imp_count} impossible value(s) "
                       f"based on semantic type '{semantic_type}' "
                       f"(rule: {rule}). Examples: {examples[:5]}.",
                estimated_rows_affected=imp_count,
                total_rows=total_rows,
                before_sample=examples[:5] if examples else before,
                after_sample=["[flagged]"] * min(imp_count, 5),
                evidence={
                    "impossible_count": imp_count,
                    "examples": examples[:10],
                    "rule": rule,
                    "semantic_type": semantic_type,
                },
                sem_type=semantic_type,
                force_severity="critical",
            ))

    # Sort by severity priority (critical > warning > info), then confidence
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    suggestions.sort(
        key=lambda s: (severity_order.get(s.severity or "info", 2), -s.confidence),
    )
    return suggestions


# ---------------------------------------------------------------------------
# AI suggestion merger
# ---------------------------------------------------------------------------

def merge_ai_suggestions(
    suggestions: List[CleaningSuggestion],
    ai_result: Dict[str, Any],
    total_rows: int,
) -> List[CleaningSuggestion]:
    """Merge AI enhancements into existing rule-based suggestions.

    Args:
        suggestions: Existing rule-based suggestions.
        ai_result: Parsed AI response from ai_cleaning_advisor.
        total_rows: Total row count for impact calculations.

    Returns:
        Enhanced list of suggestions with AI adjustments applied.
    """
    # 1. Apply enhancements to existing suggestions
    for enhancement in ai_result.get("enhanced_suggestions", []):
        idx = enhancement.get("index")
        if idx is None or idx < 0 or idx >= len(suggestions):
            continue

        s = suggestions[idx]

        # Adjust confidence
        adj = enhancement.get("confidence_adjustment", 0)
        if adj:
            s.confidence = round(max(0.0, min(1.0, s.confidence + adj)), 2)

        # Add AI reasoning
        ai_reason = enhancement.get("ai_reason")
        if ai_reason:
            s.ai_reason = ai_reason
            s.ai_enhanced = True

        # Update method if AI recommends a better one
        better_method = enhancement.get("better_method")
        if better_method and better_method != s.action.parameters.get("method"):
            s.action.parameters["method"] = better_method
            s.ai_enhanced = True

        # Merge AI risk notes
        ai_risks = enhancement.get("ai_risk_notes", [])
        if ai_risks:
            existing_risks = s.risk_notes or []
            s.risk_notes = existing_risks + ai_risks
            s.ai_enhanced = True

    # 2. Add new suggestions from AI
    for new_sug in ai_result.get("new_suggestions", []):
        action_type = new_sug.get("action_type")
        if not action_type:
            continue

        target_col = new_sug.get("target_column")
        method = new_sug.get("method", "")
        confidence = new_sug.get("confidence", 0.70)
        reason = new_sug.get("reason", "")
        params = new_sug.get("parameters", {})
        if method:
            params["method"] = method

        new_suggestion = CleaningSuggestion(
            action=CleaningAction(
                action_type=action_type,
                target_column=target_col,
                parameters=params,
            ),
            confidence=round(max(0.0, min(1.0, confidence)), 2),
            reason=reason,
            estimated_rows_affected=0,
            severity="info",
            category=_CATEGORY_MAP.get(action_type),
            ai_enhanced=True,
            ai_reason=reason,
        )
        suggestions.append(new_suggestion)

    # 3. Re-sort
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    suggestions.sort(
        key=lambda s: (severity_order.get(s.severity or "info", 2), -s.confidence),
    )
    return suggestions


# ---------------------------------------------------------------------------
# Confidence helpers
# ---------------------------------------------------------------------------

def _compute_outlier_confidence(
    iqr_count: int, zscore_count: int, total_rows: int,
    skewness: Optional[float],
) -> float:
    """Compute adaptive confidence for outlier detection."""
    confidence = 0.55

    # If both IQR and Z-score agree, strong signal
    if iqr_count > 0 and zscore_count > 0:
        confidence += 0.15

    # Too many outliers -> probably legitimate distribution shape
    outlier_ratio = iqr_count / total_rows if total_rows > 0 else 0
    if outlier_ratio > 0.05:
        confidence -= 0.10

    # Highly skewed distributions produce false IQR outliers
    if skewness is not None and abs(skewness) > 2.0:
        confidence -= 0.05

    return max(0.40, min(0.85, confidence))


# ---------------------------------------------------------------------------
# Severity assignment
# ---------------------------------------------------------------------------

def _assign_severity(
    action_type: str,
    evidence: Optional[Dict[str, Any]] = None,
    force_severity: Optional[str] = None,
) -> str:
    """Assign severity level based on action type and evidence."""
    if force_severity:
        return force_severity

    if action_type == "impossible_value_detection":
        return "critical"

    if action_type == "format_validation":
        invalid_pct = (evidence or {}).get("invalid_pct", 0)
        if invalid_pct > 20:
            return "critical"
        return "warning"

    if action_type in ("outlier_detection", "smart_duplicates"):
        return "warning"

    if action_type == "missing_value_imputation":
        null_pct = (evidence or {}).get("null_pct", 0)
        if null_pct > 20:
            return "warning"
        return "info"

    if action_type == "date_correction":
        format_count = (evidence or {}).get("format_count", 0)
        if format_count > 1:
            return "warning"
        return "info"

    # Cosmetic / housekeeping actions
    return "info"


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------

def _build_suggestion(
    action_type: str,
    parameters: Dict[str, Any],
    confidence: float,
    reason: str,
    estimated_rows_affected: int,
    total_rows: int,
    before_sample: list,
    after_sample: list,
    evidence: Optional[Dict[str, Any]] = None,
    target_column: Optional[str] = None,
    sem_type: Optional[str] = None,
    force_severity: Optional[str] = None,
    # Research-grade explainability fields
    repair_confidence: Optional[float] = None,
    detector_agreement: Optional[float] = None,
    detectors_used: Optional[List[str]] = None,
    detection_rationale: Optional[str] = None,
    repair_rationale: Optional[str] = None,
    alternative_strategies: Optional[List[Dict[str, Any]]] = None,
    risk_notes: Optional[List[str]] = None,
) -> CleaningSuggestion:
    """Build an enriched CleaningSuggestion with severity, category, impact."""
    impact_pct = (
        round(estimated_rows_affected / total_rows * 100, 1)
        if total_rows > 0 else 0.0
    )
    is_destructive = action_type in _DESTRUCTIVE_ACTIONS
    severity = _assign_severity(action_type, evidence, force_severity)
    category = _CATEGORY_MAP.get(action_type)

    return CleaningSuggestion(
        action=CleaningAction(
            action_type=action_type,
            target_column=target_column,
            parameters=parameters,
        ),
        confidence=round(confidence, 2),
        reason=reason,
        estimated_rows_affected=estimated_rows_affected,
        before_sample=before_sample,
        after_sample=after_sample,
        severity=severity,
        category=category,
        impact_pct=impact_pct,
        is_destructive=is_destructive,
        evidence=evidence,
        semantic_type=sem_type,
        repair_confidence=round(repair_confidence, 3) if repair_confidence is not None else None,
        detector_agreement=round(detector_agreement, 3) if detector_agreement is not None else None,
        detectors_used=detectors_used,
        detection_rationale=detection_rationale,
        repair_rationale=repair_rationale,
        alternative_strategies=alternative_strategies,
        risk_notes=risk_notes,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _check_column_name_issues(columns_profile: Dict[str, Any]) -> List[str]:
    """Return column names that have naming issues."""
    problematic: List[str] = []
    for col_name, profile in columns_profile.items():
        issues = profile.get("column_name_issues", {})
        if issues.get("has_spaces") or issues.get("has_special_chars") or issues.get("starts_with_digit"):
            problematic.append(col_name)
    return problematic


def _get_column_sample(df: pd.DataFrame, col_name: str, n: int = 5) -> List[Any]:
    """Get sample values from a column."""
    if col_name not in df.columns:
        return []
    sample = df[col_name].dropna().head(n)
    return [
        float(v) if isinstance(v, (np.floating, np.integer)) else
        str(v) if not isinstance(v, (str, int, float, type(None))) else v
        for v in sample.tolist()
    ]
