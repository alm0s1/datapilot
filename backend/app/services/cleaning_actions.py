"""Cleaning actions module - 10 modular data cleaning operations.

Each action implements BaseCleaningAction with execute() and preview() methods.
Actions are registered in ACTIONS_REGISTRY for pipeline dispatch.
"""

import re
import time
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional, Tuple, Type

import numpy as np
import pandas as pd

from app.schemas.cleaning import ActionReport


# ---------------------------------------------------------------------------
# Base class & registry
# ---------------------------------------------------------------------------

class BaseCleaningAction(ABC):
    """Base class for all cleaning actions."""

    action_type: str = ""
    is_heavy: bool = False  # True = should run in Celery

    @abstractmethod
    def execute(
        self, df: pd.DataFrame, params: Dict[str, Any]
    ) -> Tuple[pd.DataFrame, ActionReport]:
        """Execute the action and return (modified_df, report)."""
        ...

    def preview(
        self, df: pd.DataFrame, params: Dict[str, Any], n: int = 5
    ) -> Dict[str, Any]:
        """Generate before/after samples without modifying df."""
        before = self._get_sample(df, params, n)
        df_copy = df.copy()
        try:
            df_modified, _ = self.execute(df_copy, params)
            after = self._get_sample(df_modified, params, n)
        except Exception:
            after = before
        return {"before_sample": before, "after_sample": after}

    def _get_sample(
        self, df: pd.DataFrame, params: Dict[str, Any], n: int = 5
    ) -> List[Any]:
        col = params.get("target_column")
        if col and col in df.columns:
            return df[col].head(n).tolist()
        return []

    def _make_report(
        self, action_type: str, target_column: Optional[str],
        rows_affected: int, cells_modified: int,
        before_sample: List, after_sample: List,
        elapsed_ms: int, error: Optional[str] = None,
    ) -> ActionReport:
        return ActionReport(
            action_type=action_type,
            target_column=target_column,
            success=error is None,
            rows_affected=rows_affected,
            cells_modified=cells_modified,
            before_sample=before_sample[:5],
            after_sample=after_sample[:5],
            execution_time_ms=elapsed_ms,
            error_message=error,
        )


ACTIONS_REGISTRY: Dict[str, Type[BaseCleaningAction]] = {}


def register_action(cls: Type[BaseCleaningAction]) -> Type[BaseCleaningAction]:
    """Decorator to register an action class."""
    ACTIONS_REGISTRY[cls.action_type] = cls
    return cls


# ---------------------------------------------------------------------------
# 1. Column Name Normalization
# ---------------------------------------------------------------------------

@register_action
class ColumnNameNormalizationAction(BaseCleaningAction):
    action_type = "column_name_normalization"
    is_heavy = False

    def execute(self, df, params):
        t0 = time.time()
        original_cols = list(df.columns)
        new_cols = []
        seen: Dict[str, int] = {}

        for col in original_cols:
            name = str(col).strip()
            name = re.sub(r"[^\w]", "_", name)
            name = re.sub(r"_+", "_", name).strip("_").lower()
            if not name or name[0].isdigit():
                name = f"col_{name}"
            # Deduplicate
            if name in seen:
                seen[name] += 1
                name = f"{name}_{seen[name]}"
            else:
                seen[name] = 0
            new_cols.append(name)

        changed = sum(1 for a, b in zip(original_cols, new_cols) if str(a) != b)
        before = [str(c) for c in original_cols[:5]]
        after = new_cols[:5]
        df.columns = new_cols

        elapsed = int((time.time() - t0) * 1000)
        return df, self._make_report(
            self.action_type, None, 0, changed, before, after, elapsed
        )


# ---------------------------------------------------------------------------
# 2. Text Normalization
# ---------------------------------------------------------------------------

@register_action
class TextNormalizationAction(BaseCleaningAction):
    action_type = "text_normalization"
    is_heavy = False

    def execute(self, df, params):
        t0 = time.time()
        columns = params.get("columns") or [
            c for c in df.columns if pd.api.types.is_string_dtype(df[c])
        ]
        do_lower = params.get("lowercase", False)
        do_strip = params.get("strip", True)
        do_collapse = params.get("collapse_whitespace", True)
        do_unicode = params.get("normalize_unicode", False)

        total_cells = 0
        before_sample: List[Any] = []
        after_sample: List[Any] = []

        for col in columns:
            if col not in df.columns or not pd.api.types.is_string_dtype(df[col]):
                continue
            original = df[col].copy()
            if not before_sample:
                before_sample = original.dropna().head(5).tolist()

            s = df[col]
            if do_strip:
                s = s.map(lambda x: x.strip() if isinstance(x, str) else x)
            if do_collapse:
                s = s.map(lambda x: re.sub(r"\s+", " ", x) if isinstance(x, str) else x)
            if do_lower:
                s = s.str.lower()
            if do_unicode:
                try:
                    from unidecode import unidecode as _unidecode
                    s = s.map(lambda x: _unidecode(x) if isinstance(x, str) else x)
                except ImportError:
                    pass

            changed = (original != s) & s.notna()
            total_cells += int(changed.sum())
            df[col] = s

            if col == columns[0]:
                after_sample = s.dropna().head(5).tolist()

        elapsed = int((time.time() - t0) * 1000)
        return df, self._make_report(
            self.action_type, None, total_cells, total_cells,
            before_sample, after_sample, elapsed,
        )


# ---------------------------------------------------------------------------
# 3. Null Representation
# ---------------------------------------------------------------------------

@register_action
class NullRepresentationAction(BaseCleaningAction):
    action_type = "null_representation"
    is_heavy = False

    # Default null-like strings
    DEFAULT_NULL_STRINGS = {
        "", " ", "N/A", "NA", "n/a", "na", "N/a",
        "null", "NULL", "Null", "None", "none", "NONE",
        "NaN", "nan", "NAN", "-", "--", ".", "..",
        "missing", "MISSING", "Missing",
        "undefined", "UNDEFINED",
        "#N/A", "#NA", "#NULL!",
    }

    def execute(self, df, params):
        t0 = time.time()
        null_strings = set(params.get("null_values", self.DEFAULT_NULL_STRINGS))
        columns = params.get("columns") or [
            c for c in df.columns if pd.api.types.is_string_dtype(df[c])
        ]

        total_cells = 0
        before_sample: List[Any] = []
        after_sample: List[Any] = []

        for col in columns:
            if col not in df.columns:
                continue
            original_nulls = df[col].isna().sum()

            if pd.api.types.is_string_dtype(df[col]):
                mask = df[col].astype(str).str.strip().isin(null_strings)
                if not before_sample:
                    matched = df.loc[mask, col].head(5)
                    before_sample = matched.tolist()
                df.loc[mask, col] = np.nan
                new_nulls = df[col].isna().sum()
                total_cells += int(new_nulls - original_nulls)

        after_sample = [None] * min(len(before_sample), 5)

        elapsed = int((time.time() - t0) * 1000)
        return df, self._make_report(
            self.action_type, None, total_cells, total_cells,
            before_sample, after_sample, elapsed,
        )


