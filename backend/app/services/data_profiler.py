"""Data profiling service - generates statistics for pandas DataFrames.

Enhanced with pattern detection, outlier analysis, null-string detection,
case variation detection, similar value grouping, semantic type inference,
distribution statistics, impossible value detection, and cross-column
hints for the advanced cleaning engine.
"""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

import numpy as np
import pandas as pd

from app.utils.json_serializer import safe_numeric

# Strings commonly used to represent null/missing values
NULL_LIKE_STRINGS: Set[str] = {
    "", " ", "N/A", "NA", "n/a", "na", "N/a",
    "null", "NULL", "Null",
    "None", "none", "NONE",
    "NaN", "nan", "NAN",
    "-", "--", ".", "..",
    "missing", "MISSING", "Missing",
    "undefined", "UNDEFINED",
    "#N/A", "#NA", "#NULL!",
}

# Regex patterns for format detection
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
_PHONE_RE = re.compile(r"^[\+]?[\d\s\-\(\)]{7,20}$")
_URL_RE = re.compile(r"^https?://[^\s]+$", re.IGNORECASE)
_UNIT_RE = re.compile(r"^[\d.,]+\s*(kg|g|lb|oz|km|m|cm|mm|mi|ft|in|l|ml|gal|%|\$|€|£)$", re.IGNORECASE)

# Common date format patterns to test
_DATE_FORMATS = [
    "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d",
    "%d-%m-%Y", "%m-%d-%Y",
    "%d.%m.%Y", "%Y.%m.%d",
    "%b %d, %Y", "%B %d, %Y",
    "%d %b %Y", "%d %B %Y",
    "%Y-%m-%d %H:%M:%S", "%m/%d/%Y %H:%M:%S",
]

# Semantic type inference rules (column name regex -> semantic type)
_SEMANTIC_NAME_RULES: List[tuple] = [
    (re.compile(r"\bage\b|\bage_|\bage$", re.IGNORECASE), "age"),
    (re.compile(r"salary|wage|income|pay|compensation|earning", re.IGNORECASE), "salary"),
    (re.compile(r"email|e_mail|mail", re.IGNORECASE), "email"),
    (re.compile(r"phone|mobile|tel|fax|cell", re.IGNORECASE), "phone"),
    (re.compile(r"gender|sex\b", re.IGNORECASE), "gender"),
    (re.compile(r"birth|dob|born|date_of_birth", re.IGNORECASE), "dob"),
    (re.compile(r"zip|postal", re.IGNORECASE), "zip"),
    (re.compile(r"country|nation", re.IGNORECASE), "country"),
    (re.compile(r"date|time|_at\b|_on\b|created|updated|timestamp", re.IGNORECASE), "date"),
    (re.compile(r"url|website|link|href", re.IGNORECASE), "url"),
    (re.compile(r"\bfirst_?name\b|\bgiven_?name\b|\bfname\b", re.IGNORECASE), "person_name"),
    (re.compile(r"\bfull_?name\b|\bname\b", re.IGNORECASE), "person_name"),
]

# Known gender values for impossible value detection
_KNOWN_GENDERS: Set[str] = {
    "m", "f", "male", "female", "man", "woman",
    "non-binary", "nonbinary", "other", "prefer not to say",
    "unknown", "undisclosed",
}


def profile_dataframe(df: pd.DataFrame) -> Dict[str, Any]:
    """Generate comprehensive profiling results for a DataFrame."""
    columns_profile: Dict[str, Any] = {}
    duplicates_count = int(df.duplicated().sum())

    for col_name in df.columns:
        col = df[col_name]
        profile = _profile_column(col, col_name)
        # Inject total_count for decision engine use
        profile["total_count"] = len(col)
        columns_profile[col_name] = profile

    # Cross-column analysis (requires all per-column profiles to be built)
    cross_column_hints = _detect_cross_column_hints(df, columns_profile)

    memory_mb = round(df.memory_usage(deep=True).sum() / (1024 * 1024), 2)

    return {
        "columns": columns_profile,
        "total_rows": len(df),
        "total_columns": len(df.columns),
        "memory_mb": memory_mb,
        "duplicates_count": duplicates_count,
        "cross_column_hints": cross_column_hints,
    }


