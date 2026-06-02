"""Load swimming_sessions from Supabase and build a sensor DataFrame."""

from __future__ import annotations

import io
import json
from typing import Any

import pandas as pd

IMU_COLS = [
    "time",
    "ax_filtered",
    "ay_filtered",
    "az_filtered",
    "wx_filtered",
    "wy_filtered",
    "wz_filtered",
]


def _samples_to_dataframe(samples: Any) -> pd.DataFrame:
    if not samples:
        raise ValueError("Session has no samples data")

    if isinstance(samples, str):
        samples = json.loads(samples)

    if not isinstance(samples, list) or len(samples) == 0:
        raise ValueError("Samples must be a non-empty list")

    df = pd.DataFrame(samples)

    if "time" not in df.columns:
        if "timestamp" in df.columns:
            df = df.rename(columns={"timestamp": "time"})
        else:
            df["time"] = [i * 0.01 for i in range(len(df))]

    rename = {
        "ax": "ax_filtered",
        "ay": "ay_filtered",
        "az": "az_filtered",
        "wx": "wx_filtered",
        "wy": "wy_filtered",
        "wz": "wz_filtered",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})

    missing = [c for c in IMU_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing sensor columns: {missing}")

    return df[IMU_COLS].copy()


def _csv_to_dataframe(csv_content: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(csv_content))
    return _samples_to_dataframe(df.to_dict(orient="records"))


def row_to_dataframe(row: dict[str, Any]) -> pd.DataFrame:
    if row.get("samples"):
        return _samples_to_dataframe(row["samples"])

    csv_content = row.get("csv_content")
    if csv_content and str(csv_content).strip():
        return _csv_to_dataframe(str(csv_content))

    raise ValueError("Session has neither samples nor csv_content")