# ---------------------------------------------------------------------------
# 4. Smart Duplicates
# ---------------------------------------------------------------------------

@register_action
class SmartDuplicatesAction(BaseCleaningAction):
    action_type = "smart_duplicates"
    is_heavy = True  # Fuzzy/ML modes are heavy

    def execute(self, df, params):
        t0 = time.time()
        method = params.get("method", "exact")
        columns = params.get("columns")  # subset of columns, or None for all
        threshold = params.get("threshold", 85)

        original_len = len(df)
        before_sample = df.head(5).values.tolist()

        if method == "exact":
            df = df.drop_duplicates(subset=columns)
        elif method == "levenshtein":
            df = self._fuzzy_dedup(df, columns, threshold)
        elif method == "blocking":
            df, removed_count = self._blocking_dedup(df, columns, threshold)
        # ML embedding method deferred - requires sentence-transformers

        removed = original_len - len(df)
        after_sample = df.head(5).values.tolist()
        elapsed = int((time.time() - t0) * 1000)

        return df, self._make_report(
            self.action_type, None, removed, removed,
            before_sample[:5], after_sample[:5], elapsed,
        )

    def _fuzzy_dedup(self, df, columns, threshold):
        """Remove fuzzy duplicates using rapidfuzz."""
        try:
            from rapidfuzz import fuzz
        except ImportError:
            return df.drop_duplicates(subset=columns)

        # Build composite key for comparison
        if columns:
            keys = df[columns].astype(str).agg(" ".join, axis=1)
        else:
            keys = df.astype(str).agg(" ".join, axis=1)

        keys_list = keys.tolist()
        drop_indices = set()

        for i in range(len(keys_list)):
            if i in drop_indices:
                continue
            for j in range(i + 1, len(keys_list)):
                if j in drop_indices:
                    continue
                score = fuzz.ratio(keys_list[i], keys_list[j])
                if score >= threshold:
                    drop_indices.add(j)

        return df.drop(index=list(drop_indices)).reset_index(drop=True)

    def _blocking_dedup(self, df, columns, threshold):
        """Scalable dedup: phonetic blocking + pairwise within blocks."""
        try:
            from rapidfuzz import fuzz
        except ImportError:
            removed = df.duplicated(subset=columns).sum()
            return df.drop_duplicates(subset=columns), int(removed)

        # Build composite keys
        if columns:
            comp_cols = columns
        else:
            comp_cols = list(df.columns)

        block_col = comp_cols[0]
        block_keys = df[block_col].astype(str).str[:3].str.lower()

        duplicates = set()
        for block_key, block_idx in df.groupby(block_keys).groups.items():
            block_df = df.loc[block_idx]
            if len(block_df) < 2:
                continue

            # Build composite text for comparison
            texts = {}
            for idx in block_df.index:
                texts[idx] = " ".join(
                    str(block_df.loc[idx, c]) for c in comp_cols
                ).lower()

            if len(block_df) > 500:
                # Use MinHash LSH for large blocks
                try:
                    from datasketch import MinHash, MinHashLSH

                    lsh = MinHashLSH(threshold=threshold / 100, num_perm=128)
                    minhashes = {}
                    for idx in block_df.index:
                        m = MinHash(num_perm=128)
                        for token in texts[idx].split():
                            m.update(token.encode("utf8"))
                        try:
                            lsh.insert(str(idx), m)
                        except ValueError:
                            pass  # Duplicate key
                        minhashes[idx] = m

                    for idx in block_df.index:
                        if idx in duplicates:
                            continue
                        result = lsh.query(minhashes[idx])
                        for match_str in result:
                            match_idx = int(match_str)
                            if match_idx != idx and match_idx not in duplicates:
                                duplicates.add(match_idx)
                except ImportError:
                    # datasketch not available, fall back to pairwise
                    indices = list(block_df.index)
                    for i in range(len(indices)):
                        if indices[i] in duplicates:
                            continue
                        for j in range(i + 1, min(len(indices), i + 100)):
                            if indices[j] in duplicates:
                                continue
                            score = fuzz.ratio(texts[indices[i]], texts[indices[j]])
                            if score >= threshold:
                                duplicates.add(indices[j])
            else:
                # Small block: pairwise comparison
                indices = list(block_df.index)
                for i in range(len(indices)):
                    if indices[i] in duplicates:
                        continue
                    for j in range(i + 1, len(indices)):
                        if indices[j] in duplicates:
                            continue
                        score = fuzz.ratio(texts[indices[i]], texts[indices[j]])
                        if score >= threshold:
                            duplicates.add(indices[j])

        removed = len(duplicates)
        df = df.drop(index=list(duplicates)).reset_index(drop=True)
        return df, removed


# ---------------------------------------------------------------------------
# 5. Outlier Detection
# ---------------------------------------------------------------------------

