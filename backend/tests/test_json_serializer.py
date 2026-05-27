"""Regression tests for app.utils.json_serializer.

Verifies that every flavour of NaN, Infinity, NaT and numpy scalar type
is converted to a JSON-safe Python primitive so that ``json.dumps()``
never raises ``ValueError: Out of range float values are not JSON compliant``.
"""

import datetime
import json
import math

import numpy as np
import pandas as pd
import pytest

from app.utils.json_serializer import to_native, safe_numeric, rows_to_json_safe


# ---------------------------------------------------------------------------
# to_native: scalar conversion
# ---------------------------------------------------------------------------

class TestToNative:

    @pytest.mark.parametrize("val", [
        np.nan,
        float("nan"),
        pd.NA,
        pd.NaT,
        None,
    ])
    def test_missing_values_become_none(self, val):
        assert to_native(val) is None

    @pytest.mark.parametrize("val", [
        np.inf,
        -np.inf,
        float("inf"),
        float("-inf"),
    ])
    def test_infinity_becomes_none(self, val):
        assert to_native(val) is None

    def test_numpy_int64(self):
        result = to_native(np.int64(42))
        assert result == 42
        assert isinstance(result, int)

    def test_numpy_float64(self):
        result = to_native(np.float64(3.14))
        assert result == 3.14
        assert isinstance(result, float)

    def test_numpy_float64_nan(self):
        assert to_native(np.float64("nan")) is None

    def test_numpy_float64_inf(self):
        assert to_native(np.float64("inf")) is None
        assert to_native(np.float64("-inf")) is None

    def test_numpy_bool(self):
        assert to_native(np.bool_(True)) is True
        assert to_native(np.bool_(False)) is False

    def test_numpy_array(self):
        result = to_native(np.array([1, 2, 3]))
        assert result == [1, 2, 3]

    def test_pandas_timestamp(self):
        ts = pd.Timestamp("2024-01-15 10:30:00")
        result = to_native(ts)
        assert isinstance(result, str)
        assert "2024-01-15" in result

    def test_python_datetime(self):
        dt = datetime.datetime(2024, 1, 15, 10, 30)
        result = to_native(dt)
        assert isinstance(result, str)
        assert "2024-01-15" in result

    def test_python_date(self):
        d = datetime.date(2024, 1, 15)
        result = to_native(d)
        assert result == "2024-01-15"

    def test_native_int_passthrough(self):
        assert to_native(42) == 42

    def test_native_str_passthrough(self):
        assert to_native("hello") == "hello"

    def test_native_float_passthrough(self):
        assert to_native(3.14) == 3.14

    def test_all_json_serializable(self):
        """Every to_native result must survive json.dumps()."""
        edge_cases = [
            np.nan, float("nan"), pd.NA, pd.NaT, None,
            np.inf, -np.inf, float("inf"), float("-inf"),
            np.int64(42), np.float64(3.14), np.bool_(True),
            pd.Timestamp("2024-01-01"), datetime.date(2024, 1, 1),
            "text", 123, 3.14, True,
        ]
        converted = [to_native(v) for v in edge_cases]
        # This must not raise
        result = json.dumps(converted)
        assert isinstance(result, str)


# ---------------------------------------------------------------------------
# safe_numeric: rounding variant
# ---------------------------------------------------------------------------

class TestSafeNumeric:

    def test_rounds_float(self):
        assert safe_numeric(np.float64(3.141592653)) == 3.1416

    def test_nan_returns_none(self):
        assert safe_numeric(np.nan) is None

    def test_int_unchanged(self):
        assert safe_numeric(np.int64(7)) == 7

    def test_none_unchanged(self):
        assert safe_numeric(None) is None


# ---------------------------------------------------------------------------
# rows_to_json_safe: DataFrame row conversion
# ---------------------------------------------------------------------------

class TestRowsToJsonSafe:

    def _build_edge_case_df(self) -> pd.DataFrame:
        """Build a DataFrame that exercises every problematic type."""
        return pd.DataFrame({
            "float_nan": [1.0, np.nan, 3.0],
            "python_nan": [float("nan"), 2.0, float("nan")],
            "inf_col": [np.inf, -np.inf, 0.0],
            "int_col": pd.array([1, pd.NA, 3], dtype=pd.Int64Dtype()),
            "str_col": ["a", None, "c"],
            "date_col": pd.to_datetime(["2024-01-01", pd.NaT, "2024-03-01"]),
        })

    def test_no_json_error(self):
        """Core regression: json.dumps must not raise on edge-case DataFrame."""
        df = self._build_edge_case_df()
        rows = rows_to_json_safe(df)
        # This is the line that used to crash
        result = json.dumps(rows)
        assert isinstance(result, str)

    def test_nan_becomes_none_in_rows(self):
        df = self._build_edge_case_df()
        rows = rows_to_json_safe(df)
        # Row 0: float_nan=1.0, python_nan=nan->None, inf=inf->None
        assert rows[0][0] == 1.0
        assert rows[0][1] is None  # float("nan")
        assert rows[0][2] is None  # np.inf

    def test_inf_becomes_none_in_rows(self):
        df = self._build_edge_case_df()
        rows = rows_to_json_safe(df)
        # Row 1: inf_col = -np.inf -> None
        assert rows[1][2] is None

    def test_nat_becomes_none_in_rows(self):
        df = self._build_edge_case_df()
        rows = rows_to_json_safe(df)
        # Row 1: date_col = NaT -> None
        assert rows[1][5] is None

    def test_limit_parameter(self):
        df = self._build_edge_case_df()
        rows = rows_to_json_safe(df, limit=2)
        assert len(rows) == 2

    def test_full_roundtrip_serializable(self):
        """Full roundtrip: build DF -> convert -> json.dumps -> json.loads."""
        df = self._build_edge_case_df()
        rows = rows_to_json_safe(df)
        text = json.dumps(rows)
        parsed = json.loads(text)
        assert len(parsed) == 3
        assert len(parsed[0]) == 6
