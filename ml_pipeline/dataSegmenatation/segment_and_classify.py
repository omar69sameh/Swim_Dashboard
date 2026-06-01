"""
SEGMENT AND CLASSIFY STROKES
============================
**Flow**
1. You choose **one CSV** or a **folder of session CSVs** (full sessions — not pre-segmented).
2. The script **segments** each session into strokes (Butterfly / Freestyle / Breast algorithms).
3. **Style** comes automatically from your first-pass copy under **test_result/** (same filename in
   Butterfly|Freestyle|Breast), or from the input folder name, or from model inference.
4. **Quality** (low / high / moderate / moderate_high / …) uses the GRU-LSTM restricted to labels
   for that swim style only (softmax over Butterfly_* or Freestyle_* etc.).

**Style registry is found automatically**: searches ``test_result``, ``test_result_syle_only``, parents
of the input file/folder, repo root, cwd, Desktop, and ``SWIM_TEST_RESULT`` for a folder containing
Butterfly/Freestyle/Breast subfolders. Your first-pass data can be **full sessions** (not segmented).

If ``label_mapping_segmented.pkl`` only has three style names (breast/butterfly/freestyle), that model
cannot output quality tiers. The script then tries to load a **fine-grained** classifier from
``../GRU-LSTM/`` (``best_model.pth`` + ``label_mapping.pkl`` + …) or ``SWIM_QUALITY_MODEL_ROOT``,
and uses it for per-stroke quality (masked to the matched swim style).

Usage:
    python segment_and_classify.py
    set SWIM_TEST_RESULT=C:\\path\\to\\test_result
    set SWIM_QUALITY_MODEL_ROOT=C:\\path\\to\\folder_with_fine_model   (optional)
"""

import os
from pathlib import Path
import sys
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import StandardScaler
import pickle
import warnings
from scipy import signal
from scipy.interpolate import interp1d
from collections import Counter
import glob

warnings.filterwarnings('ignore')


# ==================== Helper Functions ====================
def to_good_bad_label(label):
    if label is None:
        return None
    s = str(label).strip().lower().replace("-", "_").replace(" ", "_")
    if "moderate_high" in s:
        return "Bad"
    good_tokens = ['good', 'low', 'moderate']
    bad_tokens = ['bad', 'high', 'risk']
    if any(t in s for t in good_tokens):
        return 'Good'
    if any(t in s for t in bad_tokens):
        return 'Bad'
    return str(label)


def _safe_path_segment(name: str) -> str:
    bad = '<>:"/\\|?*'
    s = str(name).strip() or 'unknown'
    for c in bad:
        s = s.replace(c, '_')
    return s


def is_style_only_label_mapping(idx_to_label: dict) -> bool:
    """True if labels are only the three swim styles (no Freestyle_low-style quality names)."""
    vals = {str(v).strip().lower() for v in idx_to_label.values()}
    return vals <= {"breast", "butterfly", "freestyle"} and len(vals) <= 3


def load_optional_fine_grained_classifier(device):
    """
    Load a classifier whose label_mapping has quality granularity (e.g. Freestyle_low).
    Searches SWIM_QUALITY_MODEL_ROOT, then ../GRU-LSTM/, then ./GRU-LSTM/ for
    best_model.pth + label_mapping.pkl + scaler.pkl + hyperparameters.pkl.
    """
    roots: list[Path] = []
    env = os.environ.get("SWIM_QUALITY_MODEL_ROOT", "").strip()
    if env:
        roots.append(Path(env).expanduser())
    roots.append(Path(__file__).resolve().parent.parent / "GRU-LSTM")
    roots.append(Path.cwd() / "GRU-LSTM")

    for root in roots:
        root = Path(root)
        if not root.is_dir():
            continue
        w = root / "best_model.pth"
        if not w.exists():
            alt = root / "gru_lstm_stroke_classifier.pth"
            if alt.exists():
                w = alt
            else:
                continue
        lm_path = root / "label_mapping.pkl"
        sc_path = root / "scaler.pkl"
        hp_path = root / "hyperparameters.pkl"
        if not all(p.exists() for p in (lm_path, sc_path, hp_path)):
            continue
        try:
            with open(lm_path, "rb") as f:
                idx_to_label = pickle.load(f)
            if is_style_only_label_mapping(idx_to_label):
                continue
            with open(hp_path, "rb") as f:
                hyperparams = pickle.load(f)
            with open(sc_path, "rb") as f:
                scaler = pickle.load(f)
            model = GRULSTMStrokeClassifier(
                input_size=hyperparams["input_size"],
                hidden_size=hyperparams["hidden_size"],
                num_classes=hyperparams["num_classes"],
                num_layers=hyperparams["num_layers"],
                dropout=hyperparams["dropout"],
            )
            model.load_state_dict(torch.load(w, map_location=device))
            model.to(device)
            model.eval()
            return {
                "root": root.resolve(),
                "weights": w,
                "model": model,
                "scaler": scaler,
                "idx_to_label": idx_to_label,
                "hyperparams": hyperparams,
            }
        except Exception:
            continue
    return None


def quality_tier_from_label(label) -> str:
    """Quality wording from a full class name (e.g. Butterfly_moderate_high → moderate_high)."""
    if label is None:
        return ""
    s = str(label).strip().lower()
    if s in ("breast", "butterfly", "freestyle"):
        return "n_a_style_only_label"
    if "moderate" in s and "high" in s:
        return "moderate_high"
    if "moderate" in s or "medium" in s:
        return "moderate"
    if "high" in s:
        return "high"
    if "low" in s:
        return "low"
    if "risk" in s:
        return "risk"
    if "good" in s:
        return "good"
    if "bad" in s:
        return "bad"
    return "other"


def normalize_style_name(value) -> str | None:
    """Normalize style tokens to Butterfly/Freestyle/Breast."""
    if value is None:
        return None
    s = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    if "butter" in s:
        return "Butterfly"
    if "free" in s:
        return "Freestyle"
    if "breast" in s:
        return "Breast"
    return None


def normalize_quality_name(value) -> str | None:
    """Normalize quality tokens to stable tier names."""
    if value is None:
        return None
    s = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    if "moderate" in s and "high" in s:
        return "moderate_high"
    if "moderate" in s or "medium" in s:
        return "moderate"
    if "high" in s:
        return "high"
    if "low" in s:
        return "low"
    if "risk" in s:
        return "risk"
    if "good" in s:
        return "good"
    if "bad" in s:
        return "bad"
    return s if s else None


def normalize_quality_binary(value) -> str | None:
    """
    Normalize any quality wording into binary Good/Bad labels for evaluation.
    Expected folder labels for paper eval are: good / bad.
    """
    if value is None:
        return None
    s = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    if s in {"good", "low"}:
        return "Good"
    if s in {"bad", "high", "moderate", "moderate_high", "risk"}:
        return "Bad"
    gb = to_good_bad_label(s)
    if gb in {"Good", "Bad"}:
        return gb
    return None


def infer_ground_truth_from_relative_path(rel_path: Path) -> tuple[str | None, str | None, str]:
    """
    Infer (style, quality) from file location/name for evaluation.
    Supported examples:
      - style/quality/file.csv
      - style/file.csv
      - file style__quality__id.csv
      - file style_quality_id.csv
    """
    parts = rel_path.parts
    style_gt = None
    quality_gt = None
    source = "none"

    if len(parts) >= 2:
        style_gt = normalize_style_name(parts[0])
        if style_gt:
            source = "folder_style"
    if len(parts) >= 3:
        q = normalize_quality_binary(parts[1])
        if q:
            quality_gt = q
            source = "folder_style_quality"

    stem = rel_path.stem.lower()
    if style_gt is None:
        for token in stem.replace("-", "_").split("__"):
            cand = normalize_style_name(token)
            if cand:
                style_gt = cand
                source = "filename"
                break

    if quality_gt is None:
        stem_tokens = stem.replace("-", "_").split("__")
        for token in stem_tokens:
            cand = normalize_quality_binary(token)
            if cand in {"Good", "Bad"}:
                quality_gt = cand
                source = "filename" if source == "none" else source
                break
        if quality_gt is None:
            # Also catch names like freestyle_low_001.csv
            fallback = normalize_quality_binary(stem)
            if fallback in {"Good", "Bad"}:
                quality_gt = fallback
                source = "filename" if source == "none" else source

    return style_gt, quality_gt, source