@register_action
class OutlierDetectionAction(BaseCleaningAction):
    action_type = "outlier_detection"
    is_heavy = True  # Isolation Forest is heavy

    def execute(self, df, params):
        t0 = time.time()
        col_name = params.get("target_column")
        method = params.get("method", "iqr")
        action = params.get("action", "cap")  # flag, cap, remove

        if not col_name or col_name not in df.columns:
            elapsed = int((time.time() - t0) * 1000)
            return df, self._make_report(
                self.action_type, col_name, 0, 0, [], [], elapsed,
                error="Column not found",
            )

        col = df[col_name]
        if not pd.api.types.is_numeric_dtype(col):
            elapsed = int((time.time() - t0) * 1000)
            return df, self._make_report(
                self.action_type, col_name, 0, 0, [], [], elapsed,
                error="Column is not numeric",
            )

        outlier_mask = self._detect_outliers(col, method)
        outlier_count = int(outlier_mask.sum())

        # Capture actual outlier values for before/after display
        outlier_indices = col[outlier_mask].index[:5].tolist()
        before_sample = [col.iloc[i] for i in outlier_indices] if outlier_indices else col.dropna().head(5).tolist()

        if action == "flag":
            df[f"{col_name}_outlier"] = outlier_mask
            cells = outlier_count
        elif action == "cap":
            q1 = col.quantile(0.25)
            q3 = col.quantile(0.75)
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            df[col_name] = col.clip(lower=lower, upper=upper)
            cells = outlier_count
        elif action == "remove":
            df = df[~outlier_mask].reset_index(drop=True)
            cells = outlier_count
        else:
            cells = 0

        # Show actual changed values (at the same indices) for after sample
        if outlier_indices and action != "remove":
            after_sample = [df[col_name].iloc[i] for i in outlier_indices if i < len(df)]
        elif outlier_indices and action == "remove":
            after_sample = ["[removed]"] * len(outlier_indices)
        else:
            after_sample = before_sample

        # Convert numpy types for JSON safety
        before_sample = [float(v) if isinstance(v, (np.floating, np.integer)) else v for v in before_sample]
        after_sample = [float(v) if isinstance(v, (np.floating, np.integer)) else v for v in after_sample]

        elapsed = int((time.time() - t0) * 1000)
        rows_affected = outlier_count if action == "remove" else 0
        return df, self._make_report(
            self.action_type, col_name, rows_affected, cells,
            before_sample, after_sample, elapsed,
        )

    def _detect_outliers(self, col: pd.Series, method: str) -> pd.Series:
        non_null = col.dropna()
        mask = pd.Series(False, index=col.index)

        if method == "iqr":
            q1 = non_null.quantile(0.25)
            q3 = non_null.quantile(0.75)
            iqr = q3 - q1
            mask = (col < (q1 - 1.5 * iqr)) | (col > (q3 + 1.5 * iqr))
        elif method == "zscore":
            mean = non_null.mean()
            std = non_null.std()
            if std and std > 0:
                z = ((col - mean) / std).abs()
                mask = z > 3
        elif method == "mad":
            median = non_null.median()
            mad = np.median(np.abs(non_null - median))
            if mad > 0:
                modified_z = 0.6745 * (col - median) / mad
                mask = np.abs(modified_z) > 3.5
            else:
                mask = pd.Series(False, index=col.index)
        elif method == "lof":
            try:
                from sklearn.neighbors import LocalOutlierFactor
                values = non_null.values.reshape(-1, 1)
                n_neighbors = min(20, len(values) - 1)
                if n_neighbors < 2:
                    return mask & col.notna()
                clf = LocalOutlierFactor(n_neighbors=n_neighbors, contamination='auto')
                predictions = clf.fit_predict(values)
                outlier_set = set(non_null.index[predictions == -1])
                mask = col.index.isin(outlier_set)
            except ImportError:
                return self._detect_outliers(col, "iqr")
        elif method == "isolation_forest":
            try:
                from sklearn.ensemble import IsolationForest
                values = non_null.values.reshape(-1, 1)
                # Estimate contamination from IQR as prior
                q1 = non_null.quantile(0.25)
                q3 = non_null.quantile(0.75)
                iqr = q3 - q1
                iqr_outlier_pct = float(
                    ((non_null < q1 - 1.5 * iqr) | (non_null > q3 + 1.5 * iqr)).mean()
                )
                contamination = max(0.01, min(0.15, iqr_outlier_pct)) if iqr_outlier_pct > 0 else 0.05
                clf = IsolationForest(
                    contamination=contamination, random_state=42, n_estimators=200
                )
                predictions = clf.fit_predict(values)
                # Map back: -1 = outlier, 1 = normal
                outlier_set = set(non_null.index[predictions == -1])
                mask = col.index.isin(outlier_set)
            except ImportError:
                # Fallback to IQR if sklearn not available
                return self._detect_outliers(col, "iqr")

        return mask & col.notna()


# ---------------------------------------------------------------------------
# 6. Date Correction
# ---------------------------------------------------------------------------

@register_action
class DateCorrectionAction(BaseCleaningAction):
    action_type = "date_correction"
    is_heavy = False

    def execute(self, df, params):
        t0 = time.time()
        col_name = params.get("target_column")
        target_format = params.get("target_format", "%Y-%m-%d")
        handle_invalid = params.get("handle_invalid", "null")  # null or remove

        if not col_name or col_name not in df.columns:
            elapsed = int((time.time() - t0) * 1000)
            return df, self._make_report(
                self.action_type, col_name, 0, 0, [], [], elapsed,
                error="Column not found",
            )

        before_sample = df[col_name].dropna().head(5).tolist()

        # Try to parse dates flexibly
        try:
            from dateutil import parser as dateutil_parser
        except ImportError:
            dateutil_parser = None

        def parse_date(val):
            if pd.isna(val):
                return pd.NaT
            s = str(val).strip()
            if not s:
                return pd.NaT
            # Try pandas first (fast)
            try:
                return pd.Timestamp(s)
            except Exception:
                pass
            # Try dateutil (flexible)
            if dateutil_parser:
                try:
                    return pd.Timestamp(dateutil_parser.parse(s))
                except Exception:
                    pass
            return pd.NaT

        parsed = df[col_name].apply(parse_date)
        invalid_mask = parsed.isna() & df[col_name].notna()
        cells_modified = int((parsed.notna() & (df[col_name].astype(str) != parsed.astype(str))).sum())

        if handle_invalid == "remove":
            df = df[~invalid_mask].reset_index(drop=True)
            parsed = parsed[~invalid_mask].reset_index(drop=True)

        # Format parsed dates as strings using target_format
        formatted = parsed.apply(
            lambda ts: ts.strftime(target_format) if pd.notna(ts) else None
        )
        df[col_name] = formatted
        after_sample = df[col_name].dropna().head(5).tolist()

        rows_affected = int(invalid_mask.sum()) if handle_invalid == "remove" else 0
        elapsed = int((time.time() - t0) * 1000)

        return df, self._make_report(
            self.action_type, col_name, rows_affected, cells_modified,
            before_sample, after_sample, elapsed,
        )


# ---------------------------------------------------------------------------
# 7. Categorical Normalization
# ---------------------------------------------------------------------------

