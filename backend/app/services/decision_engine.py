"""Intelligent strategy selection based on data characteristics."""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class StrategyDecision:
    method: str
    params: Dict[str, Any] = field(default_factory=dict)
    rationale: str = ""
    confidence_boost: float = 0.0  # How much this method improves confidence


class DecisionEngine:
    """Selects optimal algorithm based on column/dataset characteristics."""

    def select_outlier_method(self, profile: Dict[str, Any]) -> StrategyDecision:
        normality = profile.get("normality_test", {})
        is_normal = normality.get("is_normal", None)
        skewness = profile.get("skewness", 0)
        n_samples = profile.get("total_count", 0)

        if is_normal and abs(skewness) < 1:
            return StrategyDecision(
                "iqr", {}, "Normal distribution -- IQR is optimal", 0.10
            )
        elif abs(skewness) > 2:
            return StrategyDecision(
                "mad",
                {"threshold": 3.5},
                "Skewed distribution -- MAD is robust",
                0.15,
            )
        elif n_samples > 10000:
            return StrategyDecision(
                "isolation_forest",
                {},
                "Large dataset, non-normal -- IF is scalable",
                0.05,
            )
        elif n_samples > 100:
            return StrategyDecision(
                "lof",
                {"n_neighbors": min(20, n_samples - 1)},
                "Small-medium dataset -- LOF captures local structure",
                0.08,
            )
        else:
            return StrategyDecision(
                "mad",
                {"threshold": 3.5},
                "Small dataset -- MAD is safe default",
                0.10,
            )

    def select_imputation_method(
        self, profile: Dict[str, Any], df_stats: Dict[str, Any]
    ) -> StrategyDecision:
        missing_pct = profile.get("null_pct", 0)
        n_samples = df_stats.get("total_rows", 0)
        n_numeric = df_stats.get("n_numeric_cols", 0)
        is_numeric = profile.get("dtype", "").startswith(("int", "float"))

        if missing_pct > 50:
            return StrategyDecision(
                "median" if is_numeric else "mode",
                {},
                "High missingness (>50%) -- simple imputation safest",
                0.0,
            )
        if missing_pct < 5 and n_samples > 5000:
            return StrategyDecision(
                "median" if is_numeric else "mode",
                {},
                "Low missingness + large N -- simple is fine",
                0.05,
            )
        if (
            is_numeric
            and n_numeric >= 3
            and n_samples > 500
            and missing_pct < 30
        ):
            return StrategyDecision(
                "missforest",
                {"n_estimators": 100, "max_iter": 10},
                "Moderate missingness + multivariate -- MissForest captures relationships",
                0.10,
            )
        if is_numeric and n_samples > 100:
            k = min(int(n_samples**0.5), 50)
            return StrategyDecision(
                "knn",
                {"k": k},
                f"Moderate data -- KNN with adaptive k={k}",
                0.05,
            )
        return StrategyDecision(
            "median" if is_numeric else "mode",
            {},
            "Default fallback -- simple imputation",
            0.0,
        )

    def select_gender_imputation_method(
        self,
        profile: Dict[str, Any],
        available_name_col: Optional[str] = None,
    ) -> StrategyDecision:
        """Select optimal gender imputation: name-based if name column exists."""
        if available_name_col:
            return StrategyDecision(
                "name_based_gender",
                {"name_column": available_name_col},
                "Infer gender from name column -- more accurate than mode",
                0.15,
            )
        return StrategyDecision(
            "mode",
            {},
            "No name column available -- fallback to most common value",
            0.0,
        )

    def select_dedup_method(self, n_rows: int) -> StrategyDecision:
        if n_rows < 5000:
            return StrategyDecision(
                "levenshtein",
                {"threshold": 85},
                "Small dataset -- pairwise fuzzy matching feasible",
                0.0,
            )
        return StrategyDecision(
            "blocking",
            {"threshold": 85},
            "Large dataset -- blocking reduces O(n^2) to near O(n)",
            0.05,
        )

    def should_flag_only(self, confidence: float, is_destructive: bool) -> bool:
        """When confidence is low or action is destructive, flag only."""
        if confidence < 0.70:
            return True
        if is_destructive and confidence < 0.85:
            return True
        return False

    def should_defer_to_user(
        self, confidence: float, impact_pct: float
    ) -> bool:
        """High-impact + moderate confidence = ask the user."""
        if impact_pct > 25 and confidence < 0.80:
            return True
        if impact_pct > 50 and confidence < 0.90:
            return True
        return False