def is_valid_test_result_root(p: Path) -> bool:
    """True if p is a directory with Butterfly|Freestyle|Breast subfolders (any root name, e.g. test_result or test_result_syle_only)."""
    p = Path(p)
    if not p.is_dir():
        return False
    for s in ("Butterfly", "Freestyle", "Breast"):
        if (p / s).is_dir():
            return True
    return False


# First-pass style registry folders (GRUTEST output layout). Both names are searched.
STYLE_REGISTRY_DIR_NAMES = ("test_result", "test_result_syle_only")


def discover_test_result_root(anchor: Path, data_root: Path | None = None) -> Path | None:
    """
    Locate a style-first-pass folder automatically (no manual pick).

    Recognized directory names: test_result, test_result_syle_only (each must contain
    Butterfly|Freestyle|Breast subfolders).

    Order: env SWIM_TEST_RESULT → repo root candidates → parents of anchor → cwd → Desktop → data_root chain.
    """
    env = os.environ.get("SWIM_TEST_RESULT", "").strip()
    if env:
        ep = Path(env).expanduser()
        if is_valid_test_result_root(ep):
            return ep.resolve()

    seen: set[Path] = set()
    candidates: list[Path] = []

    repo_root = Path(__file__).resolve().parent.parent
    for name in STYLE_REGISTRY_DIR_NAMES:
        candidates.append(repo_root / name)

    anchor = Path(anchor).resolve()
    start = anchor.parent if anchor.is_file() else anchor
    cur: Path | None = start
    for _ in range(10):
        if cur is None:
            break
        for name in STYLE_REGISTRY_DIR_NAMES:
            candidates.append(cur / name)
        if cur == cur.parent:
            break
        cur = cur.parent

    cwd = Path.cwd()
    for name in STYLE_REGISTRY_DIR_NAMES:
        candidates.append(cwd / name)
    desktop = Path.home() / "Desktop"
    for name in STYLE_REGISTRY_DIR_NAMES:
        candidates.append(desktop / name)

    if data_root is not None:
        dr = Path(data_root).resolve()
        cur = dr
        for _ in range(8):
            for name in STYLE_REGISTRY_DIR_NAMES:
                candidates.append(cur / name)
            if cur == cur.parent:
                break
            cur = cur.parent

    for c in candidates:
        try:
            c = c.resolve()
        except OSError:
            continue
        if c in seen:
            continue
        seen.add(c)
        if is_valid_test_result_root(c):
            return c
    return None


def find_latest_model_files():
    """
    Find the latest model files automatically.
    Returns: (model_path, scaler_path, label_mapping_path, hyperparams_path) or None if not found
    """
    # Check root directory first
    root_model = Path("best_model_segmented.pth")
    root_scaler = Path("scaler_segmented.pkl")
    root_label = Path("label_mapping_segmented.pkl")
    root_hyper = Path("hyperparameters_segmented.pkl")
    
    if all(f.exists() for f in [root_model, root_scaler, root_label, root_hyper]):
        return root_model, root_scaler, root_label, root_hyper
    
    # Check saved_models_segmented directory
    model_dir = Path("saved_models_segmented")
    if model_dir.exists():
        # Find latest timestamped files
        model_files = list(model_dir.glob("best_model_segmented_*.pth"))
        if model_files:
            # Sort by modification time, get latest
            latest_model = max(model_files, key=lambda p: p.stat().st_mtime)
            timestamp = latest_model.stem.replace("best_model_segmented_", "")
            
            scaler_file = model_dir / f"scaler_segmented_{timestamp}.pkl"
            label_file = model_dir / f"label_mapping_segmented_{timestamp}.pkl"
            hyper_file = model_dir / f"hyperparameters_segmented_{timestamp}.pkl"
            
            if all(f.exists() for f in [scaler_file, label_file, hyper_file]):
                return latest_model, scaler_file, label_file, hyper_file
    
    return None

# Import model architecture
try:
    sys.path.append(str(Path(__file__).parent.parent / 'GRU-LSTM'))
    from GRU_LSTM import GRULSTMStrokeClassifier
except ImportError:
    # Define model here if import fails
    class GRULSTMStrokeClassifier(nn.Module):
        def __init__(self, input_size, hidden_size, num_classes, num_layers=2, dropout=0.3):
            super(GRULSTMStrokeClassifier, self).__init__()
            self.hidden_size = hidden_size
            self.num_layers = num_layers
            self.bn_input = nn.BatchNorm1d(input_size)
            self.gru = nn.GRU(input_size=input_size, hidden_size=hidden_size, num_layers=num_layers,
                             batch_first=True, dropout=dropout if num_layers > 1 else 0, bidirectional=False)
            self.lstm = nn.LSTM(input_size=hidden_size, hidden_size=hidden_size, num_layers=num_layers,
                               batch_first=True, dropout=dropout if num_layers > 1 else 0, bidirectional=False)
            self.attention = nn.MultiheadAttention(embed_dim=hidden_size, num_heads=4, batch_first=True, dropout=dropout)
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


# ==================== Data Preprocessing ====================
class DataFilter:
    @staticmethod
    def apply_lowpass_filter(data, cutoff=20, fs=100, order=4):
        """Apply Butterworth low-pass filter"""
        nyquist = 0.5 * fs
        normal_cutoff = cutoff / nyquist
        b, a = signal.butter(order, normal_cutoff, btype='low', analog=False)
        filtered_data = np.zeros_like(data)
        for i in range(data.shape[1]):
            filtered_data[:, i] = signal.filtfilt(b, a, data[:, i])
        return filtered_data

    @staticmethod
    def resize_to_length(data, target_length=100):
        """Resize data to target_length samples using interpolation"""
        current_length = len(data)
        if current_length == target_length:
            return data
        
        original_indices = np.linspace(0, current_length - 1, current_length)
        target_indices = np.linspace(0, current_length - 1, target_length)
        
        resized_data = np.zeros((target_length, data.shape[1]))
        for col_idx in range(data.shape[1]):
            interp_func = interp1d(original_indices, data[:, col_idx], kind='linear',
                                  bounds_error=False, fill_value='extrapolate')
            resized_data[:, col_idx] = interp_func(target_indices)
        
        return resized_data


# ==================== Classification Functions ====================
def extract_stroke_segment(csv_file, start_time, end_time, sequence_length=100):
    """
    Extract stroke segment from CSV file and resize to sequence_length.
    Returns: numpy array of shape (sequence_length, 6) or None if error
    """
    try:
        df = pd.read_csv(csv_file)
        if 'time' not in df.columns:
            return None
        
        # Filter rows within time range
        segment_data = df[(df['time'] >= start_time) & (df['time'] <= end_time)].copy()
        
        if len(segment_data) < 10:
            return None
        
        # Extract IMU columns
        imu_cols = ['ax_filtered', 'ay_filtered', 'az_filtered',
                   'wx_filtered', 'wy_filtered', 'wz_filtered']
        
        if not all(col in segment_data.columns for col in imu_cols):
            numeric_cols = segment_data.select_dtypes(include=[np.number]).columns.tolist()
            if 'time' in numeric_cols:
                numeric_cols.remove('time')
            if len(numeric_cols) >= 6:
                imu_data = segment_data[numeric_cols[:6]].values
            else:
                return None
        else:
            imu_data = segment_data[imu_cols].values
        
        # Apply preprocessing
        imu_data = DataFilter.apply_lowpass_filter(imu_data)
        imu_data = DataFilter.resize_to_length(imu_data, target_length=sequence_length)
        
        return imu_data
        
    except Exception as e:
        print(f"Error extracting segment from {csv_file}: {e}")
        return None