@register_action
class CategoricalNormalizationAction(BaseCleaningAction):
    action_type = "categorical_normalization"
    is_heavy = False

    def execute(self, df, params):
        t0 = time.time()
        col_name = params.get("target_column")
        strategy = params.get("strategy", "case")  # case, levenshtein, frequency

        if not col_name or col_name not in df.columns:
            elapsed = int((time.time() - t0) * 1000)
            return df, self._make_report(
                self.action_type, col_name, 0, 0, [], [], elapsed,
                error="Column not found",
            )

        original = df[col_name].copy()

        if strategy == "case":
            df = self._normalize_case(df, col_name)
        elif strategy == "levenshtein":
            df = self._normalize_fuzzy(df, col_name, params.get("threshold", 85))
        elif strategy == "frequency":
            df = self._normalize_frequency(df, col_name, params.get("min_pct", 1.0))

        changed_mask = (original != df[col_name]) & df[col_name].notna()
        cells_modified = int(changed_mask.sum())

        # Show actual changed values in before/after samples
        changed_indices = original[changed_mask].index[:5].tolist()
        if changed_indices:
            before_sample = [original.iloc[i] for i in range(len(original)) if original.index[i] in changed_indices][:5]
            after_sample = [df[col_name].iloc[i] for i in range(len(df)) if df[col_name].index[i] in changed_indices][:5]
        else:
            before_sample = df[col_name].dropna().head(5).tolist()
            after_sample = before_sample

        elapsed = int((time.time() - t0) * 1000)

        return df, self._make_report(
            self.action_type, col_name, cells_modified, cells_modified,
            before_sample, after_sample, elapsed,
        )

    def _normalize_case(self, df, col_name):
        """Merge values that differ only by case to the most common form."""
        col = df[col_name]
        if not pd.api.types.is_string_dtype(col):
            return df

        value_counts = col.dropna().value_counts()
        lower_to_best: Dict[str, str] = {}
        for val in value_counts.index:
            key = str(val).lower().strip()
            if key not in lower_to_best:
                lower_to_best[key] = str(val)

        mapped = col.map(
            lambda x: lower_to_best.get(str(x).lower().strip(), x)
            if isinstance(x, str) else x
        )
        df.loc[:, col_name] = mapped
        return df

    def _normalize_fuzzy(self, df, col_name, threshold):
        """Merge similar values using fuzzy matching."""
        try:
            from rapidfuzz import fuzz
        except ImportError:
            return self._normalize_case(df, col_name)

        col = df[col_name]
        if not pd.api.types.is_string_dtype(col):
            return df

        value_counts = col.dropna().value_counts()
        unique_vals = list(value_counts.index)
        if len(unique_vals) > 200:
            return df  # too many to compare

        merge_map: Dict[str, str] = {}
        processed = set()

        for val in unique_vals:
            if val in processed:
                continue
            for other in unique_vals:
                if other == val or other in processed:
                    continue
                score = fuzz.ratio(str(val).lower(), str(other).lower())
                if score >= threshold:
                    # Keep the more frequent one
                    if value_counts[val] >= value_counts.get(other, 0):
                        merge_map[other] = val
                    else:
                        merge_map[val] = other
                    processed.add(other)

        if merge_map:
            df.loc[:, col_name] = col.map(lambda x: merge_map.get(x, x) if isinstance(x, str) else x)
        return df

    def _normalize_frequency(self, df, col_name, min_pct):
        """Replace rare values below min_pct frequency with the most common value."""
        col = df[col_name]
        if not pd.api.types.is_string_dtype(col):
            return df

        total = col.notna().sum()
        if total == 0:
            return df

        counts = col.value_counts()
        threshold_count = total * (min_pct / 100.0)
        most_common = counts.index[0] if len(counts) > 0 else None

        rare_values = set(counts[counts < threshold_count].index)
        if rare_values and most_common:
            df.loc[:, col_name] = col.map(
                lambda x: most_common if x in rare_values else x
            )
        return df


# ---------------------------------------------------------------------------
# 8. Missing Value Imputation
# ---------------------------------------------------------------------------