def _profile_column(col: pd.Series, col_name: str = "") -> Dict[str, Any]:
    """Profile a single column with enhanced detection."""
    null_count = int(col.isna().sum())
    total = len(col)
    null_pct = round((null_count / total * 100) if total > 0 else 0, 2)
    unique_count = int(col.nunique())

    profile: Dict[str, Any] = {
        "dtype": str(col.dtype),
        "null_count": null_count,
        "null_pct": null_pct,
        "unique_count": unique_count,
    }

    non_null = col.dropna()

    # Column name quality analysis
    profile["column_name_issues"] = _detect_column_name_issues(col_name)

    if pd.api.types.is_numeric_dtype(col) and not pd.api.types.is_bool_dtype(col):
        _add_numeric_stats(profile, non_null)
        _add_outlier_stats(profile, non_null)
        _add_distribution_stats(profile, non_null)
        _add_normality_test(profile, non_null)
    elif pd.api.types.is_datetime64_any_dtype(col):
        _add_datetime_stats(profile, non_null)
    else:
        _add_categorical_stats(profile, non_null)
        _add_null_string_detection(profile, non_null)
        _add_pattern_detection(profile, non_null)
        _add_case_variation_detection(profile, non_null)
        _add_similar_value_detection(profile, non_null)

    # Semantic type inference (runs for all column types)
    profile["semantic_type"] = _infer_semantic_type(col_name, profile, non_null)

    # Impossible value detection (runs after semantic type is known)
    _detect_impossible_values(profile, non_null)

    return profile


# ---------------------------------------------------------------------------
# Original stats (preserved)
# ---------------------------------------------------------------------------

def _add_numeric_stats(profile: Dict[str, Any], col: pd.Series) -> None:
    """Add numeric statistics to profile."""
    if len(col) == 0:
        return
    profile["min"] = safe_numeric(col.min())
    profile["max"] = safe_numeric(col.max())
    profile["mean"] = safe_numeric(col.mean())
    profile["median"] = safe_numeric(col.median())
    profile["std"] = safe_numeric(col.std())


def _add_datetime_stats(profile: Dict[str, Any], col: pd.Series) -> None:
    """Add datetime statistics to profile."""
    if len(col) == 0:
        return
    profile["min"] = str(col.min())
    profile["max"] = str(col.max())
    delta = col.max() - col.min()
    profile["range_days"] = int(delta.days) if hasattr(delta, "days") else 0


def _add_categorical_stats(profile: Dict[str, Any], col: pd.Series) -> None:
    """Add categorical/string statistics to profile."""
    if len(col) == 0:
        return
    value_counts = col.value_counts().head(10)
    profile["top_values"] = [
        {"value": str(val), "count": int(cnt)}
        for val, cnt in value_counts.items()
    ]
    str_col = col.astype(str)
    profile["avg_length"] = safe_numeric(str_col.str.len().mean())


# ---------------------------------------------------------------------------
# Enhanced detection functions
# ---------------------------------------------------------------------------

def _detect_column_name_issues(col_name: str) -> Dict[str, Any]:
    """Detect quality issues in a column name."""
    name = str(col_name)
    has_spaces = " " in name
    has_special = bool(re.search(r"[^\w\s]", name))
    starts_digit = bool(name and name[0].isdigit())

    # Generate suggested clean name
    suggested = re.sub(r"[^\w]", "_", name.strip())
    suggested = re.sub(r"_+", "_", suggested).strip("_").lower()
    if not suggested or suggested[0].isdigit():
        suggested = f"col_{suggested}"

    return {
        "has_spaces": has_spaces,
        "has_special_chars": has_special,
        "starts_with_digit": starts_digit,
        "suggested": suggested,
    }