def classify_stroke_segment(segment_data, model, scaler, device):
    """
    Classify a single stroke segment.
    Returns: (predicted_class, confidence_score, all_probabilities)
    """
    if segment_data is None:
        return None, 0.0, None
    
    # Normalize using scaler
    # segment_data shape: (sequence_length, 6) = (100, 6)
    # Scaler expects: (n_samples, n_features) = (100, 6)
    # After transform: (100, 6)
    # Reshape for model: (1, 100, 6)
    segment_normalized = scaler.transform(segment_data)  # (T, F) = (100, 6)
    segment_normalized = segment_normalized.reshape(1, segment_data.shape[0], segment_data.shape[1])  # (1, T, F) = (1, 100, 6)
    
    # Convert to tensor
    segment_tensor = torch.FloatTensor(segment_normalized).to(device)
    
    # Run inference
    model.eval()
    with torch.no_grad():
        outputs = model(segment_tensor)
        probs = torch.softmax(outputs, dim=1)
        confidence, pred_idx = torch.max(probs, 1)
        
        pred_idx = pred_idx.item()
        confidence = confidence.item()
        all_probs = probs.cpu().numpy()[0]
    
    return pred_idx, confidence, all_probs


# Styles that segment_strokes.segment_session() understands (order matches training folders).
KNOWN_SEGMENTATION_STYLES = ("Butterfly", "Freestyle", "Breast")


def style_from_folder_path(csv_path: Path):
    """
    If the CSV lives under a folder named Butterfly / Freestyle / Breast, use that style.
    Otherwise return None so we infer from the signal + model.
    """
    parent = csv_path.parent.name
    return parent if parent in KNOWN_SEGMENTATION_STYLES else None


def swim_style_from_class_label(label) -> str | None:
    """Map a training label (e.g. 'Freestyle', 'Breast_good') to a segmentation swim style."""
    low = str(label).lower()
    if "butterfly" in low:
        return "Butterfly"
    if "breast" in low:
        return "Breast"
    if "freestyle" in low:
        return "Freestyle"
    return None


def build_style_class_indices(idx_to_label: dict) -> dict[str, list[int]]:
    """For each swim style, collect model class indices whose labels belong to that style."""
    out = {s: [] for s in KNOWN_SEGMENTATION_STYLES}
    for idx, lab in idx_to_label.items():
        s = swim_style_from_class_label(lab)
        if s:
            out[s].append(int(idx))
    return out


def discover_quality_subfolders(test_result_root: Path, style: str) -> list[str] | None:
    """
    Immediate subfolders of test_result/<style>/ that contain CSVs (training layout).
    These names are treated as the allowed quality categories for that style (e.g. four folders).
    Returns None if the style folder is flat (no subfolders) or has a single child only.
    """
    sd = Path(test_result_root) / style
    if not sd.is_dir():
        return None
    subs = [p for p in sd.iterdir() if p.is_dir() and not p.name.startswith(".")]
    if len(subs) < 2:
        return None
    with_csv: list[str] = []
    for p in subs:
        try:
            if any(p.glob("*.csv")) or any(p.rglob("*.csv")):
                with_csv.append(p.name)
        except OSError:
            continue
    if len(with_csv) >= 2:
        return sorted(with_csv)
    return sorted(p.name for p in subs)


def indices_matching_quality_folders(
    idx_to_label: dict, style: str, folder_names: list[str]
) -> list[int]:
    """Map test_result quality subfolder names to model class indices for this swim style."""
    if not folder_names:
        return []
    out: list[int] = []
    for idx, lab in idx_to_label.items():
        if swim_style_from_class_label(lab) != style:
            continue
        low = str(lab).lower().replace(" ", "_")
        for fn in folder_names:
            fnn = fn.strip().lower().replace(" ", "_")
            if not fnn:
                continue
            if fnn in low or low.endswith(fnn) or f"_{fnn}" in low:
                out.append(int(idx))
                break
    return sorted(set(out))


def quality_tier_from_folder_prediction(predicted_class, folder_names: list[str] | None) -> str:
    """Prefer a discovered quality subfolder name when it appears in the predicted class string."""
    if not folder_names:
        return quality_tier_from_label(predicted_class)
    s = str(predicted_class).lower().replace(" ", "_")
    best = None
    best_len = 0
    for fn in sorted(folder_names, key=lambda x: len(str(x)), reverse=True):
        fnn = str(fn).strip().lower().replace(" ", "_")
        if not fnn:
            continue
        if fnn in s:
            if len(fnn) > best_len:
                best = fn
                best_len = len(fnn)
    if best is not None:
        return str(best)
    return quality_tier_from_label(predicted_class)


def find_style_from_test_result(
    csv_path: Path,
    test_result_root: Path,
    data_root: Path | None = None,
) -> tuple[str | None, str]:
    """
    Match a session CSV to the first-pass layout under test_result/<Butterfly|Freestyle|Breast>/...

    Returns (style, reason) or (None, reason).
    """
    test_result_root = Path(test_result_root)
    if not test_result_root.is_dir():
        return None, "test_result_not_a_directory"

    name = csv_path.name
    pairs: list[tuple[str, Path]] = []
    for style in KNOWN_SEGMENTATION_STYLES:
        sd = test_result_root / style
        if not sd.is_dir():
            continue
        for p in sd.rglob(name):
            pairs.append((style, p))

    if len(pairs) == 1:
        return pairs[0][0], "unique_basename_in_test_result"

    if len(pairs) == 0 and data_root is not None:
        data_root = Path(data_root).resolve()
        try:
            rel = csv_path.resolve().relative_to(data_root)
        except ValueError:
            rel = None
        if rel is not None:
            for style in KNOWN_SEGMENTATION_STYLES:
                cand = test_result_root / style / rel
                if cand.is_file():
                    return style, "relative_path_under_style_folder"
            cand2 = test_result_root / rel
            if cand2.is_file() and rel.parts and rel.parts[0] in KNOWN_SEGMENTATION_STYLES:
                return str(rel.parts[0]), "relative_path_mirrors_test_result_root"

    if len(pairs) == 0:
        return None, "no_matching_csv_in_test_result"

    # Multiple files with same basename — disambiguate with relative path
    if data_root is not None:
        try:
            rel = csv_path.resolve().relative_to(Path(data_root).resolve())
        except ValueError:
            rel = None
        if rel is not None:
            for style in KNOWN_SEGMENTATION_STYLES:
                cand = test_result_root / style / rel
                if cand.is_file():
                    return style, "disambiguated_relative_path"
            for style, p in pairs:
                try:
                    tail = p.resolve().relative_to((test_result_root / style).resolve())
                    if tail == rel or tail == Path(rel.name):
                        return style, "disambiguated_tail_match"
                except ValueError:
                    continue

    folder_guess = style_from_folder_path(csv_path)
    if folder_guess:
        for style, _p in pairs:
            if style == folder_guess:
                return style, "folder_name_matches_one_candidate"

    return pairs[0][0], "ambiguous_basename_used_first_match"


def classify_stroke_segment_within_style(
    segment_data,
    model,
    scaler,
    device,
    idx_to_label: dict,
    style: str,
    allowed_indices: list[int] | None = None,
):
    """
    Run the segmented GRU-LSTM, then pick the best class among labels that belong to
    this swim style only (e.g. Butterfly_low / Butterfly_high / …), ignoring other styles.

    If allowed_indices is set (e.g. from test_result/<style>/<quality_folder>/ names),
    softmax is restricted to those indices only.
    """
    pred_idx, confidence, all_probs = classify_stroke_segment(segment_data, model, scaler, device)
    if all_probs is None:
        return pred_idx, confidence, all_probs, "full"

    by_style = build_style_class_indices(idx_to_label)
    if allowed_indices is not None and len(allowed_indices) > 0:
        idxs = sorted({int(i) for i in allowed_indices})
    else:
        idxs = sorted(by_style.get(style, []))
    if len(idxs) == 0:
        return pred_idx, confidence, all_probs, "full"
    if len(idxs) == 1:
        return idxs[0], confidence, all_probs, "within_style"

    sub = all_probs[idxs]
    ssum = float(sub.sum())
    if ssum < 1e-12:
        return pred_idx, confidence, all_probs, "full"

    sub = sub / ssum
    j = int(np.argmax(sub))
    global_idx = idxs[j]
    conf2 = float(sub[j])
    return global_idx, conf2, all_probs, "within_style"