@register_action
class MissingValueImputationAction(BaseCleaningAction):
    action_type = "missing_value_imputation"
    is_heavy = True  # KNN is heavy

    def execute(self, df, params):
        t0 = time.time()
        col_name = params.get("target_column")
        method = params.get("method", "median")

        if not col_name or col_name not in df.columns:
            elapsed = int((time.time() - t0) * 1000)
            return df, self._make_report(
                self.action_type, col_name, 0, 0, [], [], elapsed,
                error="Column not found",
            )

        col = df[col_name]
        null_count = int(col.isna().sum())
        if null_count == 0:
            elapsed = int((time.time() - t0) * 1000)
            return df, self._make_report(
                self.action_type, col_name, 0, 0, [], [], elapsed,
            )

        # Find indices of null values for before sample
        null_indices = col[col.isna()].index[:5].tolist()
        before_sample = [None] * min(null_count, 5)

        if method == "mean" and pd.api.types.is_numeric_dtype(col):
            fill_val = col.mean()
            df[col_name] = col.fillna(fill_val)
        elif method == "median" and pd.api.types.is_numeric_dtype(col):
            fill_val = col.median()
            df[col_name] = col.fillna(fill_val)
        elif method == "mode":
            mode_vals = col.mode()
            if len(mode_vals) > 0:
                df[col_name] = col.fillna(mode_vals[0])
        elif method == "interpolation":
            df[col_name] = col.interpolate(method="linear")
        elif method == "knn":
            df = self._knn_impute(df, col_name)
        elif method == "missforest":
            df = self._missforest_impute(df, col_name)
        elif method == "name_based_gender":
            name_col = params.get("name_column")
            df = self._infer_gender_from_name(df, col_name, name_col)
        else:
            # Fallback: median for numeric, mode for categorical
            if pd.api.types.is_numeric_dtype(col):
                df[col_name] = col.fillna(col.median())
            else:
                mode_vals = col.mode()
                if len(mode_vals) > 0:
                    df[col_name] = col.fillna(mode_vals[0])

        after_sample = [df[col_name].iloc[i] if i < len(df) else None for i in null_indices]
        # Convert numpy types for JSON safety
        after_sample = [
            float(v) if isinstance(v, (np.floating, np.integer)) else v
            for v in after_sample
        ]

        elapsed = int((time.time() - t0) * 1000)
        return df, self._make_report(
            self.action_type, col_name, null_count, null_count,
            before_sample, after_sample[:5], elapsed,
        )

    def _knn_impute(self, df, col_name):
        """KNN imputation using scikit-learn."""
        try:
            from sklearn.impute import KNNImputer
        except ImportError:
            # Fallback to median
            df[col_name] = df[col_name].fillna(df[col_name].median())
            return df

        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        if col_name not in numeric_cols:
            # KNN only works on numeric - fallback to mode
            mode_vals = df[col_name].mode()
            if len(mode_vals) > 0:
                df[col_name] = df[col_name].fillna(mode_vals[0])
            return df

        imputer = KNNImputer(n_neighbors=min(int(np.sqrt(len(df))), 50))
        df[numeric_cols] = imputer.fit_transform(df[numeric_cols])
        return df

    def _missforest_impute(self, df, col_name):
        """MissForest imputation via sklearn IterativeImputer + RandomForest."""
        try:
            from sklearn.experimental import enable_iterative_imputer  # noqa: F401
            from sklearn.impute import IterativeImputer
            from sklearn.ensemble import RandomForestRegressor
        except ImportError:
            # Fallback to median
            df[col_name] = df[col_name].fillna(df[col_name].median())
            return df

        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        if col_name not in numeric_cols:
            # MissForest only works on numeric - fallback to mode
            mode_vals = df[col_name].mode()
            if len(mode_vals) > 0:
                df[col_name] = df[col_name].fillna(mode_vals[0])
            return df

        estimator = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42,
            n_jobs=-1,
        )
        imputer = IterativeImputer(
            estimator=estimator,
            max_iter=10,
            random_state=42,
            initial_strategy="median",
        )

        df[numeric_cols] = imputer.fit_transform(df[numeric_cols])
        return df

    def _infer_gender_from_name(self, df, gender_col, name_col):
        """Infer gender from a name column using gender-guesser library."""
        if not name_col or name_col not in df.columns:
            # No name column available - fall back to mode
            mode_vals = df[gender_col].mode()
            if len(mode_vals) > 0:
                df[gender_col] = df[gender_col].fillna(mode_vals[0])
            return df

        try:
            import gender_guesser.detector as gender_detector
            detector = gender_detector.Detector()
        except ImportError:
            # Library not installed - fall back to mode
            mode_vals = df[gender_col].mode()
            if len(mode_vals) > 0:
                df[gender_col] = df[gender_col].fillna(mode_vals[0])
            return df

        # Detect existing gender format from non-null values
        existing = df[gender_col].dropna().astype(str).str.strip()
        male_label, female_label = self._detect_gender_format(existing)

        # Mode fallback for inconclusive predictions
        mode_val = None
        mode_vals = df[gender_col].mode()
        if len(mode_vals) > 0:
            mode_val = mode_vals[0]

        # Process rows with null gender but present name
        mask = df[gender_col].isna() & df[name_col].notna()
        for idx in df[mask].index:
            raw_name = str(df.loc[idx, name_col]).strip()
            # Extract first name (handles "Ahmed Ali" -> "Ahmed")
            first_name = raw_name.split()[0] if raw_name else ""
            if not first_name:
                if mode_val is not None:
                    df.loc[idx, gender_col] = mode_val
                continue

            # Capitalize for gender-guesser (expects "Ahmed" not "ahmed")
            first_name = first_name.capitalize()
            prediction = detector.get_gender(first_name)

            if prediction in ("male", "mostly_male"):
                df.loc[idx, gender_col] = male_label
            elif prediction in ("female", "mostly_female"):
                df.loc[idx, gender_col] = female_label
            else:
                # "andy" (androgynous) or "unknown" - fall back to mode
                if mode_val is not None:
                    df.loc[idx, gender_col] = mode_val

        return df

    def _detect_gender_format(self, existing_values):
        """Detect if the column uses 'Male'/'Female', 'M'/'F', 'male'/'female', etc."""
        if len(existing_values) == 0:
            return "Male", "Female"

        # Find actual casing from the data
        male_label = "Male"
        for val in existing_values:
            val_lower = val.lower()
            if val_lower in ("male", "m", "man"):
                male_label = val  # preserves original casing
                break

        female_label = "Female"
        for val in existing_values:
            val_lower = val.lower()
            if val_lower in ("female", "f", "woman"):
                female_label = val
                break

        return male_label, female_label


# ---------------------------------------------------------------------------
# 9. Unit Normalization
# ---------------------------------------------------------------------------

@register_action
class UnitNormalizationAction(BaseCleaningAction):
    action_type = "unit_normalization"
    is_heavy = False

    # Conversion factors to base units
    CONVERSIONS = {
        # Weight → grams
        "kg": ("g", 1000), "g": ("g", 1), "lb": ("g", 453.592),
        "oz": ("g", 28.3495),
        # Length → meters
        "km": ("m", 1000), "m": ("m", 1), "cm": ("m", 0.01),
        "mm": ("m", 0.001), "mi": ("m", 1609.34), "ft": ("m", 0.3048),
        "in": ("m", 0.0254),
        # Volume → milliliters
        "l": ("ml", 1000), "ml": ("ml", 1), "gal": ("ml", 3785.41),
    }

    _EXTRACT_RE = re.compile(r"^([\d.,]+)\s*([a-zA-Z%$€£]+)$")

    def execute(self, df, params):
        t0 = time.time()
        col_name = params.get("target_column")
        target_unit = params.get("target_unit")

        if not col_name or col_name not in df.columns:
            elapsed = int((time.time() - t0) * 1000)
            return df, self._make_report(
                self.action_type, col_name, 0, 0, [], [], elapsed,
                error="Column not found",
            )

        before_sample = df[col_name].dropna().head(5).tolist()
        cells_modified = 0

        def convert_value(val):
            nonlocal cells_modified
            if pd.isna(val):
                return val
            s = str(val).strip()
            match = self._EXTRACT_RE.match(s)
            if not match:
                return val
            try:
                num = self._parse_locale_number(match.group(1))
            except ValueError:
                return val
            unit = match.group(2).lower()

            if unit not in self.CONVERSIONS:
                return val

            base_unit, factor = self.CONVERSIONS[unit]
            base_value = num * factor

            if target_unit and target_unit.lower() in self.CONVERSIONS:
                _, target_factor = self.CONVERSIONS[target_unit.lower()]
                result = base_value / target_factor
            else:
                result = base_value
                target_unit_used = base_unit

            cells_modified += 1
            return round(result, 4)

        df[col_name] = df[col_name].apply(convert_value)
        after_sample = df[col_name].dropna().head(5).tolist()
        elapsed = int((time.time() - t0) * 1000)

        return df, self._make_report(
            self.action_type, col_name, cells_modified, cells_modified,
            before_sample, after_sample, elapsed,
        )

    @staticmethod
    def _parse_locale_number(s: str) -> float:
        """Parse a number string handling both thousands separators and
        European decimal commas.

        Examples:
          "1,000"    -> 1000.0   (comma as thousands separator)
          "1,5"      -> 1.5      (comma as decimal separator)
          "1.000,50" -> 1000.50  (European mixed format)
          "1000"     -> 1000.0
        """
        s = s.strip()
        # European mixed: periods as thousands, comma as decimal
        # e.g., "1.000,50"
        if "." in s and "," in s:
            if s.rindex(",") > s.rindex("."):
                # Comma is the decimal separator
                return float(s.replace(".", "").replace(",", "."))
            else:
                # Period is the decimal separator
                return float(s.replace(",", ""))

        # Only commas present
        if "," in s:
            parts = s.split(",")
            # Thousands separator: all parts after first have exactly 3 digits
            # e.g., "1,000" or "1,000,000"
            if all(len(p) == 3 for p in parts[1:]):
                return float(s.replace(",", ""))
            # Decimal separator: single comma with 1-2 digits after
            # e.g., "1,5" or "3,75"
            if len(parts) == 2 and len(parts[1]) <= 2:
                return float(s.replace(",", "."))
            # Ambiguous: default to thousands separator
            return float(s.replace(",", ""))

        return float(s)


