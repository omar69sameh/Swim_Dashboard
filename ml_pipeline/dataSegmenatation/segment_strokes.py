import os
import pickle
from pathlib import Path
import sys
from datetime import datetime
import warnings

import numpy as np
import pandas as pd
from scipy import signal
from scipy.interpolate import interp1d

try:
    import torch
    import torch.nn as nn

    _TORCH_AVAILABLE = True
except ImportError:
    torch = None
    nn = None
    _TORCH_AVAILABLE = False

try:
    import tkinter as tk
    from tkinter import filedialog
except ImportError:
    tk = None
    filedialog = None

warnings.filterwarnings("ignore")

# GRU-LSTM classifier (same as segment_and_classify.py)
if _TORCH_AVAILABLE:
    try:
        sys.path.append(str(Path(__file__).resolve().parent.parent / "GRU-LSTM"))
        from GRU_LSTM import GRULSTMStrokeClassifier  # type: ignore[import-not-found]
    except ImportError:

        class GRULSTMStrokeClassifier(nn.Module):
            def __init__(self, input_size, hidden_size, num_classes, num_layers=2, dropout=0.3):
                super().__init__()
                self.hidden_size = hidden_size
                self.num_layers = num_layers
                self.bn_input = nn.BatchNorm1d(input_size)
                self.gru = nn.GRU(
                    input_size=input_size,
                    hidden_size=hidden_size,
                    num_layers=num_layers,
                    batch_first=True,
                    dropout=dropout if num_layers > 1 else 0,
                    bidirectional=False,
                )
                self.lstm = nn.LSTM(
                    input_size=hidden_size,
                    hidden_size=hidden_size,
                    num_layers=num_layers,
                    batch_first=True,
                    dropout=dropout if num_layers > 1 else 0,
                    bidirectional=False,
                )
                self.attention = nn.MultiheadAttention(
                    embed_dim=hidden_size, num_heads=4, batch_first=True, dropout=dropout
                )
                self.dropout = nn.Dropout(dropout)
                self.fc1 = nn.Linear(hidden_size, hidden_size // 2)
                self.bn1 = nn.BatchNorm1d(hidden_size // 2)
                self.relu = nn.ReLU()
                self.fc2 = nn.Linear(hidden_size // 2, num_classes)

            def forward(self, x):
                x = x.permute(0, 2, 1)
                x = self.bn_input(x)
                x = x.permute(0, 2, 1)
                gru_out, _ = self.gru(x)
                lstm_out, _ = self.lstm(gru_out)
                attn_out, _ = self.attention(lstm_out, lstm_out, lstm_out)
                last_out = attn_out[:, -1, :]
                out = self.dropout(last_out)
                out = self.fc1(out)
                out = self.bn1(out)
                out = self.relu(out)
                out = self.dropout(out)
                out = self.fc2(out)
                return out
else:
    GRULSTMStrokeClassifier = None  # type: ignore[misc, assignment]


def load_session(file_path: Path) -> pd.DataFrame:
    """
    Load a single session CSV file.
    """
    df = pd.read_csv(file_path)
    required_cols = [
        "time",
        "ax_filtered",
        "ay_filtered",
        "az_filtered",
        "wx_filtered",
        "wy_filtered",
        "wz_filtered",
    ]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"{file_path} is missing columns: {missing}")
    return df


def compute_dt(df: pd.DataFrame) -> float:
    """
    Compute the median sampling period from the time column.
    """
    times = df["time"].values
    if len(times) < 2:
        raise ValueError("Not enough samples to compute dt.")
    return float(np.median(np.diff(times)))


# ======================================================================
# SWIM STYLE FOR SEGMENTATION (same rules as segment_and_classify.py)
# ======================================================================
# segment_and_classify picks style from folder names when possible; otherwise it
# runs infer_segmentation_style_with_model() using the trained GRU-LSTM so the
# same CSV gets the same stroke count as in the classify pipeline.

KNOWN_SEGMENTATION_STYLES = ("Butterfly", "Freestyle", "Breast")

_style_inference_bundle: dict | None = None


def _candidate_model_search_roots() -> list[Path]:
    here = Path(__file__).resolve()
    return [Path.cwd(), here.parent, here.parent.parent]


def find_latest_model_files():
    """
    Find segmented training artifacts (same layout as segment_and_classify.py).
    Searches cwd, dataSegmenatation/, and repo root so scripts work from any folder.
    """
    for base in _candidate_model_search_roots():
        root_model = base / "best_model_segmented.pth"
        root_scaler = base / "scaler_segmented.pkl"
        root_label = base / "label_mapping_segmented.pkl"
        root_hyper = base / "hyperparameters_segmented.pkl"
        if all(f.exists() for f in (root_model, root_scaler, root_label, root_hyper)):
            return root_model, root_scaler, root_label, root_hyper

        model_dir = base / "saved_models_segmented"
        if model_dir.exists():
            model_files = list(model_dir.glob("best_model_segmented_*.pth"))
            if model_files:
                latest_model = max(model_files, key=lambda p: p.stat().st_mtime)
                timestamp = latest_model.stem.replace("best_model_segmented_", "")
                scaler_file = model_dir / f"scaler_segmented_{timestamp}.pkl"
                label_file = model_dir / f"label_mapping_segmented_{timestamp}.pkl"
                hyper_file = model_dir / f"hyperparameters_segmented_{timestamp}.pkl"
                if all(f.exists() for f in (scaler_file, label_file, hyper_file)):
                    return latest_model, scaler_file, label_file, hyper_file
    return None


class DataFilter:
    """Preprocessing for model-based style scoring (same as segment_and_classify)."""

    @staticmethod
    def apply_lowpass_filter(data, cutoff=20, fs=100, order=4):
        nyquist = 0.5 * fs
        normal_cutoff = cutoff / nyquist
        b, a = signal.butter(order, normal_cutoff, btype="low", analog=False)
        filtered_data = np.zeros_like(data)
        for i in range(data.shape[1]):
            filtered_data[:, i] = signal.filtfilt(b, a, data[:, i])
        return filtered_data

    @staticmethod
    def resize_to_length(data, target_length=100):
        current_length = len(data)
        if current_length == target_length:
            return data
        original_indices = np.linspace(0, current_length - 1, current_length)
        target_indices = np.linspace(0, current_length - 1, target_length)
        resized_data = np.zeros((target_length, data.shape[1]))
        for col_idx in range(data.shape[1]):
            interp_func = interp1d(
                original_indices,
                data[:, col_idx],
                kind="linear",
                bounds_error=False,
                fill_value="extrapolate",
            )
            resized_data[:, col_idx] = interp_func(target_indices)
        return resized_data


def extract_stroke_segment(csv_file, start_time, end_time, sequence_length=100):
    """Crop a stroke window and preprocess like segment_and_classify."""
    try:
        df = pd.read_csv(csv_file)
        if "time" not in df.columns:
            return None
        segment_data = df[(df["time"] >= start_time) & (df["time"] <= end_time)].copy()
        if len(segment_data) < 10:
            return None
        imu_cols = [
            "ax_filtered",
            "ay_filtered",
            "az_filtered",
            "wx_filtered",
            "wy_filtered",
            "wz_filtered",
        ]
        if not all(col in segment_data.columns for col in imu_cols):
            numeric_cols = segment_data.select_dtypes(include=[np.number]).columns.tolist()
            if "time" in numeric_cols:
                numeric_cols.remove("time")
            if len(numeric_cols) >= 6:
                imu_data = segment_data[numeric_cols[:6]].values
            else:
                return None
        else:
            imu_data = segment_data[imu_cols].values
        imu_data = DataFilter.apply_lowpass_filter(imu_data)
        imu_data = DataFilter.resize_to_length(imu_data, target_length=sequence_length)
        return imu_data
    except Exception:
        return None


def classify_stroke_segment(segment_data, model, scaler, device):
    if segment_data is None or not _TORCH_AVAILABLE:
        return None, 0.0, None
    segment_normalized = scaler.transform(segment_data)
    segment_normalized = segment_normalized.reshape(
        1, segment_data.shape[0], segment_data.shape[1]
    )
    segment_tensor = torch.FloatTensor(segment_normalized).to(device)
    model.eval()
    with torch.no_grad():
        outputs = model(segment_tensor)
        probs = torch.softmax(outputs, dim=1)
        confidence, pred_idx = torch.max(probs, 1)
        pred_idx = pred_idx.item()
        confidence = confidence.item()
        all_probs = probs.cpu().numpy()[0]
    return pred_idx, confidence, all_probs


def swim_style_from_class_label(label) -> str | None:
    low = str(label).lower()
    if "butterfly" in low:
        return "Butterfly"
    if "breast" in low:
        return "Breast"
    if "freestyle" in low:
        return "Freestyle"
    return None


def build_style_class_indices(idx_to_label: dict) -> dict[str, list[int]]:
    out = {s: [] for s in KNOWN_SEGMENTATION_STYLES}
    for idx, lab in idx_to_label.items():
        s = swim_style_from_class_label(lab)
        if s:
            out[s].append(int(idx))
    return out


def _even_sample_indices(n: int, max_samples: int) -> list[int]:
    if n <= 0:
        return []
    k = min(max_samples, n)
    return np.unique(np.linspace(0, n - 1, k, dtype=int)).tolist()


def _get_style_inference_bundle():
    """Load model/scaler/labels once; reused for every file in a batch."""
    global _style_inference_bundle
    if _style_inference_bundle is not None:
        return _style_inference_bundle
    if not _TORCH_AVAILABLE or GRULSTMStrokeClassifier is None:
        return None
    paths = find_latest_model_files()
    if paths is None:
        return None
    model_path, scaler_path, label_mapping_path, hyperparams_path = paths
    try:
        with open(scaler_path, "rb") as f:
            scaler = pickle.load(f)
        with open(label_mapping_path, "rb") as f:
            idx_to_label = pickle.load(f)
        with open(hyperparams_path, "rb") as f:
            hyperparams = pickle.load(f)
        sequence_length = hyperparams["sequence_length"]
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = GRULSTMStrokeClassifier(
            input_size=hyperparams["input_size"],
            hidden_size=hyperparams["hidden_size"],
            num_classes=hyperparams["num_classes"],
            num_layers=hyperparams["num_layers"],
            dropout=hyperparams["dropout"],
        )
        model.load_state_dict(torch.load(model_path, map_location=device))
        model = model.to(device)
        model.eval()
        _style_inference_bundle = {
            "model": model,
            "scaler": scaler,
            "idx_to_label": idx_to_label,
            "sequence_length": sequence_length,
            "device": device,
            "hyperparams": hyperparams,
            "paths": paths,
        }
    except Exception:
        _style_inference_bundle = None
    return _style_inference_bundle


def style_from_folder_path(csv_path: Path) -> str | None:
    """
    If the CSV lives in a folder named Butterfly / Freestyle / Breast, use that style.
    Matches segment_and_classify.style_from_folder_path (immediate parent only).
    """
    parent = csv_path.parent.name
    return parent if parent in KNOWN_SEGMENTATION_STYLES else None


def _style_from_folder_layout(csv_path: Path, root_dir: Path | None) -> str | None:
    """Folder-based style only (no model)."""
    s = style_from_folder_path(csv_path)
    if s:
        return s

    stop_at = root_dir.resolve() if root_dir is not None else None
    p = csv_path.parent
    while p != p.parent:
        if p.name in KNOWN_SEGMENTATION_STYLES:
            return p.name
        if stop_at is not None and p.resolve() == stop_at:
            break
        p = p.parent

    if root_dir is not None:
        try:
            rel = csv_path.relative_to(root_dir)
            for part in rel.parts[:-1]:
                if part in KNOWN_SEGMENTATION_STYLES:
                    return part
        except ValueError:
            pass
    return None


# ======================================================================
# BUTTERFLY SEGMENTATION (Original - Works Perfect)
# ======================================================================

def build_stroke_signal_butterfly(df: pd.DataFrame) -> pd.Series:
    """
    Build stroke signal for BUTTERFLY using gyroscope magnitude.
    Butterfly has strong symmetric rotation peaks.
    """
    wx = df["wx_filtered"].values
    wy = df["wy_filtered"].values
    wz = df["wz_filtered"].values

    # Magnitude of angular velocity
    mag_w = np.sqrt(wx ** 2 + wy ** 2 + wz ** 2)

    # Smooth with moving average (~150 ms window)
    dt = compute_dt(df)
    window_sec = 0.15
    window_samples = max(3, int(window_sec / dt))
    smooth = (
        pd.Series(mag_w)
        .rolling(window=window_samples, center=True, min_periods=1)
        .mean()
    )

    # Normalize for robust thresholding
    mean = smooth.mean()
    std = smooth.std() if smooth.std() > 1e-6 else 1.0
    norm = (smooth - mean) / std

    return norm


# ======================================================================
# FREESTYLE SEGMENTATION (NEW - Detects Alternating Arm Strokes)
# ======================================================================

def build_stroke_signal_freestyle(df: pd.DataFrame) -> pd.Series:
    """
    Build stroke signal for FREESTYLE using rotation around body axis (wx).
    Freestyle has alternating left/right arm strokes with opposite rotations.
    """
    wx = df["wx_filtered"].values  # Roll (main stroke indicator)
    wy = df["wy_filtered"].values  # Pitch
    
    # For freestyle, use absolute value of wx (roll) + some pitch
    # This captures BOTH left and right arm strokes
    stroke_component = np.abs(wx) + 0.3 * np.abs(wy)
    
    # Smooth with shorter window (freestyle is faster)
    dt = compute_dt(df)
    window_sec = 0.10  # 100ms - shorter for faster strokes
    window_samples = max(3, int(window_sec / dt))
    smooth = (
        pd.Series(stroke_component)
        .rolling(window=window_samples, center=True, min_periods=1)
        .mean()
    )

    # Normalize
    mean = smooth.mean()
    std = smooth.std() if smooth.std() > 1e-6 else 1.0
    norm = (smooth - mean) / std

    return norm


# ======================================================================
# BREASTSTROKE SEGMENTATION (NEW - Detects Glide + Pull Phases)
# ======================================================================

def build_stroke_signal_breaststroke(df: pd.DataFrame) -> pd.Series:
    """
    Build stroke signal for BREASTSTROKE using acceleration surge + rotation.
    Breaststroke has: pull phase (high accel + rotation) → glide (low activity).
    """
    # Linear acceleration magnitude (surge during pull)
    ax = df["ax_filtered"].values
    ay = df["ay_filtered"].values
    az = df["az_filtered"].values
    accel_mag = np.sqrt(ax ** 2 + ay ** 2 + az ** 2)
    
    # Gyroscope magnitude (rotation during pull)
    wx = df["wx_filtered"].values
    wy = df["wy_filtered"].values
    wz = df["wz_filtered"].values
    gyro_mag = np.sqrt(wx ** 2 + wy ** 2 + wz ** 2)
    
    # Combine: acceleration surge + rotation indicates stroke
    # Weighted more toward acceleration (breaststroke has strong forward surge)
    combined = 0.6 * accel_mag + 0.4 * gyro_mag
    
    # Smooth with longer window (breaststroke is slower)
    dt = compute_dt(df)
    window_sec = 0.20  # 200ms - longer for slower strokes
    window_samples = max(3, int(window_sec / dt))
    smooth = (
        pd.Series(combined)
        .rolling(window=window_samples, center=True, min_periods=1)
        .mean()
    )

    # Normalize
    mean = smooth.mean()
    std = smooth.std() if smooth.std() > 1e-6 else 1.0
    norm = (smooth - mean) / std

    return norm


# ======================================================================
# STYLE-SPECIFIC PEAK DETECTION
# ======================================================================

def detect_stroke_peaks(
    stroke_signal: pd.Series,
    dt: float,
    style: str,
) -> np.ndarray:
    """
    Detect stroke peaks with STYLE-SPECIFIC parameters.
    """
    # Style-specific parameters
    params = {
        "Butterfly": {
            "threshold": 0.8,
            "min_interval_sec": 0.6,  # ~1.0s typical butterfly cycle
        },
        "Freestyle": {
            "threshold": 0.6,          # Lower threshold (alternating strokes)
            "min_interval_sec": 0.4,   # ~0.8-1.2s typical freestyle (per arm)
        },
        "Breast": {
            "threshold": 0.7,          # Medium threshold
            "min_interval_sec": 0.8,   # ~1.2-1.8s typical breaststroke (includes glide)
        },
    }
    
    # Use Butterfly params as default for unknown styles
    style_params = params.get(style, params["Butterfly"])
    threshold = style_params["threshold"]
    min_interval_sec = style_params["min_interval_sec"]
    
    values = stroke_signal.values
    n = len(values)
    min_interval_samples = int(min_interval_sec / dt)

    peaks = []
    last_peak = -min_interval_samples - 1

    for i in range(1, n - 1):
        if values[i] > threshold and values[i] >= values[i - 1] and values[i] >= values[i + 1]:
            if i - last_peak >= min_interval_samples:
                peaks.append(i)
                last_peak = i

    return np.array(peaks, dtype=int)


def indices_to_segments(
    df: pd.DataFrame,
    peak_indices: np.ndarray,
    dt: float,
    style: str,
):
    """
    Convert peak indices into stroke segments with STYLE-SPECIFIC windows.
    """
    if len(peak_indices) == 0:
        return []

    # Style-specific half-window sizes
    half_windows = {
        "Butterfly": 0.5,   # ±0.5s = 1.0s total window
        "Freestyle": 0.4,   # ±0.4s = 0.8s total window (faster)
        "Breast": 0.6,      # ±0.6s = 1.2s total window (includes glide)
    }
    
    half_window_sec = half_windows.get(style, 0.5)
    half_window_samples = int(half_window_sec / dt)
    times = df["time"].values

    segments = []
    for idx in peak_indices:
        start_idx = max(0, idx - half_window_samples)
        end_idx = min(len(df) - 1, idx + half_window_samples)
        segments.append(
            {
                "stroke_index": int(idx),
                "start_time": float(times[start_idx]),
                "peak_time": float(times[idx]),
                "end_time": float(times[end_idx]),
            }
        )

    return segments


def slice_window(df: pd.DataFrame, start_time: float, end_time: float) -> pd.DataFrame:
    m = (df["time"] >= start_time) & (df["time"] <= end_time)
    return df.loc[m].copy()


def ensure_style_dirs(out_root: Path) -> None:
    for style in ("Breast", "Butterfly", "Freestyle"):
        (out_root / style).mkdir(parents=True, exist_ok=True)


def _normalize_quality_binary(label: str | None) -> str | None:
    if label is None:
        return None
    s = str(label).strip().lower().replace("-", "_").replace(" ", "_")
    if s in {"good", "low"}:
        return "good"
    if s in {"bad", "high", "moderate", "moderate_high", "risk"}:
        return "bad"
    return None


def infer_quality_from_path(file_path: Path, root_dir: Path | None) -> str | None:
    """
    Infer binary quality (good/bad) from path segments.
    Supports layouts like:
      testdata/style/good/session.csv
      testdata/good/style/session.csv
    """
    if root_dir is not None:
        try:
            rel = file_path.relative_to(root_dir)
            parts = rel.parts[:-1]
        except ValueError:
            parts = file_path.parts[:-1]
    else:
        parts = file_path.parts[:-1]

    for p in parts:
        q = _normalize_quality_binary(p)
        if q is not None:
            return q
    return None


def write_stroke_windows(
    session_path: Path,
    style: str,
    quality: str | None,
    df: pd.DataFrame,
    segments: list[dict],
    out_root: Path,
) -> int:
    """
    Save each stroke window as its own CSV under:
      out_root/{Style}/{quality|unknown}/{session_stem}/stroke###_{session_stem}.csv
    This preserves session identity and quality grouping for evaluation.
    """
    quality_dir = quality if quality is not None else "unknown_quality"
    stroke_dir = out_root / style / quality_dir / session_path.stem
    stroke_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for i, seg in enumerate(segments, start=1):
        w = slice_window(df, float(seg["start_time"]), float(seg["end_time"]))
        if w.empty:
            continue
        out_name = f"stroke{i:03d}_{session_path.stem}.csv"
        w.to_csv(stroke_dir / out_name, index=False)
        written += 1
    return written


# ======================================================================
# MAIN SEGMENTATION FUNCTION (STYLE-AWARE)
# ======================================================================

def segment_session(file_path: Path, style: str):
    """
    Segment a single session file into strokes using STYLE-SPECIFIC algorithm.

    Args:
        file_path: Path to the CSV session file
        style: "Butterfly", "Freestyle", or "Breast"

    Returns:
        num_strokes (int)
        segments (list of dicts with start_time/peak_time/end_time)
    """
    df = load_session(file_path)
    dt = compute_dt(df)
    
    # BUILD STROKE SIGNAL (STYLE-SPECIFIC)
    if style == "Butterfly":
        stroke_signal = build_stroke_signal_butterfly(df)
    elif style == "Freestyle":
        stroke_signal = build_stroke_signal_freestyle(df)
    elif style == "Breast":
        stroke_signal = build_stroke_signal_breaststroke(df)
    else:
        # Default to butterfly method for unknown styles
        print(f"Warning: Unknown style '{style}', using Butterfly method")
        stroke_signal = build_stroke_signal_butterfly(df)
    
    # DETECT PEAKS (STYLE-SPECIFIC PARAMETERS)
    peak_indices = detect_stroke_peaks(stroke_signal, dt=dt, style=style)
    
    # CONVERT TO SEGMENTS (STYLE-SPECIFIC WINDOWS)
    segments = indices_to_segments(df, peak_indices, dt, style=style)
    
    num_strokes = len(segments)
    return num_strokes, segments


def infer_segmentation_style_with_model(
    csv_path: Path,
    max_samples: int = 12,
) -> tuple[str, dict]:
    """
    Match segment_and_classify.infer_segmentation_style_with_model:
    segment under each style, score samples with the classifier, pick best style.
    """
    bundle = _get_style_inference_bundle()
    if bundle is None:
        return "Butterfly", {"scores": {}, "strokes_per_style": {}, "error": "no_model"}

    model = bundle["model"]
    scaler = bundle["scaler"]
    idx_to_label = bundle["idx_to_label"]
    sequence_length = bundle["sequence_length"]
    device = bundle["device"]

    style_indices = build_style_class_indices(idx_to_label)
    scores = {}
    stroke_counts = {}

    for style in KNOWN_SEGMENTATION_STYLES:
        try:
            n, segs = segment_session(csv_path, style)
        except Exception:
            scores[style] = 0.0
            stroke_counts[style] = 0
            continue

        stroke_counts[style] = n
        if n == 0 or not segs:
            scores[style] = 0.0
            continue

        idxs = _even_sample_indices(n, max_samples)
        masses = []
        class_idxs = style_indices.get(style, [])

        for si in idxs:
            seg = segs[si]
            segment_data = extract_stroke_segment(
                csv_path, seg["start_time"], seg["end_time"], sequence_length
            )
            if segment_data is None:
                continue
            pred_idx, _conf, all_probs = classify_stroke_segment(
                segment_data, model, scaler, device
            )
            if all_probs is None:
                continue
            if class_idxs:
                masses.append(float(np.sum(all_probs[class_idxs])))
            else:
                pred_lab = None
                for k, v in idx_to_label.items():
                    if int(k) == int(pred_idx):
                        pred_lab = v
                        break
                masses.append(
                    1.0
                    if pred_lab is not None
                    and swim_style_from_class_label(pred_lab) == style
                    else 0.0
                )

        scores[style] = float(np.mean(masses)) if masses else 0.0

    best_style = max(
        KNOWN_SEGMENTATION_STYLES,
        key=lambda s: (scores[s], stroke_counts[s]),
    )
    if stroke_counts.get(best_style, 0) == 0:
        best_style = max(KNOWN_SEGMENTATION_STYLES, key=lambda s: stroke_counts.get(s, 0))
    if stroke_counts.get(best_style, 0) == 0:
        best_style = "Butterfly"

    return best_style, {"scores": scores, "strokes_per_style": stroke_counts}


def resolve_segmentation_style(csv_path: Path, root_dir: Path | None = None) -> str:
    """
    Same decision order as segment_and_classify.segment_and_classify_single_file:

    1) Folder name(s) imply Butterfly / Freestyle / Breast
    2) Else infer style with the trained model (same as classify script)
    3) Else Butterfly with a warning
    """
    folder_style = _style_from_folder_layout(csv_path, root_dir)
    if folder_style:
        return folder_style

    bundle = _get_style_inference_bundle()
    if bundle is not None:
        best_style, diag = infer_segmentation_style_with_model(csv_path)
        print(
            f"Inferred swim style for segmentation: {best_style} "
            f"(scores={diag.get('scores')}, strokes_per_style={diag.get('strokes_per_style')})"
        )
        return best_style

    print(
        f"Warning: No segmentation model artifacts found and path has no style folder; "
        f"using Butterfly for {csv_path.name}. "
        f"Place best_model_segmented.pth, scaler_segmented.pkl, "
        f"label_mapping_segmented.pkl, hyperparameters_segmented.pkl in cwd or project root."
    )
    return "Butterfly"


# ======================================================================
# BATCH PROCESSING
# ======================================================================

def segment_all_to_stroke_files(root_dir: Path, out_root: Path):
    """
    Segment all CSV sessions under root_dir (organized by style folders).
    
    Expected structure:
        root_dir/
            Butterfly/
                session_001.csv
                session_002.csv
            Freestyle/
                session_001.csv
            Breast/
                session_001.csv
    
    Output structure:
        out_root/
            Butterfly/
                stroke001_session_001.csv
                stroke002_session_001.csv
            Freestyle/
                stroke001_session_001.csv
            Breast/
                stroke001_session_001.csv
    """
    ensure_style_dirs(out_root)

    summary_rows = []
    all_segments = []

    for folder, _, files in os.walk(root_dir):
        for name in files:
            if not name.lower().endswith(".csv"):
                continue

            file_path = Path(folder) / name
            rel_path = file_path.relative_to(root_dir)

            # Same style resolution as segment_and_classify.py (folder names), not only rel_path.parts[0]
            style = resolve_segmentation_style(file_path, root_dir)
            quality = infer_quality_from_path(file_path, root_dir)

            try:
                df = load_session(file_path)
                
                # STYLE-SPECIFIC SEGMENTATION (identical pipeline to segment_and_classify → segment_session)
                num_strokes, segments = segment_session(file_path, style=style)
                
                written = write_stroke_windows(file_path, style, quality, df, segments, out_root)
                print(f"[{style}] {rel_path}: {num_strokes} strokes → saved {written} stroke CSVs")

                summary_rows.append(
                    {
                        "style": style,
                        "quality": quality if quality is not None else "",
                        "session_file": name,
                        "relative_path": str(rel_path),
                        "num_strokes": num_strokes,
                        "stroke_csvs_written": written,
                    }
                )

                for seg in segments:
                    all_segments.append(
                        {
                            "style": style,
                            "quality": quality if quality is not None else "",
                            "session_file": name,
                            "relative_path": str(rel_path),
                            **seg,
                        }
                    )
            except Exception as e:
                print(f"Error processing {rel_path}: {e}")

    summary_df = pd.DataFrame(summary_rows)
    out_summary = out_root / "stroke_counts_per_session.csv"
    summary_df.to_csv(out_summary, index=False)

    segments_df = pd.DataFrame(all_segments)
    out_segments = out_root / "stroke_segments_detailed.csv"
    segments_df.to_csv(out_segments, index=False)

    print(f"\n✅ Saved stroke counts to: {out_summary}")
    print(f"✅ Saved detailed segments to: {out_segments}")
    
    # Print style-specific summary
    print("\n📊 Summary by Style:")
    for style in ["Butterfly", "Freestyle", "Breast"]:
        style_data = summary_df[summary_df["style"] == style]
        if not style_data.empty:
            total_sessions = len(style_data)
            total_strokes = style_data["num_strokes"].sum()
            avg_strokes = style_data["num_strokes"].mean()
            print(f"  {style:12s}: {total_sessions:3d} sessions, {total_strokes:4d} strokes (avg {avg_strokes:.1f}/session)")


def segment_single_file_to_stroke_files(file_path: Path, out_root: Path, style: str = None) -> int:
    """
    Segment ONE CSV session with STYLE-SPECIFIC algorithm.
    
    Args:
        file_path: Path to the session CSV file
        out_root: Output directory for stroke files
        style: Optional style override. If None, inferred from parent folder.
    """
    # Infer style if not provided (same rules as segment_and_classify single-file flow)
    if style is None:
        inferred_style = resolve_segmentation_style(file_path, root_dir=None)
    else:
        inferred_style = style
    inferred_quality = infer_quality_from_path(file_path, root_dir=None)

    df = load_session(file_path)
    
    # STYLE-SPECIFIC SEGMENTATION
    num_strokes, segments = segment_session(file_path, style=inferred_style)

    written = write_stroke_windows(
        session_path=file_path,
        style=inferred_style,
        quality=inferred_quality,
        df=df,
        segments=segments,
        out_root=out_root,
    )

    # Save summary
    summary_df = pd.DataFrame(
        [
            {
                "style": inferred_style,
                "quality": inferred_quality if inferred_quality is not None else "",
                "session_file": file_path.name,
                "relative_path": file_path.name,
                "num_strokes": num_strokes,
                "stroke_csvs_written": written,
            }
        ]
    )
    out_summary = out_root / "stroke_counts_per_session.csv"
    summary_df.to_csv(out_summary, index=False)

    segments_df = pd.DataFrame(
        [
            {
                "style": inferred_style,
                "quality": inferred_quality if inferred_quality is not None else "",
                "session_file": file_path.name,
                "relative_path": file_path.name,
                **seg,
            }
            for seg in segments
        ]
    )
    out_segments = out_root / "stroke_segments_detailed.csv"
    segments_df.to_csv(out_segments, index=False)

    print(f"[{inferred_style}] {file_path.name}: {num_strokes} strokes → saved {written} CSVs")
    print(f"✅ Saved per-stroke CSV windows into: {out_root}")
    return written


# ======================================================================
# MAIN ENTRY POINT
# ======================================================================

if __name__ == "__main__":
    # Default root folder containing Breast/Butterfly/Freestyle session CSVs
    default_root = Path.home() / "Desktop" / "swimming_data"

    # Allow user to choose a folder or single CSV file
    target: Path

    if len(sys.argv) > 1:
        target = Path(sys.argv[1])
    else:
        if tk is not None and filedialog is not None:
            print("=" * 60)
            print("SWIMMING STROKE SEGMENTATION - STYLE-SPECIFIC")
            print("=" * 60)
            print("\nChoose what you want to segment:")
            print("  1) A folder containing Butterfly/Freestyle/Breast subfolders")
            print("  2) A single CSV file")
            print("  3) Use default dataset folder")
            choice = input("\nEnter 1, 2, or 3 (default 1): ").strip() or "1"

            if choice == "1":
                root = tk.Tk()
                root.withdraw()
                selected_dir = filedialog.askdirectory(
                    title="Select folder containing Butterfly/Freestyle/Breast subfolders"
                )
                if not selected_dir:
                    print("No folder selected, exiting.")
                    sys.exit(0)
                target = Path(selected_dir)

            elif choice == "2":
                root = tk.Tk()
                root.withdraw()
                selected_file = filedialog.askopenfilename(
                    title="Select a CSV session file",
                    filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
                )
                if not selected_file:
                    print("No file selected, exiting.")
                    sys.exit(0)
                target = Path(selected_file)

            else:
                target = default_root
        else:
            user_input = input(
                "Enter path to folder or CSV file (press Enter for default): "
            ).strip()

            if user_input:
                target = Path(user_input)
            else:
                target = default_root

    # Process folder or single file
    if target.is_dir():
        if tk is not None and filedialog is not None:
            root = tk.Tk()
            root.withdraw()
            out_dir = filedialog.askdirectory(
                title="Select output folder to save per-stroke CSV windows"
            )
            root.destroy()
            if not out_dir:
                print("No output folder selected, exiting.")
                sys.exit(0)
            out_root = Path(out_dir)
        else:
            out_root = Path(
                input("Enter output folder to save per-stroke CSV windows: ").strip()
            )
        
        print(f"\n📂 Input folder: {target}")
        print(f"📂 Output folder: {out_root}")
        print("\nProcessing with STYLE-SPECIFIC segmentation algorithms...")
        print("=" * 60)
        segment_all_to_stroke_files(target, out_root)
        
    elif target.is_file():
        print(f"\n📄 Input file: {target}")
        
        if tk is not None and filedialog is not None:
            root = tk.Tk()
            root.withdraw()
            out_dir = filedialog.askdirectory(
                title="Select output folder to save per-stroke CSV windows"
            )
            root.destroy()
            if not out_dir:
                print("No output folder selected, exiting.")
                sys.exit(0)
            base_out = Path(out_dir)
        else:
            base_out = Path(input("Enter output folder: ").strip())

        run_stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_root = base_out / f"{target.stem}_{run_stamp}"
        run_root.mkdir(parents=True, exist_ok=True)
        
        print(f"📂 Output folder: {run_root}")
        print("\nProcessing with STYLE-SPECIFIC segmentation...")
        print("=" * 60)
        segment_single_file_to_stroke_files(target, run_root)
        
    else:
        print(f"❌ Path does not exist: {target}")