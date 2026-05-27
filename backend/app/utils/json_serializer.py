"""Centralized JSON-safe serializer for numpy/pandas values.

Every endpoint that returns DataFrame-derived rows or profiling statistics
should funnel values through ``to_native()`` (scalars) or
``rows_to_json_safe()`` (whole DataFrames) to guarantee that the result
can be passed to ``json.dumps()`` without raising on NaN / Inf / NaT.
"""

import datetime
import math
from typing import Any, List

import numpy as np
import pandas as pd


def to_native(val: Any) -> Any:
    """Convert a single numpy / pandas value to a JSON-safe Python primitive.

    Handles:
    - np.nan, float('nan'), pd.NA, pd.NaT  -> None
    - +inf / -inf                           -> None
    - np.integer                            -> int
    - np.floating                           -> float
    - np.bool_                              -> bool
    - np.ndarray                            -> list
    - pd.Timestamp / datetime               -> ISO-8601 string
    - date                                  -> ISO-8601 string
    """
    # --- None / NA / NaT ------------------------------------------------
    if val is None:
        return None

    if isinstance(val, type(pd.NaT)):
        return None

    # pd.isna covers np.nan, pd.NA, pd.NaT (but raises on some types)
    try:
        if pd.isna(val):
            return None
    except (ValueError, TypeError):
        pass

    # --- numpy scalar types ---------------------------------------------
    if isinstance(val, np.floating):
        if np.isnan(val) or np.isinf(val):
            return None
        return float(val)

    if isinstance(val, np.integer):
        return int(val)

    if isinstance(val, np.bool_):
        return bool(val)

    if isinstance(val, np.ndarray):
        return [to_native(v) for v in val.tolist()]

    # --- native float (may still be nan/inf) ----------------------------
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return val

    # --- datetime / date ------------------------------------------------
    if isinstance(val, pd.Timestamp):
        return val.isoformat()

    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.isoformat()

    return val


def safe_numeric(val: Any) -> Any:
    """Like ``to_native`` but also rounds float results to 4 decimal places.

    Intended for profiling statistics (mean, median, std, etc.).
    """
    result = to_native(val)
    if isinstance(result, float):
        return round(result, 4)
    return result


def sanitize_profile(obj: Any) -> Any:
    """Recursively convert all numpy/pandas types in a nested dict/list to
    JSON-safe Python primitives.  Intended for profiling result dicts before
    storing them as JSONB in the database."""
    if isinstance(obj, dict):
        return {k: sanitize_profile(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_profile(v) for v in obj]
    if isinstance(obj, tuple):
        return [sanitize_profile(v) for v in obj]
    return to_native(obj)


def rows_to_json_safe(df: pd.DataFrame, limit: int | None = None) -> List[List[Any]]:
    """Convert DataFrame rows to a JSON-safe list-of-lists.

    Uses ``iterrows()`` + ``to_native()`` per cell to avoid the pitfalls of
    ``DataFrame.where(pd.notnull(...), None).values.tolist()`` which can
    leave native ``float('nan')`` values that break ``json.dumps()``.
    """
    target = df.head(limit) if limit is not None else df
    rows: List[List[Any]] = []
    for _, row in target.iterrows():
        rows.append([to_native(v) for v in row.values])
    return rows