def _add_outlier_stats(profile: Dict[str, Any], col: pd.Series) -> None:
    """Detect outlier counts using IQR and Z-score methods."""
    if len(col) < 4:
        profile["outliers"] = {"iqr_count": 0, "zscore_count": 0}
        return

    # IQR method
    q1 = col.quantile(0.25)
    q3 = col.quantile(0.75)
    iqr = q3 - q1
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    iqr_count = int(((col < lower) | (col > upper)).sum())

    # Z-score method
    std = col.std()
    zscore_count = 0
    if std and std > 0:
        z_scores = ((col - col.mean()) / std).abs()
        zscore_count = int((z_scores > 3).sum())

    profile["outliers"] = {
        "iqr_count": iqr_count,
        "zscore_count": zscore_count,
    }


def _add_distribution_stats(profile: Dict[str, Any], col: pd.Series) -> None:
    """Add distribution shape statistics (skewness, kurtosis) to profile."""
    if len(col) < 10:
        profile["skewness"] = None
        profile["kurtosis"] = None
        profile["best_fit_distribution"] = None
        return
    profile["skewness"] = safe_numeric(col.skew())
    profile["kurtosis"] = safe_numeric(col.kurt())

    # Best-fit distribution detection
    try:
        from scipy.stats import norm, lognorm, expon

        best_fit = None
        best_ks = 1.0  # worst case
        for dist in [norm, lognorm, expon]:
            try:
                params = dist.fit(col.dropna())
                from scipy.stats import kstest

                stat, _ = kstest(col.dropna(), dist.cdf, args=params)
                if stat < best_ks:
                    best_ks = stat
                    best_fit = dist.name
            except Exception:
                pass
        profile["best_fit_distribution"] = best_fit
    except ImportError:
        profile["best_fit_distribution"] = None


def _add_normality_test(profile: Dict[str, Any], non_null: pd.Series) -> None:
    """Run normality test (Shapiro-Wilk or D'Agostino) on numeric column."""
    if len(non_null) < 8:
        profile["normality_test"] = {"method": "skipped", "is_normal": None}
        return

    try:
        if len(non_null) > 5000:
            from scipy.stats import normaltest

            sample = non_null.sample(5000, random_state=42)
            stat, p_value = normaltest(sample)
            profile["normality_test"] = {
                "method": "dagostino",
                "statistic": float(stat),
                "p_value": float(p_value),
                "is_normal": p_value > 0.05,
            }
        else:
            from scipy.stats import shapiro

            stat, p_value = shapiro(non_null)
            profile["normality_test"] = {
                "method": "shapiro",
                "statistic": float(stat),
                "p_value": float(p_value),
                "is_normal": p_value > 0.05,
            }
    except ImportError:
        profile["normality_test"] = {"method": "skipped", "is_normal": None}


def _add_null_string_detection(profile: Dict[str, Any], col: pd.Series) -> None:
    """Detect string values that likely represent null/missing."""
    if len(col) == 0:
        profile["potential_null_strings"] = {}
        return

    str_vals = col.astype(str).str.strip()
    found: Dict[str, int] = {}
    for null_str in NULL_LIKE_STRINGS:
        count = int((str_vals == null_str).sum())
        if count > 0:
            found[null_str] = count

    profile["potential_null_strings"] = found


def _stratified_sample(col: pd.Series, n: int = 1000) -> pd.Series:
    """Stratified sample: head + tail + random middle + null neighbors."""
    if len(col) <= n:
        return col.astype(str).str.strip()

    chunk = n // 4
    head = col.head(chunk)
    tail = col.tail(chunk)

    # Random middle
    middle_start = chunk
    middle_end = len(col) - chunk
    if middle_end > middle_start:
        middle_indices = np.random.RandomState(42).choice(
            range(middle_start, middle_end),
            size=min(chunk, middle_end - middle_start),
            replace=False,
        )
        middle = col.iloc[middle_indices]
    else:
        middle = pd.Series(dtype=col.dtype)

    # Rows near nulls (important for pattern detection)
    null_indices = col[col.isna()].index
    if len(null_indices) > 0:
        neighbors = set()
        for idx in list(null_indices)[:chunk]:
            try:
                pos = col.index.get_loc(idx)
            except KeyError:
                continue
            for offset in [-1, 1]:
                neighbor_pos = pos + offset
                if 0 <= neighbor_pos < len(col):
                    neighbors.add(col.index[neighbor_pos])
        null_neighbors = col.loc[list(neighbors)[:chunk]]
    else:
        null_neighbors = col.sample(min(chunk, len(col)), random_state=42)

    combined = pd.concat([head, tail, middle, null_neighbors]).drop_duplicates()
    return combined.astype(str).str.strip().head(n)