def _even_sample_indices(n: int, max_samples: int) -> list[int]:
    if n <= 0:
        return []
    k = min(max_samples, n)
    return np.unique(np.linspace(0, n - 1, k, dtype=int)).tolist()


def infer_segmentation_style_with_model(
    csv_path: Path,
    segment_strokes_module,
    model,
    scaler,
    idx_to_label: dict,
    sequence_length: int,
    device,
    max_samples: int = 12,
) -> tuple[str, dict]:
    """
    Try Butterfly / Freestyle / Breast segmentation; score each by how much the
    trained model's probability mass falls on classes for that swim style.
    """
    style_indices = build_style_class_indices(idx_to_label)
    scores = {}
    stroke_counts = {}

    for style in KNOWN_SEGMENTATION_STYLES:
        try:
            n, segs = segment_strokes_module.segment_session(csv_path, style)
        except Exception as e:
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
                    1.0 if pred_lab is not None and swim_style_from_class_label(pred_lab) == style else 0.0
                )

        scores[style] = float(np.mean(masses)) if masses else 0.0

    # Prefer highest model consistency; break ties by more detected strokes.
    best_style = max(
        KNOWN_SEGMENTATION_STYLES,
        key=lambda s: (scores[s], stroke_counts[s]),
    )
    if stroke_counts.get(best_style, 0) == 0:
        best_style = max(KNOWN_SEGMENTATION_STYLES, key=lambda s: stroke_counts.get(s, 0))
    if stroke_counts.get(best_style, 0) == 0:
        best_style = "Butterfly"

    return best_style, {"scores": scores, "strokes_per_style": stroke_counts}


def save_stroke_to_class_folder(
    original_data_root,
    rel_path,
    start_time,
    end_time,
    stroke_index,
    predicted_class,
    output_root=Path("classified_strokes"),
    session_cache=None,
    segmentation_style=None,
):
    """
    Save a single stroke window into a CSV file.

    If segmentation_style is set (Butterfly / Freestyle / Breast):
      output_root/{style}/{session_stem}_stroke###_{class}.csv
    (no extra quality or input subfolders—only the stroke CSV.)

    Otherwise (backward compatible):
      output_root/{predicted_class}/{session_stem}_stroke###_{class}.csv
    """
    if session_cache is None:
        session_cache = {}

    session_key = str(rel_path)
    if session_key not in session_cache:
        session_file = Path(original_data_root) / rel_path
        if not session_file.exists():
            return
        try:
            df = pd.read_csv(session_file)
        except Exception:
            return
        session_cache[session_key] = df
    else:
        df = session_cache[session_key]

    mask = (df.get("time") >= start_time) & (df.get("time") <= end_time)
    if mask is None or not mask.any():
        return

    window = df.loc[mask].copy()
    if window.empty:
        return

    output_root = Path(output_root)
    if segmentation_style:
        style_key = _safe_path_segment(segmentation_style)
        class_dir = output_root / style_key
    else:
        class_dir = output_root / str(predicted_class)
    class_dir.mkdir(parents=True, exist_ok=True)

    safe_cls = _safe_path_segment(str(predicted_class))
    session_stem = _safe_path_segment(Path(rel_path).stem)
    out_name = f"{session_stem}_stroke{int(stroke_index):03d}_{safe_cls}.csv"
    out_path = class_dir / out_name
    try:
        window.to_csv(out_path, index=False)
    except Exception:
        return


def aggregate_session_predictions(stroke_predictions):
    """
    Aggregate stroke-level predictions to get session-level prediction.
    
    Args:
        stroke_predictions: list of (class_name, confidence) tuples
    
    Returns:
        (most_common_class, confidence, class_counts)
    """
    if not stroke_predictions:
        return None, 0.0, {}
    
    # Count occurrences of each class
    class_counts = Counter([pred[0] for pred in stroke_predictions])
    
    # Most common class (majority vote)
    most_common_class, count = class_counts.most_common(1)[0]
    
    # Calculate average confidence for the most common class
    confidences_for_class = [pred[1] for pred in stroke_predictions if pred[0] == most_common_class]
    avg_confidence = np.mean(confidences_for_class) if confidences_for_class else 0.0
    
    # Calculate percentage
    percentage = (count / len(stroke_predictions)) * 100
    
    return most_common_class, avg_confidence, dict(class_counts)


def compute_eval_accuracy(df: pd.DataFrame, truth_col: str, pred_col: str):
    """Return (correct, total, acc) ignoring rows with missing truth/prediction."""
    if truth_col not in df.columns or pred_col not in df.columns:
        return 0, 0, np.nan
    valid = df[truth_col].notna() & df[pred_col].notna()
    total = int(valid.sum())
    if total == 0:
        return 0, 0, np.nan
    correct = int((df.loc[valid, truth_col] == df.loc[valid, pred_col]).sum())
    return correct, total, correct / total


# ==================== Main Classification Function ====================
def classify_segmented_sessions(segments_df, original_data_root, model_path, scaler_path,
                                label_mapping_path, hyperparams_path, device='cpu',
                                output_root=Path("classified_strokes")):
    """
    Classify all stroke segments and aggregate for session-level predictions.
    Stroke CSVs are written under output_root / {style} / when style is known.
    """
    # Load model artifacts
    print("Loading model artifacts...")
    with open(scaler_path, 'rb') as f:
        scaler = pickle.load(f)
    with open(label_mapping_path, 'rb') as f:
        idx_to_label = pickle.load(f)
    with open(hyperparams_path, 'rb') as f:
        hyperparams = pickle.load(f)
    
    label_to_idx = {v: k for k, v in idx_to_label.items()}
    sequence_length = hyperparams['sequence_length']
    
    # Load model
    model = GRULSTMStrokeClassifier(
        input_size=hyperparams['input_size'],
        hidden_size=hyperparams['hidden_size'],
        num_classes=hyperparams['num_classes'],
        num_layers=hyperparams['num_layers'],
        dropout=hyperparams['dropout']
    )
    
    model.load_state_dict(torch.load(model_path, map_location=device))
    model = model.to(device)
    model.eval()
    
    print(f"Model loaded. Classes: {list(idx_to_label.values())}")
    print(f"Sequence length: {sequence_length}\n")
    
    # Process each stroke segment
    stroke_results = []
    session_predictions = {}  # session_file -> list of (class, confidence)
    session_data_cache = {}
    
    print(f"Processing {len(segments_df)} stroke segments...")
    
    for idx, row in segments_df.iterrows():
        rel_path = row['relative_path']
        session_file = Path(original_data_root) / rel_path
        
        if not session_file.exists():
            print(f"Warning: {session_file} not found, skipping...")
            continue
        
        start_time = row['start_time']
        end_time = row['end_time']
        peak_time = row['peak_time']
        stroke_index = len(stroke_results) + 1
        
        # Extract segment
        segment_data = extract_stroke_segment(session_file, start_time, end_time, sequence_length)
        
        if segment_data is None:
            continue
        
        # Classify segment
        pred_idx, confidence, all_probs = classify_stroke_segment(segment_data, model, scaler, device)
        
        if pred_idx is None:
            continue
        
        predicted_class = idx_to_label[pred_idx]

        seg_style = row["style"] if "style" in row.index else None
        if seg_style is None or (isinstance(seg_style, float) and pd.isna(seg_style)):
            seg_style = style_from_folder_path(Path(original_data_root) / rel_path)

        # Save this stroke window into a per-class CSV file
        save_stroke_to_class_folder(
            original_data_root=original_data_root,
            rel_path=rel_path,
            start_time=start_time,
            end_time=end_time,
            stroke_index=stroke_index,
            predicted_class=predicted_class,
            session_cache=session_data_cache,
            output_root=output_root,
            segmentation_style=seg_style,
        )
        
        # Store stroke-level result
        stroke_results.append({
            'relative_path': rel_path,
            'session_file': Path(rel_path).name,
            'stroke_index': stroke_index,
            'start_time': start_time,
            'peak_time': peak_time,
            'end_time': end_time,
            'predicted_stroke_type': predicted_class,
            'predicted_quality': to_good_bad_label(predicted_class),
            'confidence': confidence,
            'predicted_class_idx': pred_idx
        })
        
        # Aggregate for session-level prediction
        session_key = rel_path
        if session_key not in session_predictions:
            session_predictions[session_key] = []
        session_predictions[session_key].append((predicted_class, confidence))
        
        if (idx + 1) % 50 == 0:
            print(f"Processed {idx + 1}/{len(segments_df)} segments...")
    
    print(f"\nProcessed {len(stroke_results)} stroke segments\n")
    
    # Create session-level results
    session_results = []
    for session_key, predictions in session_predictions.items():
        most_common_class, avg_confidence, class_counts = aggregate_session_predictions(predictions)
        
        session_results.append({
            'relative_path': session_key,
            'session_file': Path(session_key).name,
            'overall_predicted_stroke_type': most_common_class,
            'overall_predicted_quality': to_good_bad_label(most_common_class),
            'overall_confidence': avg_confidence,
            'num_strokes': len(predictions),
            'stroke_type_distribution': str(class_counts)
        })
    
    # Create DataFrames
    stroke_df = pd.DataFrame(stroke_results)
    session_df = pd.DataFrame(session_results)
    
    return stroke_df, session_df