# ---------------------------------------------------------------------------
# 10. Format Validation
# ---------------------------------------------------------------------------

@register_action
class FormatValidationAction(BaseCleaningAction):
    action_type = "format_validation"
    is_heavy = False

    _EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
    _PHONE_RE = re.compile(r"^[\+]?[\d\s\-\(\)]{7,20}$")
    _URL_RE = re.compile(r"^https?://[^\s]+$", re.IGNORECASE)

    def execute(self, df, params):
        t0 = time.time()
        col_name = params.get("target_column")
        format_type = params.get("format_type", "email")
        action = params.get("action", "flag")  # flag or remove

        if not col_name or col_name not in df.columns:
            elapsed = int((time.time() - t0) * 1000)
            return df, self._make_report(
                self.action_type, col_name, 0, 0, [], [], elapsed,
                error="Column not found",
            )

        regex = {
            "email": self._EMAIL_RE,
            "phone": self._PHONE_RE,
            "url": self._URL_RE,
        }.get(format_type, self._EMAIL_RE)

        before_sample = df[col_name].dropna().head(5).tolist()
        valid_mask = df[col_name].astype(str).str.strip().str.match(regex)
        valid_mask = valid_mask.fillna(False)
        invalid_count = int((~valid_mask & df[col_name].notna()).sum())

        if action == "flag":
            df[f"{col_name}_valid"] = valid_mask
            cells = invalid_count
            rows_affected = 0
        elif action == "remove":
            df = df[valid_mask | df[col_name].isna()].reset_index(drop=True)
            cells = invalid_count
            rows_affected = invalid_count
        else:
            cells = 0
            rows_affected = 0

        after_sample = df[col_name].dropna().head(5).tolist()
        elapsed = int((time.time() - t0) * 1000)

        return df, self._make_report(
            self.action_type, col_name, rows_affected, cells,
            before_sample, after_sample, elapsed,
        )


# ---------------------------------------------------------------------------
# 11. Impossible Value Detection
# ---------------------------------------------------------------------------

@register_action
class ImpossibleValueDetectionAction(BaseCleaningAction):
    action_type = "impossible_value_detection"
    is_heavy = False

    # Rules keyed by semantic_type
    _KNOWN_GENDERS = {
        "m", "f", "male", "female", "man", "woman",
        "non-binary", "nonbinary", "other", "prefer not to say",
        "unknown", "undisclosed",
    }

    def execute(self, df, params):
        t0 = time.time()
        col_name = params.get("target_column")
        semantic_type = params.get("semantic_type", "")
        strategy = params.get("strategy", "flag")  # flag or remove
        rules = params.get("rules", {})

        if not col_name or col_name not in df.columns:
            elapsed = int((time.time() - t0) * 1000)
            return df, self._make_report(
                self.action_type, col_name, 0, 0, [], [], elapsed,
                error="Column not found",
            )

        col = df[col_name]
        impossible_mask = self._detect(col, semantic_type)
        count = int(impossible_mask.sum())

        # Capture before samples from the impossible values
        bad_indices = col[impossible_mask].index[:5].tolist()
        before_sample = [col.iloc[i] for i in bad_indices] if bad_indices else col.dropna().head(5).tolist()
        before_sample = [
            float(v) if isinstance(v, (np.floating, np.integer)) else
            str(v) if not isinstance(v, (str, int, float, type(None))) else v
            for v in before_sample
        ]

        if strategy == "remove":
            df = df[~impossible_mask].reset_index(drop=True)
            after_sample = ["[removed]"] * len(before_sample)
            rows_affected = count
        else:
            # flag strategy: add boolean flag column AND nullify impossible
            # values so downstream actions (e.g. outlier capping) are not
            # polluted by logically impossible data.
            flag_col = f"{col_name}_impossible_flag"
            df[flag_col] = impossible_mask
            df.loc[impossible_mask, col_name] = np.nan
            after_sample = ["[flagged → NaN]"] * len(before_sample)
            rows_affected = 0

        elapsed = int((time.time() - t0) * 1000)
        return df, self._make_report(
            self.action_type, col_name, rows_affected, count,
            before_sample, after_sample, elapsed,
        )

    def _detect(self, col: pd.Series, semantic_type: str) -> pd.Series:
        """Return a boolean mask of impossible values."""
        mask = pd.Series(False, index=col.index)

        # For age/salary: coerce to numeric if column is object dtype
        if semantic_type in ("age", "salary"):
            numeric_col = col
            if not pd.api.types.is_numeric_dtype(col):
                numeric_col = pd.to_numeric(col, errors="coerce")
            if pd.api.types.is_numeric_dtype(numeric_col):
                if semantic_type == "age":
                    mask = ((numeric_col < 0) | (numeric_col > 150)) & numeric_col.notna()
                else:
                    mask = (numeric_col < 0) & numeric_col.notna()

        elif semantic_type == "dob":
            try:
                parsed = pd.to_datetime(col, errors="coerce")
                today = pd.Timestamp.now()
                mask = (parsed > today) & parsed.notna()
            except Exception:
                pass

        elif semantic_type == "gender":
            str_vals = col.astype(str).str.strip().str.lower()
            mask = ~str_vals.isin(self._KNOWN_GENDERS) & col.notna()

        elif pd.api.types.is_numeric_dtype(col) and not pd.api.types.is_bool_dtype(col):
            non_null = col.dropna()
            if len(non_null) >= 10:
                std = non_null.std()
                if std and std > 0:
                    skewness = non_null.skew()
                    if abs(skewness) < 3:
                        z = ((col - non_null.mean()) / std).abs()
                        mask = (z > 3.5) & col.notna()

        return mask


# ---------------------------------------------------------------------------
# Pipeline executor
# ---------------------------------------------------------------------------