def _add_pattern_detection(profile: Dict[str, Any], col: pd.Series) -> None:
    """Detect email, phone, URL, date, and unit patterns in string columns."""
    if len(col) == 0:
        profile["patterns"] = {
            "email_count": 0, "phone_count": 0, "url_count": 0,
            "date_formats": [], "unit_suffixes": [],
        }
        return

    # Sample for performance (stratified sampling for representativeness)
    sample = _stratified_sample(col, 1000)

    email_count = int(sample.str.match(_EMAIL_RE).sum())
    phone_count = int(sample.str.match(_PHONE_RE).sum())
    url_count = int(sample.str.match(_URL_RE).sum())

    # Detect date formats (primary = >50% match, secondary = any match >=1 row)
    date_formats: List[str] = []
    date_formats_all: List[str] = []
    date_sample = sample.head(50)
    for fmt in _DATE_FORMATS:
        try:
            parsed = pd.to_datetime(date_sample, format=fmt, errors="coerce")
            match_count = int(parsed.notna().sum())
            if match_count > 0:
                date_formats_all.append(fmt)
            if match_count / len(date_sample) > 0.5:
                date_formats.append(fmt)
        except Exception:
            pass
    # If we found a primary format, also report minority formats
    if date_formats and len(date_formats_all) > len(date_formats):
        date_formats = date_formats_all

    # Detect unit suffixes
    unit_matches = sample.str.extract(_UNIT_RE, expand=False)
    unit_suffixes: List[str] = []
    if unit_matches is not None and hasattr(unit_matches, "dropna"):
        # extract returns a DataFrame when there's a group; get first column
        if isinstance(unit_matches, pd.DataFrame):
            unit_matches = unit_matches.iloc[:, 0]
        units_found = unit_matches.dropna().str.lower().unique().tolist()
        unit_suffixes = units_found[:10]

    profile["patterns"] = {
        "email_count": email_count,
        "phone_count": phone_count,
        "url_count": url_count,
        "date_formats": date_formats,
        "unit_suffixes": unit_suffixes,
    }


def _add_case_variation_detection(profile: Dict[str, Any], col: pd.Series) -> None:
    """Detect values that differ only by case (e.g., 'NY' vs 'ny' vs 'Ny')."""
    if len(col) == 0:
        profile["case_variations"] = []
        return

    unique_vals = col.astype(str).str.strip().unique()
    if len(unique_vals) > 200:
        # Too many unique values, skip for performance
        profile["case_variations"] = []
        return

    groups: Dict[str, List[str]] = {}
    for val in unique_vals:
        key = str(val).lower().strip()
        if key not in groups:
            groups[key] = []
        if str(val) not in groups[key]:
            groups[key].append(str(val))

    # Only report groups where the same lowercased value has multiple forms
    variations = [forms for forms in groups.values() if len(forms) > 1]
    profile["case_variations"] = variations[:20]  # limit output size


