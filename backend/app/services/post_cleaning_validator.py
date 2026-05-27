"""Post-cleaning validation: verifies cleaning improved data quality
and detects potential damage from cleaning operations."""

from typing import Any, Dict, List

import numpy as np
import pandas as pd


class PostCleaningValidator:
    """Validates that cleaning operations improved data quality."""

    def validate(
        self,
        df_before: pd.DataFrame,
        df_after: pd.DataFrame,
        actions_executed: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        results: Dict[str, Any] = {
            "passed": True,
            "warnings": [],
            "quality_delta": {},
            "distribution_shifts": [],
            "row_preservation": {},
        }

        # 1. Quality delta
        results["quality_delta"] = self._compute_quality_delta(
            df_before, df_after
        )
        if results["quality_delta"].get("overall_delta", 0) < 0:
            results["warnings"].append(
                "Overall quality score decreased after cleaning"
            )
            results["passed"] = False

        # 2. Row preservation check
        rows_removed = len(df_before) - len(df_after)
        rows_removed_pct = (
            rows_removed / len(df_before) * 100 if len(df_before) > 0 else 0
        )
        results["row_preservation"] = {
            "rows_before": len(df_before),
            "rows_after": len(df_after),
            "rows_removed": rows_removed,
            "removal_pct": round(rows_removed_pct, 2),
        }
        if rows_removed_pct > 20:
            results["warnings"].append(
                f"Cleaning removed {rows_removed_pct:.1f}% of rows"
            )

        # 3. Distribution shift detection (numeric columns)
        common_cols = set(df_before.columns) & set(df_after.columns)
        for col in common_cols:
            if pd.api.types.is_numeric_dtype(
                df_before[col]
            ) and pd.api.types.is_numeric_dtype(df_after[col]) and not pd.api.types.is_bool_dtype(
                df_before[col]
            ) and not pd.api.types.is_bool_dtype(df_after[col]):
                shift = self._detect_distribution_shift(
                    df_before[col], df_after[col]
                )
                if shift["significant"]:
                    results["distribution_shifts"].append(
                        {"column": col, **shift}
                    )
                    results["warnings"].append(
                        f"Significant distribution shift in '{col}' "
                        f"(mean: {shift['mean_before']:.2f} -> {shift['mean_after']:.2f})"
                    )

        # 4. Null count check (cleaning should reduce nulls, not increase)
        nulls_before = df_before.isna().sum().sum()
        nulls_after = df_after[list(common_cols)].isna().sum().sum()
        if nulls_after > nulls_before * 1.1:  # 10% tolerance
            results["warnings"].append(
                f"Null count increased from {nulls_before} to {nulls_after}"
            )

        return results

    def _compute_quality_delta(
        self, df_before: pd.DataFrame, df_after: pd.DataFrame
    ) -> Dict[str, Any]:
        from app.services.cleaning_actions import calculate_quality_score

        score_before = calculate_quality_score(df_before)
        score_after = calculate_quality_score(df_after)
        return {
            "score_before": score_before,
            "score_after": score_after,
            "overall_delta": score_after - score_before,
        }

    def _detect_distribution_shift(
        self, col_before: pd.Series, col_after: pd.Series
    ) -> Dict[str, Any]:
        before = col_before.dropna()
        after = col_after.dropna()
        if len(before) < 10 or len(after) < 10:
            return {"significant": False}

        try:
            from scipy.stats import ks_2samp

            stat, p_value = ks_2samp(before, after)
        except ImportError:
            # scipy not available, skip distribution shift detection
            return {"significant": False}

        return {
            "significant": p_value < 0.01,
            "ks_statistic": round(float(stat), 4),
            "p_value": round(float(p_value), 4),
            "mean_before": round(float(before.mean()), 4),
            "mean_after": round(float(after.mean()), 4),
            "std_before": round(float(before.std()), 4),
            "std_after": round(float(after.std()), 4),
        }
