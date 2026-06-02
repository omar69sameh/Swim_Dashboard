"""Run segmented pipeline on one session."""

from __future__ import annotations

import importlib.util
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import ML_PIPELINE_ROOT, PIPELINE_VERSION, model_paths
from app.inference.mapping import session_row_to_result
from app.inference.session_input import row_to_dataframe


def _load_clean_dataframe():
    clean_path = ML_PIPELINE_ROOT / "datacleaning" / "clean_newData.py"
    spec = importlib.util.spec_from_file_location("clean_newData", clean_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.clean_dataframe


def _load_segment_and_classify():
    seg_path = ML_PIPELINE_ROOT / "dataSegmenatation" / "segment_and_classify.py"
    if str(ML_PIPELINE_ROOT / "dataSegmenatation") not in sys.path:
        sys.path.insert(0, str(ML_PIPELINE_ROOT / "dataSegmenatation"))
    spec = importlib.util.spec_from_file_location("segment_and_classify", seg_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run_inference_on_row(row: dict[str, Any]) -> dict[str, Any]:
    """Analyze one swimming_sessions row; returns result dict for session_analysis."""
    started = time.perf_counter()

    raw_df = row_to_dataframe(row)
    clean_dataframe = _load_clean_dataframe()
    cleaned_df = clean_dataframe(raw_df)

    paths = model_paths()
    sac = _load_segment_and_classify()
    import torch

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        csv_path = tmp_path / "session.csv"
        out_root = tmp_path / "classified"
        cleaned_df.to_csv(csv_path, index=False)

        stroke_df, session_df = sac.segment_and_classify_single_file(
            csv_path,
            paths["model"],
            paths["scaler"],
            paths["label_mapping"],
            paths["hyperparameters"],
            device=device,
            output_root=out_root,
            test_result_root=None,
            data_root=None,
        )

    if session_df is None or session_df.empty:
        raise RuntimeError("Pipeline produced no session results")

    session_row = session_df.iloc[0].to_dict()
    stroke_rows = stroke_df.to_dict(orient="records") if stroke_df is not None else []

    result = session_row_to_result(session_row, stroke_rows)
    result["pipeline_version"] = PIPELINE_VERSION
    result["processing_time_ms"] = int((time.perf_counter() - started) * 1000)
    return result