def _add_similar_value_detection(profile: Dict[str, Any], col: pd.Series) -> None:
    """Detect similar but not identical values using fuzzy matching."""
    if len(col) == 0:
        profile["similar_values"] = []
        return

    unique_vals = col.astype(str).str.strip().unique()
    if len(unique_vals) > 100 or len(unique_vals) < 2:
        profile["similar_values"] = []
        return

    try:
        from rapidfuzz import fuzz
    except ImportError:
        profile["similar_values"] = []
        return

    seen: set = set()
    similar_groups: List[List[str]] = []

    vals_list = [str(v) for v in unique_vals]
    for i, val_a in enumerate(vals_list):
        if val_a in seen:
            continue
        group = [val_a]
        for j in range(i + 1, len(vals_list)):
            val_b = vals_list[j]
            if val_b in seen:
                continue
            # Skip if they're just case variations (handled separately)
            if val_a.lower().strip() == val_b.lower().strip():
                continue
            score = fuzz.ratio(val_a.lower(), val_b.lower())
            if score >= 85:
                group.append(val_b)
                seen.add(val_b)
        if len(group) > 1:
            similar_groups.append(group)
            seen.add(val_a)

    profile["similar_values"] = similar_groups[:20]


# ---------------------------------------------------------------------------
# Semantic type inference
# ---------------------------------------------------------------------------

def _infer_semantic_type(
    col_name: str, profile: Dict[str, Any], non_null: pd.Series,
) -> str:
    """Infer the semantic meaning of a column using name heuristics, value
    patterns, and dtype fallback.  Returns a string label such as 'age',
    'email', 'salary', 'categorical', etc."""
    name_lower = str(col_name).lower().replace(" ", "_")

    # 1. Column-name heuristics (highest priority)
    for regex, sem_type in _SEMANTIC_NAME_RULES:
        if regex.search(name_lower):
            return sem_type

    # 2. Value-pattern heuristics (from profiler pattern detection)
    patterns = profile.get("patterns", {})
    sample_size = max(len(non_null.head(1000)), 1)
    if patterns:
        email_ratio = patterns.get("email_count", 0) / sample_size
        phone_ratio = patterns.get("phone_count", 0) / sample_size
        url_ratio = patterns.get("url_count", 0) / sample_size
        if email_ratio > 0.8:
            return "email"
        if url_ratio > 0.8:
            return "url"
        if phone_ratio > 0.8:
            return "phone"
        if patterns.get("date_formats"):
            return "date"

    # 3. Dtype fallback
    if pd.api.types.is_bool_dtype(non_null):
        return "boolean"
    if pd.api.types.is_datetime64_any_dtype(non_null):
        return "datetime"
    if pd.api.types.is_numeric_dtype(non_null):
        return "numeric"
    # Low-cardinality text -> categorical
    unique_count = profile.get("unique_count", 0)
    total = len(non_null)
    if total > 0 and unique_count <= 30:
        return "categorical"
    return "text"


# ---------------------------------------------------------------------------
# Impossible value detection
# ---------------------------------------------------------------------------

def _detect_impossible_values(
    profile: Dict[str, Any], non_null: pd.Series,
) -> None:
    """Detect values that are logically impossible based on the inferred
    semantic type.  Populates ``profile["impossible_values"]``."""
    sem_type = profile.get("semantic_type", "")
    impossible: Dict[str, Any] = {"count": 0, "examples": [], "rule": ""}

    if len(non_null) == 0:
        profile["impossible_values"] = impossible
        return

    # For age/salary: coerce to numeric if column was read as object dtype
    if sem_type in ("age", "salary"):
        numeric_vals = non_null
        if not pd.api.types.is_numeric_dtype(non_null):
            numeric_vals = pd.to_numeric(non_null, errors="coerce").dropna()
        if len(numeric_vals) > 0 and pd.api.types.is_numeric_dtype(numeric_vals):
            if sem_type == "age":
                mask = (numeric_vals < 0) | (numeric_vals > 150)
                rule = "age < 0 or age > 150"
            else:
                mask = numeric_vals < 0
                rule = "salary < 0"
            bad = numeric_vals[mask]
            impossible["count"] = int(len(bad))
            impossible["examples"] = [safe_numeric(v) for v in bad.head(10).tolist()]
            impossible["rule"] = rule

    elif sem_type == "dob":
        # Try to parse as dates and check for future dates
        try:
            parsed = pd.to_datetime(non_null, errors="coerce")
            today = pd.Timestamp(datetime.now())
            future_mask = parsed > today
            bad = non_null[future_mask & parsed.notna()]
            impossible["count"] = int(len(bad))
            impossible["examples"] = [str(v) for v in bad.head(10).tolist()]
            impossible["rule"] = "date of birth in the future"
        except Exception:
            pass

    elif sem_type == "gender":
        str_vals = non_null.astype(str).str.strip().str.lower()
        mask = ~str_vals.isin(_KNOWN_GENDERS)
        bad = non_null[mask]
        impossible["count"] = int(len(bad))
        impossible["examples"] = [str(v) for v in bad.unique()[:10].tolist()]
        impossible["rule"] = "value not in known gender set"

    elif pd.api.types.is_numeric_dtype(non_null) and not pd.api.types.is_bool_dtype(non_null) and len(non_null) >= 10:
        # Generic numeric: flag values beyond 3.5 std deviations
        # but only when distribution is not heavily skewed
        skewness = profile.get("skewness")
        if skewness is not None and abs(skewness) < 3:
            mean = non_null.mean()
            std = non_null.std()
            if std and std > 0:
                z = ((non_null - mean) / std).abs()
                mask = z > 3.5
                bad = non_null[mask]
                impossible["count"] = int(len(bad))
                impossible["examples"] = [safe_numeric(v) for v in bad.head(10).tolist()]
                impossible["rule"] = "value beyond 3.5 standard deviations from mean"

    profile["impossible_values"] = impossible