# ==================== Single File Segmentation and Classification ====================
def segment_and_classify_single_file(csv_file, model_path, scaler_path, label_mapping_path,
                                     hyperparams_path, device='cpu',
                                     output_root=Path("classified_strokes"),
                                     test_result_root: Path | None = None,
                                     data_root: Path | None = None):
    """
    Segment a single CSV file and classify all strokes.

    **test_result** is resolved automatically (see ``discover_test_result_root``), or set
    ``SWIM_TEST_RESULT`` / pass ``test_result_root`` explicitly. Matching the session filename
    under test_result/<Style>/ tells us swim style; we segment with that style, then classify
    **quality only** within that style (masked softmax over Butterfly_* labels, etc.).

    If no match: style from input folder name, or ``infer_segmentation_style_with_model``.
    """
    import importlib.util
    segment_strokes_path = Path(__file__).parent / 'segment_strokes.py'
    spec = importlib.util.spec_from_file_location("segment_strokes", segment_strokes_path)
    segment_strokes_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(segment_strokes_module)

    csv_path = Path(csv_file)
    tr_reason = ""

    print("Loading model artifacts...")
    with open(scaler_path, 'rb') as f:
        scaler = pickle.load(f)
    with open(label_mapping_path, 'rb') as f:
        idx_to_label = pickle.load(f)
    with open(hyperparams_path, 'rb') as f:
        hyperparams = pickle.load(f)

    sequence_length = hyperparams['sequence_length']

    model = GRULSTMStrokeClassifier(
        input_size=hyperparams['input_size'],
        hidden_size=hyperparams['hidden_size'],
        num_classes=hyperparams['num_classes'],
        num_layers=hyperparams['num_layers'],
        dropout=hyperparams['dropout']
    )

    model.load_state_dict(torch.load(model_path, map_location=device))
    model = model.to(device)
    model.eval()

    print(f"Model loaded. Classes: {list(idx_to_label.values())}\n")

    print(f"Segmenting file: {csv_file}")
    use_within_style = False
    tr_reason = ""

    resolved_tr: Path | None = None
    if test_result_root:
        p = Path(test_result_root)
        if is_valid_test_result_root(p):
            resolved_tr = p.resolve()
            print(f"Using test_result (explicit): {resolved_tr}")
        else:
            print(f"Warning: {p} is not a valid test_result folder; will try auto-detect.")
    if resolved_tr is None:
        resolved_tr = discover_test_result_root(csv_path, data_root)
        if resolved_tr:
            print(f"Auto-detected test_result: {resolved_tr}")

    def _fallback_style_from_folder_or_model():
        folder_style = style_from_folder_path(csv_path)
        if folder_style:
            print(f"Using swim style from input folder name: {folder_style}")
            return folder_style, "folder"
        seg, diag = infer_segmentation_style_with_model(
            csv_path,
            segment_strokes_module,
            model,
            scaler,
            idx_to_label,
            sequence_length,
            device,
        )
        print(f"Inferred swim style for segmentation: {seg} (sensor + model scores)")
        print(f"  Scores (mean class probability mass per style): {diag['scores']}")
        print(f"  Stroke counts per segmentation mode: {diag['strokes_per_style']}")
        return seg, "inferred"

    if resolved_tr:
        tr_style, tr_reason = find_style_from_test_result(csv_path, resolved_tr, data_root)
        if tr_style:
            seg_style = tr_style
            style_source = "test_result"
            use_within_style = True
            print(f"Matched first-pass style ({tr_reason}): {seg_style}.")
        else:
            print(
                f"No matching session file under test_result ({tr_reason}). "
                "First-pass copies use the same filename as this session — check paths."
            )
            seg_style, style_source = _fallback_style_from_folder_or_model()
    else:
        print(
            "No test_result folder found. Set SWIM_TEST_RESULT, or create …/test_result/Butterfly|… "
            "near your data. Using input folder or model for swim style."
        )
        seg_style, style_source = _fallback_style_from_folder_or_model()

    quality_bundle = None
    if use_within_style and is_style_only_label_mapping(idx_to_label):
        quality_bundle = load_optional_fine_grained_classifier(device)
        if quality_bundle:
            nq = len(build_style_class_indices(quality_bundle["idx_to_label"]).get(seg_style, []))
            print(
                f"Segmented model is style-only → stroke quality from fine model: {quality_bundle['root']}\n"
                f"  Classes for {seg_style}: {nq} (e.g. low / high / moderate). "
                f"Total fine labels: {len(quality_bundle['idx_to_label'])}."
            )
        else:
            print(
                "\n*** WARNING: segmented model only predicts style (breast/butterfly/freestyle). ***\n"
                "Per-stroke quality needs labels like Freestyle_low in the model, OR place\n"
                "best_model.pth + label_mapping.pkl + scaler.pkl + hyperparameters.pkl in GRU-LSTM/\n"
                "(or set SWIM_QUALITY_MODEL_ROOT). Until then, CSV quality_tier stays n/a.\n"
            )
    elif use_within_style and not is_style_only_label_mapping(idx_to_label):
        n_cls = len(build_style_class_indices(idx_to_label).get(seg_style, []))
        print(
            f"Quality head (segmented model, masked to {seg_style}): {n_cls} class(es)."
        )

    quality_folders: list[str] | None = None
    allowed_quality_indices: list[int] | None = None
    if use_within_style and resolved_tr:
        quality_folders = discover_quality_subfolders(resolved_tr, seg_style)
        if quality_folders:
            lm_mask = (
                quality_bundle["idx_to_label"]
                if quality_bundle is not None
                else idx_to_label
            )
            allowed_quality_indices = indices_matching_quality_folders(
                lm_mask, seg_style, quality_folders
            )
            if len(allowed_quality_indices) < 2:
                print(
                    f"Quality subfolders under test_result/{seg_style}/ ({quality_folders}) "
                    f"matched fewer than 2 model classes; using full style mask instead."
                )
                allowed_quality_indices = None
            else:
                nqf = len(quality_folders)
                hint = f" ({nqf} folders)" if nqf != 4 else " (4 quality classes)"
                print(
                    f"Automatic quality classes from test_result/{seg_style}/{hint}: {quality_folders}\n"
                    f"  Masked softmax indices: {allowed_quality_indices}"
                )

    num_strokes, segments = segment_strokes_module.segment_session(csv_path, seg_style)

    if num_strokes == 0:
        print("No strokes detected in this file!")
        return None, None

    print(f"Detected {num_strokes} strokes (segmentation: {seg_style})")

    segments_df = pd.DataFrame(segments)
    segments_df['relative_path'] = csv_path.name
    segments_df['session_file'] = csv_path.name
    
    stroke_results = []
    session_data_cache = {}
    
    for idx, row in segments_df.iterrows():
        start_time = row['start_time']
        end_time = row['end_time']
        peak_time = row['peak_time']
        stroke_index = len(stroke_results) + 1
        
        # Sequence length: fine-grained model may differ from segmented training
        if use_within_style and quality_bundle is not None:
            seq_len_cls = int(quality_bundle["hyperparams"]["sequence_length"])
        else:
            seq_len_cls = sequence_length

        segment_data = extract_stroke_segment(csv_path, start_time, end_time, seq_len_cls)
        
        if segment_data is None:
            continue
        
        # Classify: quality within swim style (masked softmax over Freestyle_* etc.)
        if use_within_style and quality_bundle is not None:
            q = quality_bundle
            pred_idx, confidence, all_probs, cls_mode = classify_stroke_segment_within_style(
                segment_data,
                q["model"],
                q["scaler"],
                device,
                q["idx_to_label"],
                seg_style,
                allowed_indices=allowed_quality_indices,
            )
            label_map_used = q["idx_to_label"]
            cls_mode = (
                "within_style_quality_folders_fine_model"
                if allowed_quality_indices is not None
                else "within_style_fine_model"
            )
        elif use_within_style:
            pred_idx, confidence, all_probs, cls_mode = classify_stroke_segment_within_style(
                segment_data,
                model,
                scaler,
                device,
                idx_to_label,
                seg_style,
                allowed_indices=allowed_quality_indices,
            )
            label_map_used = idx_to_label
            if allowed_quality_indices is not None:
                cls_mode = "within_style_quality_folders"
        else:
            pred_idx, confidence, all_probs = classify_stroke_segment(
                segment_data, model, scaler, device
            )
            cls_mode = "full"
            label_map_used = idx_to_label
        
        if pred_idx is None:
            continue
        
        predicted_class = label_map_used[pred_idx]

        stroke_quality_tier = (
            quality_tier_from_folder_prediction(predicted_class, quality_folders)
            if allowed_quality_indices is not None
            else quality_tier_from_label(predicted_class)
        )

        # Save this stroke window under output_root / {segmentation_style} /
        save_stroke_to_class_folder(
            original_data_root=csv_path.parent,
            rel_path=csv_path.name,
            start_time=start_time,
            end_time=end_time,
            stroke_index=stroke_index,
            predicted_class=predicted_class,
            session_cache=session_data_cache,
            output_root=output_root,
            segmentation_style=seg_style,
        )
        
        stroke_results.append({
            'session_file': csv_path.name,
            'segmentation_style': seg_style,
            'segmentation_style_source': style_source,
            'test_result_match_reason': tr_reason if resolved_tr else "",
            'classification_scope': cls_mode,
            'quality_tier': stroke_quality_tier,
            'stroke_index': stroke_index,
            'start_time': start_time,
            'peak_time': peak_time,
            'end_time': end_time,
            'predicted_stroke_type': predicted_class,
            'predicted_quality': to_good_bad_label(predicted_class),
            'confidence': confidence,
            'predicted_class_idx': pred_idx
        })
    
    if not stroke_results:
        print("No valid strokes to classify!")
        return None, None
    
    stroke_df = pd.DataFrame(stroke_results)
    
    # Aggregate for session-level prediction
    predictions = [(row['predicted_stroke_type'], row['confidence']) for _, row in stroke_df.iterrows()]
    most_common_class, avg_confidence, class_counts = aggregate_session_predictions(predictions)

    tier_counts = Counter(row["quality_tier"] for _, row in stroke_df.iterrows())
    overall_quality_tier = tier_counts.most_common(1)[0][0] if tier_counts else ""
    
    session_df = pd.DataFrame([{
        'session_file': csv_path.name,
        'segmentation_style': seg_style,
        'segmentation_style_source': style_source,
        'overall_predicted_stroke_type': most_common_class,
        'overall_quality_tier': overall_quality_tier,
        'overall_predicted_quality': to_good_bad_label(most_common_class),
        'overall_confidence': avg_confidence,
        'num_strokes': len(stroke_results),
        'stroke_type_distribution': str(class_counts)
    }])
    
    return stroke_df, session_df