def calculate_quality_score(
    df: pd.DataFrame,
    profiling_results: Optional[Dict[str, Any]] = None,
) -> int:
    """Calculate a 0-100 data quality score based on 6 dynamically-weighted dimensions.

    Uses profiling_results for deep analysis when available, falls back to
    DataFrame-only analysis for backward compatibility.
    """
    breakdown = _calculate_dimension_scores(df, profiling_results)
    return breakdown["overall_score"]


def _calculate_dimension_scores(
    df: pd.DataFrame,
    profiling_results: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Calculate per-dimension quality scores with full breakdown.

    Returns dict with: overall_score, dimensions (per-dimension detail), method.
    """
    total_rows = len(df)
    total_cols = len(df.columns)

    if total_rows == 0 or total_cols == 0:
        return {
            "overall_score": 100,
            "dimensions": {},
            "method": "empty_dataset",
        }

    use_profiling = profiling_results is not None
    cols_prof = profiling_results.get("columns", {}) if use_profiling else {}

    # --- 1. Completeness ---
    comp_scores = []
    for col in df.columns:
        null_pct = df[col].isnull().mean() * 100
        hidden_null_pct = 0.0
        if use_profiling and col in cols_prof:
            pns = cols_prof[col].get("potential_null_strings", {})
            hidden_count = sum(pns.values()) if isinstance(pns, dict) else 0
            non_null_count = df[col].notna().sum()
            if non_null_count > 0:
                hidden_null_pct = hidden_count / total_rows * 100
        comp_scores.append(max(0.0, 100 - null_pct - hidden_null_pct * 0.8))
    completeness_score = sum(comp_scores) / len(comp_scores) if comp_scores else 100.0

    # --- 2. Uniqueness ---
    dup_count = df.duplicated().sum()
    dup_pct = dup_count / total_rows * 100 if total_rows > 0 else 0
    fuzzy_penalty = 0.0
    if use_profiling:
        cols_with_similar = sum(
            1 for c in cols_prof.values() if c.get("similar_values")
        )
        fuzzy_penalty = cols_with_similar / max(total_cols, 1) * 15
    uniqueness_score = max(0.0, 100 - dup_pct - fuzzy_penalty)

    # --- 3. Consistency ---
    cons_scores = []
    for col in df.columns:
        penalty = 0.0
        # Case variation penalty (from profiling)
        if use_profiling and col in cols_prof:
            case_vars = cols_prof[col].get("case_variations", [])
            unique_count = cols_prof[col].get("unique_count", 1) or 1
            if case_vars:
                case_penalty = min(30.0, len(case_vars) / unique_count * 40)
                penalty += case_penalty
        # Mixed type penalty (always available)
        if not pd.api.types.is_numeric_dtype(df[col]) and not pd.api.types.is_datetime64_any_dtype(df[col]):
            non_null = df[col].dropna()
            if len(non_null) > 0:
                str_vals = non_null.astype(str)
                numeric_count = pd.to_numeric(str_vals, errors="coerce").notna().sum()
                type_mix_pct = numeric_count / len(str_vals)
                penalty += type_mix_pct * 30
        cons_scores.append(max(0.0, 100 - penalty))
    consistency_score = sum(cons_scores) / len(cons_scores) if cons_scores else 100.0

    # --- 4. Validity ---
    val_scores = []
    for col in df.columns:
        penalty = 0.0
        # Outlier penalty
        if use_profiling and col in cols_prof:
            outliers = cols_prof[col].get("outliers", {})
            iqr_count = outliers.get("iqr_count", 0)
            non_null_count = df[col].notna().sum()
            if non_null_count > 0 and iqr_count > 0:
                outlier_pct = iqr_count / non_null_count * 100
                penalty += min(40.0, outlier_pct * 3)
            # Impossible value penalty
            impossible = cols_prof[col].get("impossible_values", {})
            imp_count = impossible.get("count", 0)
            if imp_count > 0:
                imp_pct = imp_count / total_rows * 100
                penalty += min(40.0, imp_pct * 5)
        elif pd.api.types.is_numeric_dtype(df[col]) and not pd.api.types.is_bool_dtype(df[col]):
            # Fallback: IQR outlier check
            non_null = df[col].dropna()
            if len(non_null) >= 4:
                q1, q3 = non_null.quantile(0.25), non_null.quantile(0.75)
                iqr = q3 - q1
                if iqr > 0:
                    outlier_count = ((non_null < (q1 - 1.5 * iqr)) | (non_null > (q3 + 1.5 * iqr))).sum()
                    outlier_pct = outlier_count / len(non_null) * 100
                    penalty += min(40.0, outlier_pct * 3)
        if penalty > 0:
            val_scores.append(max(0.0, 100 - penalty))
    # Only score columns that have numeric/validity-relevant data
    if not val_scores:
        # No numeric columns at all - check if profiling has impossible values
        if use_profiling:
            any_impossible = any(
                c.get("impossible_values", {}).get("count", 0) > 0
                for c in cols_prof.values()
            )
            validity_score = 80.0 if any_impossible else 100.0
        else:
            validity_score = 100.0
    else:
        validity_score = sum(val_scores) / len(val_scores)

    # --- 5. Structural ---
    if use_profiling:
        issues_count = sum(
            1 for c in cols_prof.values()
            if c.get("column_name_issues", {}).get("has_spaces")
            or c.get("column_name_issues", {}).get("has_special_chars")
            or c.get("column_name_issues", {}).get("starts_with_digit")
        )
        issue_pct = issues_count / max(total_cols, 1) * 100
        structural_score = max(0.0, 100 - issue_pct * 0.5)
    else:
        # Fallback: check column names directly
        import re
        issues = sum(
            1 for c in df.columns
            if " " in str(c) or re.search(r"[^a-zA-Z0-9_]", str(c)) or str(c)[:1].isdigit()
        )
        structural_score = max(0.0, 100 - issues / max(total_cols, 1) * 50)

    # --- 6. Semantic ---
    sem_scores = []
    if use_profiling:
        for col_name, cp in cols_prof.items():
            sem = cp.get("semantic_type", "")
            patterns = cp.get("patterns", {})
            non_null_count = total_rows - cp.get("null_count", 0)
            if non_null_count <= 0:
                continue

            if sem == "email" and patterns.get("email_count", 0) > 0:
                match_pct = patterns["email_count"] / non_null_count * 100
                sem_scores.append(min(100.0, match_pct))
            elif sem == "phone" and patterns.get("phone_count", 0) > 0:
                match_pct = patterns["phone_count"] / non_null_count * 100
                sem_scores.append(min(100.0, match_pct))
            elif sem == "url" and patterns.get("url_count", 0) > 0:
                match_pct = patterns["url_count"] / non_null_count * 100
                sem_scores.append(min(100.0, match_pct))

    semantic_score = sum(sem_scores) / len(sem_scores) if sem_scores else 100.0

    # --- Dynamic Weights ---
    raw_dims = {
        "completeness": completeness_score,
        "uniqueness": uniqueness_score,
        "consistency": consistency_score,
        "validity": validity_score,
        "structural": structural_score,
        "semantic": semantic_score,
    }

    weights = _compute_dynamic_weights(raw_dims, profiling_results)

    # Build dimension breakdown
    dimensions = {}
    for dim_name, score in raw_dims.items():
        w = weights[dim_name]
        dimensions[dim_name] = {
            "score": round(score, 1),
            "weight": round(w, 1),
            "weighted_score": round(score * w / 100, 2),
        }

    overall = sum(d["weighted_score"] for d in dimensions.values())
    overall = max(0, min(100, round(overall)))

    return {
        "overall_score": overall,
        "dimensions": dimensions,
        "method": "profiling_enhanced" if use_profiling else "dataframe_only",
    }


def _compute_dynamic_weights(
    dim_scores: Dict[str, float],
    profiling_results: Optional[Dict[str, Any]] = None,
) -> Dict[str, float]:
    """Compute dimension weights adapted to the data profile.

    Dimensions with detected issues get higher weight.
    Weights are normalized to sum to 100, clamped [8, 30].
    """
    cols_prof = (profiling_results or {}).get("columns", {})
    total_cols = len(cols_prof) if cols_prof else 1

    # Base relevance (10 each) + bonus for detected issues (up to +10)
    relevance = {}
    for dim_name, score in dim_scores.items():
        base = 10.0
        # Lower scores = more issues = deserves more weight
        issue_bonus = max(0.0, (100 - score) / 100 * 10)
        relevance[dim_name] = base + issue_bonus

    # Reduce structural/semantic weight if they have no issues
    if dim_scores.get("structural", 100) >= 99:
        relevance["structural"] = 5.0
    if dim_scores.get("semantic", 100) >= 99:
        relevance["semantic"] = 5.0

    # Normalize to sum to 100
    total = sum(relevance.values())
    if total == 0:
        return {k: 100 / len(relevance) for k in relevance}

    weights = {k: v / total * 100 for k, v in relevance.items()}

    # Clamp [8, 30]
    for k in weights:
        weights[k] = max(8.0, min(30.0, weights[k]))

    # Re-normalize after clamping
    total = sum(weights.values())
    weights = {k: v / total * 100 for k, v in weights.items()}

    return weights


def _build_rename_map(original_cols: List[str], new_cols: List[str]) -> Dict[str, str]:
    """Build a mapping from original column names to their normalized forms."""
    return {
        str(old): new
        for old, new in zip(original_cols, new_cols)
        if str(old) != new
    }


def execute_cleaning_plan(
    df: pd.DataFrame,
    plan_actions: List[Dict[str, Any]],
    progress_callback: Optional[Callable[[int, str], None]] = None,
    profiling_results: Optional[Dict[str, Any]] = None,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Execute a list of cleaning actions sequentially.

    After column_name_normalization runs, subsequent actions have their
    target_column references updated to match the renamed columns.

    Returns (cleaned_df, cleaning_report_dict).
    """
    total = len(plan_actions)
    action_reports: List[Dict[str, Any]] = []
    # Ensure we work on an owned copy to avoid SettingWithCopyWarning issues
    df = df.copy()
    # Capture pre-cleaning state for post-cleaning validation
    df_before = df.copy()
    rows_before = len(df)
    quality_before = calculate_quality_score(df, profiling_results)
    breakdown_before = _calculate_dimension_scores(df, profiling_results)
    total_cells = 0
    pipeline_start = time.time()

    # Track column renames so later actions target the correct column
    col_rename_map: Dict[str, str] = {}

    for i, action_dict in enumerate(plan_actions):
        action_type = action_dict.get("action_type", "")
        params = dict(action_dict.get("parameters", {}))
        target_col = action_dict.get("target_column")

        # Remap target_column if it was previously renamed
        if target_col and target_col in col_rename_map:
            target_col = col_rename_map[target_col]

        if target_col:
            params["target_column"] = target_col

        # Capture columns before execution for rename detection
        cols_before = list(df.columns)

        handler_cls = ACTIONS_REGISTRY.get(action_type)
        if not handler_cls:
            action_reports.append({
                "action_type": action_type,
                "target_column": target_col,
                "success": False,
                "rows_affected": 0,
                "cells_modified": 0,
                "before_sample": [],
                "after_sample": [],
                "execution_time_ms": 0,
                "error_message": f"Unknown action type: {action_type}",
            })
            continue

        handler = handler_cls()
        try:
            df, report = handler.execute(df, params)
            action_reports.append(report.model_dump())
            total_cells += report.cells_modified

            # After column_name_normalization, update the rename map
            if action_type == "column_name_normalization":
                cols_after = list(df.columns)
                if len(cols_before) == len(cols_after):
                    col_rename_map.update(_build_rename_map(cols_before, cols_after))

        except Exception as e:
            action_reports.append({
                "action_type": action_type,
                "target_column": target_col,
                "success": False,
                "rows_affected": 0,
                "cells_modified": 0,
                "before_sample": [],
                "after_sample": [],
                "execution_time_ms": 0,
                "error_message": str(e),
            })

        if progress_callback:
            pct = int((i + 1) / total * 100)
            progress_callback(pct, action_type)

    quality_after = calculate_quality_score(df)
    breakdown_after = _calculate_dimension_scores(df)
    pipeline_elapsed = round(time.time() - pipeline_start, 2)

    # Post-cleaning validation
    validation_result = None
    distribution_shifts = None
    try:
        from app.services.post_cleaning_validator import PostCleaningValidator

        validator = PostCleaningValidator()
        validation_result = validator.validate(df_before, df, action_reports)
        distribution_shifts = validation_result.get("distribution_shifts")
    except Exception:
        pass  # Validation is best-effort, don't block the pipeline

    cleaning_report = {
        "actions": action_reports,
        "total_rows_before": rows_before,
        "total_rows_after": len(df),
        "total_cells_modified": total_cells,
        "quality_score_before": quality_before,
        "quality_score_after": quality_after,
        "quality_breakdown_before": breakdown_before,
        "quality_breakdown_after": breakdown_after,
        "execution_time_seconds": pipeline_elapsed,
        "validation_result": validation_result,
        "distribution_shifts": distribution_shifts,
    }

    return df, cleaning_report