# ---------------------------------------------------------------------------
# Cross-column hints
# ---------------------------------------------------------------------------

def _detect_cross_column_hints(
    df: pd.DataFrame, columns_profile: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Detect cross-column relationships such as temporal ordering violations
    (e.g. hire_date should be after birth_date)."""
    hints: List[Dict[str, Any]] = []

    # Collect columns with date-related semantic types
    date_cols = [
        col_name for col_name, prof in columns_profile.items()
        if prof.get("semantic_type") in ("date", "dob", "datetime")
    ]

    if len(date_cols) < 2:
        pass  # Skip temporal checks but continue to name-gender hints
    else:
        # Known temporal orderings: (earlier_col_pattern, later_col_pattern)
        ordering_patterns = [
            (re.compile(r"birth|dob|born", re.IGNORECASE),
             re.compile(r"hire|join|start|enroll|register", re.IGNORECASE)),
            (re.compile(r"start|begin|open", re.IGNORECASE),
             re.compile(r"end|close|finish|complete", re.IGNORECASE)),
            (re.compile(r"create|register", re.IGNORECASE),
             re.compile(r"update|modif|last", re.IGNORECASE)),
        ]

        for earlier_re, later_re in ordering_patterns:
            earlier_matches = [c for c in date_cols if earlier_re.search(c)]
            later_matches = [c for c in date_cols if later_re.search(c)]

            for col_a in earlier_matches:
                for col_b in later_matches:
                    if col_a == col_b:
                        continue
                    try:
                        dates_a = pd.to_datetime(df[col_a], errors="coerce")
                        dates_b = pd.to_datetime(df[col_b], errors="coerce")
                        both_valid = dates_a.notna() & dates_b.notna()
                        if both_valid.sum() == 0:
                            continue
                        violations = (dates_b[both_valid] < dates_a[both_valid]).sum()
                        violation_pct = round(
                            float(violations) / float(both_valid.sum()) * 100, 2,
                        )
                        if violations > 0:
                            hints.append({
                                "col_a": col_a,
                                "col_b": col_b,
                                "hint_type": "temporal_ordering",
                                "violation_count": int(violations),
                                "violation_pct": violation_pct,
                            })
                    except Exception:
                        continue

    # Detect name-gender column pairs for smart gender imputation
    name_cols = [
        col_name for col_name, prof in columns_profile.items()
        if prof.get("semantic_type") == "person_name"
    ]
    gender_cols = [
        col_name for col_name, prof in columns_profile.items()
        if prof.get("semantic_type") == "gender"
    ]
    for nc in name_cols:
        for gc in gender_cols:
            hints.append({
                "hint_type": "name_gender_pair",
                "name_col": nc,
                "gender_col": gc,
            })

    return hints