# ==================== Main ====================
if __name__ == '__main__':
    print("\n" + "="*80)
    print("SEGMENT AND CLASSIFY STROKES")
    print("="*80 + "\n")
    
    # File selection
    try:
        import tkinter as tk
        from tkinter import filedialog
        tk_available = True
    except ImportError:
        tk_available = False
    
    # Ask user: single file or folder
    print("Choose mode:")
    print("  1) One session CSV  → segment strokes → quality (style from test_result if found)")
    print("  2) Folder of session CSVs (recursive) → same for each file")
    
    if tk_available:
        choice = input("Enter choice (1 or 2) [1]: ").strip() or "1"
    else:
        choice = input("Enter choice (1 or 2) [1]: ").strip() or "1"
    
    # Try to find model files automatically
    auto_model_files = find_latest_model_files()
    
    if choice == "1":
        # Single file mode
        if tk_available:
            root = tk.Tk()
            root.withdraw()
            
            print("\nSelect CSV file to segment and classify...")
            csv_file = filedialog.askopenfilename(
                title="Select CSV file to classify",
                filetypes=[("CSV files", "*.csv"), ("All files", "*.*")]
            )
            if not csv_file:
                print("No file selected, exiting.")
                sys.exit(0)
            csv_file = Path(csv_file)
            
            # Auto-detect model files or ask user
            if auto_model_files:
                model_path, scaler_path, label_mapping_path, hyperparams_path = auto_model_files
                print(f"\nAuto-detected model files:")
                print(f"  Model: {model_path}")
                print(f"  Scaler: {scaler_path}")
                print(f"  Label mapping: {label_mapping_path}")
                print(f"  Hyperparameters: {hyperparams_path}")
                use_auto = input("Use these files? (y/n) [y]: ").strip().lower() or 'y'
                if use_auto != 'y':
                    print("Select trained model file (.pth)...")
                    model_path = Path(filedialog.askopenfilename(
                        title="Select trained model",
                        filetypes=[("PyTorch model", "*.pth"), ("All files", "*.*")]
                    ))
                    print("Select scaler file (.pkl)...")
                    scaler_path = Path(filedialog.askopenfilename(
                        title="Select scaler file",
                        filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                    ))
                    print("Select label mapping file (.pkl)...")
                    label_mapping_path = Path(filedialog.askopenfilename(
                        title="Select label mapping file",
                        filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                    ))
                    print("Select hyperparameters file (.pkl)...")
                    hyperparams_path = Path(filedialog.askopenfilename(
                        title="Select hyperparameters file",
                        filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                    ))
            else:
                print("Could not auto-detect model files. Please select manually...")
                print("Select trained model file (.pth)...")
                model_path = Path(filedialog.askopenfilename(
                    title="Select trained model",
                    filetypes=[("PyTorch model", "*.pth"), ("All files", "*.*")]
                ))
                print("Select scaler file (.pkl)...")
                scaler_path = Path(filedialog.askopenfilename(
                    title="Select scaler file",
                    filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                ))
                print("Select label mapping file (.pkl)...")
                label_mapping_path = Path(filedialog.askopenfilename(
                    title="Select label mapping file",
                    filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                ))
                print("Select hyperparameters file (.pkl)...")
                hyperparams_path = Path(filedialog.askopenfilename(
                    title="Select hyperparameters file",
                    filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                ))
        else:
            csv_file = Path(input("CSV file path: ").strip())
            
            # Auto-detect or use defaults
            if auto_model_files:
                model_path, scaler_path, label_mapping_path, hyperparams_path = auto_model_files
                print(f"\nAuto-detected model files:")
                print(f"  Model: {model_path}")
                print(f"  Scaler: {scaler_path}")
                print(f"  Label mapping: {label_mapping_path}")
                print(f"  Hyperparameters: {hyperparams_path}")
                use_auto = input("Use these files? (y/n) [y]: ").strip().lower() or 'y'
                if use_auto != 'y':
                    default_model = Path("best_model_segmented.pth")
                    default_scaler = Path("scaler_segmented.pkl")
                    default_label = Path("label_mapping_segmented.pkl")
                    default_hyper = Path("hyperparameters_segmented.pkl")
                    model_path = Path(input(f"Model file [{default_model}]: ").strip() or str(default_model))
                    scaler_path = Path(input(f"Scaler file [{default_scaler}]: ").strip() or str(default_scaler))
                    label_mapping_path = Path(input(f"Label mapping [{default_label}]: ").strip() or str(default_label))
                    hyperparams_path = Path(input(f"Hyperparameters [{default_hyper}]: ").strip() or str(default_hyper))
            else:
                default_model = Path("best_model_segmented.pth")
                default_scaler = Path("scaler_segmented.pkl")
                default_label = Path("label_mapping_segmented.pkl")
                default_hyper = Path("hyperparameters_segmented.pkl")
                model_path = Path(input(f"Model file [{default_model}]: ").strip() or str(default_model))
                scaler_path = Path(input(f"Scaler file [{default_scaler}]: ").strip() or str(default_scaler))
                label_mapping_path = Path(input(f"Label mapping [{default_label}]: ").strip() or str(default_label))
                hyperparams_path = Path(input(f"Hyperparameters [{default_hyper}]: ").strip() or str(default_hyper))
        
        data_root_match = csv_file.parent
        print("\n(test_result for swim style is detected automatically; optional override: SWIM_TEST_RESULT)\n")
        
        # Output root: per-stroke CSVs go under {style}/; summaries in this folder too
        if tk_available:
            root_out = tk.Tk()
            root_out.withdraw()
            out_pick = filedialog.askdirectory(
                title="Select folder to save results (strokes under each style folder + summary CSVs)"
            )
            root_out.destroy()
            if not out_pick:
                print("No output folder selected, exiting.")
                sys.exit(0)
            output_root = Path(out_pick)
        else:
            output_root = Path(input("Output folder for stroke CSVs and summary tables: ").strip())
        output_root.mkdir(parents=True, exist_ok=True)
        print(f"\nResults will be saved under: {output_root}")
        
        # GPU Check
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"\nUsing device: {device}\n")
        
        # Segment and classify
        print("="*60)
        print("SEGMENTING AND CLASSIFYING")
        print("="*60)
        
        stroke_df, session_df = segment_and_classify_single_file(
            csv_file,
            model_path,
            scaler_path,
            label_mapping_path,
            hyperparams_path,
            device=device,
            output_root=output_root,
            test_result_root=None,
            data_root=data_root_match,
        )
        
        if stroke_df is None:
            print("Failed to process file.")
            sys.exit(1)
        
        # Save summary tables next to stroke hierarchy
        stroke_output = output_root / f"{csv_file.stem}_stroke_classifications.csv"
        session_output = output_root / f"{csv_file.stem}_session_classification.csv"
        
        stroke_df.to_csv(stroke_output, index=False)
        session_df.to_csv(session_output, index=False)
        
        print("\n" + "="*80)
        print("CLASSIFICATION COMPLETE")
        print("="*80)
        print(f"\nStroke-level results saved to: {stroke_output}")
        print(f"Session-level results saved to: {session_output}")
        print(f"\nTotal strokes classified: {len(stroke_df)}")
        
        # Print summary
        print("\n" + "="*60)
        print("SESSION CLASSIFICATION")
        print("="*60)
        print(f"File: {csv_file.name}")
        if 'segmentation_style' in session_df.columns:
            print(f"Segmentation swim style: {session_df.iloc[0]['segmentation_style']} "
                  f"({session_df.iloc[0]['segmentation_style_source']})")
        if 'overall_quality_tier' in session_df.columns:
            print(f"Overall quality tier (majority stroke labels): {session_df.iloc[0]['overall_quality_tier']}")
        print(f"Overall predicted class (majority vote): {session_df.iloc[0]['overall_predicted_stroke_type']}")
        print(f"Confidence: {session_df.iloc[0]['overall_confidence']:.2%}")
        print(f"Number of strokes: {session_df.iloc[0]['num_strokes']}")
        print(f"Per-stroke class distribution: {session_df.iloc[0]['stroke_type_distribution']}")
        print()
    
    elif choice == "2":
        # Whole folder mode - segment all CSVs, then classify
        if tk_available:
            root = tk.Tk()
            root.withdraw()
            
            print("\nSelect folder containing CSV files to test...")
            test_folder = filedialog.askdirectory(
                title="Select folder with CSV files to test"
            )
            if not test_folder:
                print("No folder selected, exiting.")
                sys.exit(0)
            test_folder = Path(test_folder)
            
            # Auto-detect model files or ask user
            if auto_model_files:
                model_path, scaler_path, label_mapping_path, hyperparams_path = auto_model_files
                print(f"\nAuto-detected model files:")
                print(f"  Model: {model_path}")
                print(f"  Scaler: {scaler_path}")
                print(f"  Label mapping: {label_mapping_path}")
                print(f"  Hyperparameters: {hyperparams_path}")
                use_auto = input("Use these files? (y/n) [y]: ").strip().lower() or 'y'
                if use_auto != 'y':
                    print("Select trained model file (.pth)...")
                    model_path = Path(filedialog.askopenfilename(
                        title="Select trained model",
                        filetypes=[("PyTorch model", "*.pth"), ("All files", "*.*")]
                    ))
                    print("Select scaler file (.pkl)...")
                    scaler_path = Path(filedialog.askopenfilename(
                        title="Select scaler file",
                        filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                    ))
                    print("Select label mapping file (.pkl)...")
                    label_mapping_path = Path(filedialog.askopenfilename(
                        title="Select label mapping file",
                        filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                    ))
                    print("Select hyperparameters file (.pkl)...")
                    hyperparams_path = Path(filedialog.askopenfilename(
                        title="Select hyperparameters file",
                        filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                    ))
            else:
                print("Could not auto-detect model files. Please select manually...")
                print("Select trained model file (.pth)...")
                model_path = Path(filedialog.askopenfilename(
                    title="Select trained model",
                    filetypes=[("PyTorch model", "*.pth"), ("All files", "*.*")]
                ))
                print("Select scaler file (.pkl)...")
                scaler_path = Path(filedialog.askopenfilename(
                    title="Select scaler file",
                    filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                ))
                print("Select label mapping file (.pkl)...")
                label_mapping_path = Path(filedialog.askopenfilename(
                    title="Select label mapping file",
                    filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                ))
                print("Select hyperparameters file (.pkl)...")
                hyperparams_path = Path(filedialog.askopenfilename(
                    title="Select hyperparameters file",
                    filetypes=[("Pickle files", "*.pkl"), ("All files", "*.*")]
                ))
        else:
            test_folder = Path(input("Test folder path: ").strip())
            
            # Auto-detect or use defaults
            if auto_model_files:
                model_path, scaler_path, label_mapping_path, hyperparams_path = auto_model_files
                print(f"\nAuto-detected model files:")
                print(f"  Model: {model_path}")
                print(f"  Scaler: {scaler_path}")
                print(f"  Label mapping: {label_mapping_path}")
                print(f"  Hyperparameters: {hyperparams_path}")
                use_auto = input("Use these files? (y/n) [y]: ").strip().lower() or 'y'
                if use_auto != 'y':
                    default_model = Path("best_model_segmented.pth")
                    default_scaler = Path("scaler_segmented.pkl")
                    default_label = Path("label_mapping_segmented.pkl")
                    default_hyper = Path("hyperparameters_segmented.pkl")
                    model_path = Path(input(f"Model file [{default_model}]: ").strip() or str(default_model))
                    scaler_path = Path(input(f"Scaler file [{default_scaler}]: ").strip() or str(default_scaler))
                    label_mapping_path = Path(input(f"Label mapping [{default_label}]: ").strip() or str(default_label))
                    hyperparams_path = Path(input(f"Hyperparameters [{default_hyper}]: ").strip() or str(default_hyper))
            else:
                default_model = Path("best_model_segmented.pth")
                default_scaler = Path("scaler_segmented.pkl")
                default_label = Path("label_mapping_segmented.pkl")
                default_hyper = Path("hyperparameters_segmented.pkl")
                model_path = Path(input(f"Model file [{default_model}]: ").strip() or str(default_model))
                scaler_path = Path(input(f"Scaler file [{default_scaler}]: ").strip() or str(default_scaler))
                label_mapping_path = Path(input(f"Label mapping [{default_label}]: ").strip() or str(default_label))
                hyperparams_path = Path(input(f"Hyperparameters [{default_hyper}]: ").strip() or str(default_hyper))
        
        data_root_match = test_folder
        resolved_tr_folder = discover_test_result_root(test_folder, data_root_match)
        if resolved_tr_folder:
            print(f"\nUsing style registry (first-pass) for this batch: {resolved_tr_folder}\n")
        else:
            print(
                "\nNo style registry folder found (test_result / test_result_syle_only). "
                "Set SWIM_TEST_RESULT or place test_result_syle_only near the project. "
                "Per file will fall back to folder name or model inference.\n"
            )

        if tk_available:
            root_out = tk.Tk()
            root_out.withdraw()
            out_pick = filedialog.askdirectory(
                title="Select folder to save results (strokes under each style folder + summary CSVs)"
            )
            root_out.destroy()
            if not out_pick:
                print("No output folder selected, exiting.")
                sys.exit(0)
            output_root = Path(out_pick)
        else:
            output_root = Path(input("Output folder for stroke CSVs and summary tables: ").strip())
        output_root.mkdir(parents=True, exist_ok=True)
        print(f"\nResults will be saved under: {output_root}")
        
        # Find all CSV files in folder (recursively)
        csv_files = list(test_folder.rglob("*.csv"))
        if not csv_files:
            print(f"No CSV files found in {test_folder} (searched recursively)")
            sys.exit(1)
        
        print(f"\nFound {len(csv_files)} CSV files in folder (searched recursively)")
        print(f"Searching in: {test_folder} and all subdirectories")
        print("\nGround-truth labeling rules for accuracy:")
        print("  Preferred: style/quality/file.csv (example: Freestyle/low/session01.csv)")
        print("  Also valid: style/file.csv (style-only accuracy)")
        print("  Also valid filename tags: butterfly__moderate__session01.csv")
        
        # GPU Check
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"Using device: {device}\n")
        
        # Process each CSV file
        all_stroke_results = []
        all_session_results = []
        
        print("="*60)
        print("PROCESSING FOLDER")
        print("="*60)
        
        for i, csv_file in enumerate(csv_files, 1):
            # Show relative path from test_folder
            rel_path = csv_file.relative_to(test_folder)
            print(f"\n[{i}/{len(csv_files)}] Processing: {rel_path}")
            print("-" * 60)
            
            # Infer ground truth from folder/file naming
            true_style, true_quality, gt_source = infer_ground_truth_from_relative_path(rel_path)
            
            stroke_df, session_df = segment_and_classify_single_file(
                csv_file,
                model_path,
                scaler_path,
                label_mapping_path,
                hyperparams_path,
                device=device,
                output_root=output_root,
                test_result_root=resolved_tr_folder,
                data_root=data_root_match,
            )
            
            if stroke_df is not None and session_df is not None:
                # Add relative path info to results
                rel_path = csv_file.relative_to(test_folder)
                stroke_df['relative_path'] = str(rel_path)
                session_df['relative_path'] = str(rel_path)
                
                # Standardized predicted style/quality
                stroke_df['pred_style_norm'] = stroke_df['predicted_stroke_type'].apply(normalize_style_name)
                stroke_df['pred_quality_norm'] = stroke_df['quality_tier'].apply(normalize_quality_binary)
                session_df['pred_style_norm'] = session_df['segmentation_style'].apply(normalize_style_name)
                session_df['pred_quality_norm'] = session_df['overall_quality_tier'].apply(normalize_quality_binary)

                # Ground truth at session level + inherited stroke-level GT
                session_df['true_style'] = true_style
                session_df['true_quality'] = true_quality
                session_df['gt_source'] = gt_source
                stroke_df['true_style'] = true_style
                stroke_df['true_quality'] = true_quality
                stroke_df['gt_source'] = gt_source

                # File-level correctness flags
                session_df['style_correct'] = (
                    session_df['true_style'].notna() &
                    session_df['pred_style_norm'].notna() &
                    (session_df['true_style'] == session_df['pred_style_norm'])
                )
                session_df['quality_correct'] = (
                    session_df['true_quality'].notna() &
                    session_df['pred_quality_norm'].notna() &
                    (session_df['true_quality'] == session_df['pred_quality_norm'])
                )

                predicted_style = session_df.iloc[0]['pred_style_norm']
                predicted_quality = session_df.iloc[0]['pred_quality_norm']
                confidence = session_df.iloc[0]['overall_confidence']
                if true_style is not None:
                    style_mark = "✓" if bool(session_df.iloc[0]['style_correct']) else "✗"
                    print(
                        f"{style_mark} Style: Pred '{predicted_style}' vs True '{true_style}' "
                        f"(conf {confidence:.2%})"
                    )
                else:
                    print(f"✓ Processed style prediction '{predicted_style}' (no style label found)")

                if true_quality is not None:
                    quality_mark = "✓" if bool(session_df.iloc[0]['quality_correct']) else "✗"
                    print(
                        f"{quality_mark} Quality: Pred '{predicted_quality}' vs True '{true_quality}'"
                    )
                else:
                    print(f"✓ Quality prediction '{predicted_quality}' (no quality label found)")
                
                all_stroke_results.append(stroke_df)
                all_session_results.append(session_df)
                print(f"  Strokes detected: {len(stroke_df)}")
            else:
                print(f"✗ Failed to process {rel_path}")
        
        # Combine all results
        if all_stroke_results:
            combined_stroke_df = pd.concat(all_stroke_results, ignore_index=True)
            combined_session_df = pd.concat(all_session_results, ignore_index=True)
            
            stroke_output = output_root / f"folder_{test_folder.name}_stroke_classifications.csv"
            session_output = output_root / f"folder_{test_folder.name}_session_classifications.csv"
            
            combined_stroke_df.to_csv(stroke_output, index=False)
            combined_session_df.to_csv(session_output, index=False)
            
            print("\n" + "="*80)
            print("FOLDER CLASSIFICATION COMPLETE")
            print("="*80)
            print(f"\nStroke-level results saved to: {stroke_output}")
            print(f"Session-level results saved to: {session_output}")
            print(f"\nTotal files processed: {len(all_stroke_results)}")
            print(f"Total strokes classified: {len(combined_stroke_df)}")
            
            # Accuracy suite (stroke metrics kept internally; paper summary prints session quality only)
            s_correct, s_total, s_acc = compute_eval_accuracy(
                combined_stroke_df, "true_style", "pred_style_norm"
            )
            q_correct, q_total, q_acc = compute_eval_accuracy(
                combined_stroke_df, "true_quality", "pred_quality_norm"
            )
            ss_correct, ss_total, ss_acc = compute_eval_accuracy(
                combined_session_df, "true_style", "pred_style_norm"
            )
            sq_correct, sq_total, sq_acc = compute_eval_accuracy(
                combined_session_df, "true_quality", "pred_quality_norm"
            )

            print(f"\n{'='*60}")
            print("ACCURACY SUMMARY (FOR PAPER)")
            print("="*60)
            if sq_total > 0:
                print(f"Session-level QUALITY accuracy: {sq_acc:.2%} ({sq_correct}/{sq_total})")
            else:
                print("Session-level QUALITY accuracy: N/A (no quality labels found)")
            print("(Note: stroke/session style and stroke-quality metrics are still computed in output tables.)")
            print(f"{'='*60}\n")
            
            # Print summary with correctness
            print("\n" + "="*60)
            print("SESSION CLASSIFICATION SUMMARY")
            print("="*60)
            
            if 'true_style' in combined_session_df.columns:
                # Show with style/quality labels and correctness
                summary_cols = [
                    'session_file',
                    'true_style',
                    'pred_style_norm',
                    'style_correct',
                    'true_quality',
                    'pred_quality_norm',
                    'quality_correct',
                    'overall_confidence',
                    'num_strokes'
                ]
                available_cols = [col for col in summary_cols if col in combined_session_df.columns]
                print(combined_session_df[available_cols].to_string(index=False))
            else:
                # Show without true label (if folder structure doesn't provide it)
                summary_cols = ['session_file', 'overall_predicted_stroke_type', 'overall_confidence', 'num_strokes']
                print(combined_session_df[summary_cols].to_string(index=False))
            
            print()
        else:
            print("\nNo files were successfully processed.")
