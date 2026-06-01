"""
SWIMMING STROKE & HUMAN ACTIVITY CLASSIFIER - TESTING SCRIPT
============================================================
Evaluates the trained model and performs inference on new data.

Usage:
    python GRUTEST.py
    python GRUTEST.py --classify-folder "C:/data/cleaned_test" --output "C:/path/to/test_result_syle_only"
    python GRUTEST.py --classify-file session.csv -o ../test_result_syle_only
"""

import argparse
import shutil
import sys
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import confusion_matrix, accuracy_score
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
import pickle
import warnings
from scipy import signal

warnings.filterwarnings("ignore")

# ==================== Model Definition (Must match training) ====================
class GRULSTMStrokeClassifier(nn.Module):
    """
    Combined GRU-LSTM architecture with Batch Normalization
    """

    def __init__(self, input_size, hidden_size, num_classes, num_layers=2, dropout=0.3):
        super(GRULSTMStrokeClassifier, self).__init__()

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
            embed_dim=hidden_size,
            num_heads=4,
            batch_first=True,
            dropout=dropout,
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


# ==================== Data Filtering ====================
class DataFilter:
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
    def load_and_process_csv(csv_file):
        try:
            with open(csv_file, "r") as f:
                first_line = f.readline()

            has_header = any(c.isalpha() for c in first_line.split(",")[0])

            if has_header:
                df = pd.read_csv(csv_file)
                cols_to_drop = [c for c in df.columns if "time" in c.lower()]
                df = df.drop(columns=cols_to_drop, errors="ignore")
                if df.shape[1] < 6:
                    numeric_df = df.select_dtypes(include=[np.number])
                    data = numeric_df.values[:, :6]
                else:
                    data = df.values[:, :6]
            else:
                df = pd.read_csv(csv_file, header=None)
                if df.shape[1] >= 8:
                    data = df.iloc[:, [1, 2, 3, 5, 6, 7]].values
                else:
                    return None

            if np.isnan(data).any():
                df_temp = pd.DataFrame(data)
                df_temp = df_temp.ffill().bfill().fillna(0)
                data = df_temp.values

            data = DataFilter.apply_lowpass_filter(data)
            return data

        except Exception as e:
            print(f"Error processing {csv_file}: {e}")
            return None


# ==================== Test Dataset ====================
class TestDataset(Dataset):
    def __init__(self, data_dirs, sequence_length, scaler, label_mapping_path="label_mapping.pkl"):
        self.sequence_length = sequence_length
        self.scaler = scaler
        self.samples = []
        self.labels = []

        with open(label_mapping_path, "rb") as f:
            self.idx_to_label = pickle.load(f)
        self.label_to_idx = {v: k for k, v in self.idx_to_label.items()}

        for data_dir in data_dirs:
            data_path = Path(data_dir)
            if not data_path.exists():
                continue

            for folder in data_path.iterdir():
                if not folder.is_dir():
                    continue
                class_name = folder.name
                if class_name not in self.label_to_idx:
                    continue

                label_idx = self.label_to_idx[class_name]
                for csv_file in folder.glob("*.csv"):
                    data = DataFilter.load_and_process_csv(csv_file)
                    if data is None or len(data) < sequence_length:
                        continue

                    step = sequence_length // 2
                    num_windows = (len(data) - sequence_length) // step + 1
                    for i in range(num_windows):
                        start = i * step
                        end = start + sequence_length
                        window = data[start:end]
                        self.samples.append(window)
                        self.labels.append(label_idx)

        X = np.array(self.samples)
        N, T, F = X.shape
        X = self.scaler.transform(X.reshape(-1, F)).reshape(N, T, F)

        self.samples = torch.FloatTensor(X)
        self.labels = torch.LongTensor(self.labels)

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        return self.samples[idx], self.labels[idx]


# ==================== Evaluation ====================
def evaluate_model(model, test_loader, label_mapping, device="cpu"):
    model.eval()
    all_preds = []
    all_labels = []

    with torch.no_grad():
        for X, y in test_loader:
            X, y = X.to(device), y.to(device)
            outputs = model(X)
            _, pred = torch.max(outputs, 1)
            all_preds.extend(pred.cpu().numpy())
            all_labels.extend(y.cpu().numpy())

    return all_preds, all_labels


def plot_confusion_matrix(y_true, y_pred, label_mapping):
    cm = confusion_matrix(y_true, y_pred)
    labels = [label_mapping[i] for i in sorted(label_mapping.keys())]

    plt.figure(figsize=(12, 10))
    sns.heatmap(
        cm, annot=True, fmt="d", cmap="Blues", xticklabels=labels, yticklabels=labels
    )
    plt.title("Confusion Matrix")
    plt.ylabel("True Label")
    plt.xlabel("Predicted Label")
    plt.xticks(rotation=45)
    plt.tight_layout()
    plt.savefig("confusion_matrix.png")
    print("Confusion matrix saved.")


# ==================== Inference ====================
def predict_file(csv_file, model, scaler, sequence_length, label_mapping, device):
    """
    Session-level prediction: average softmax over sliding windows.
    Returns (predicted_label, confidence) or (error_string, None).
    """
    data = DataFilter.load_and_process_csv(csv_file)
    if data is None:
        return "Error reading file", None

    windows = []
    step = sequence_length // 2
    if len(data) < sequence_length:
        padded = np.zeros((sequence_length, data.shape[1]))
        padded[: len(data)] = data
        windows.append(padded)
    else:
        num_windows = (len(data) - sequence_length) // step + 1
        for i in range(num_windows):
            start = i * step
            end = start + sequence_length
            windows.append(data[start:end])

    if not windows:
        return "Not enough data", None

    X = np.array(windows)
    N, T, F = X.shape
    X = scaler.transform(X.reshape(-1, F)).reshape(N, T, F)
    X_tensor = torch.FloatTensor(X).to(device)

    model.eval()
    with torch.no_grad():
        outputs = model(X_tensor)
        probs = torch.softmax(outputs, dim=1)
        avg_probs = torch.mean(probs, dim=0)
        pred_idx = torch.argmax(avg_probs).item()

    return label_mapping[pred_idx], avg_probs[pred_idx].item()


def _sanitize_dir_name(name: str) -> str:
    bad = '<>:"/\\|?*'
    s = str(name).strip()
    for c in bad:
        s = s.replace(c, "_")
    return s or "unknown"


def _iter_csv_recursive(root: Path):
    return sorted(root.rglob("*.csv"))


def _find_training_artifacts():
    """Look for hyperparameters.pkl, scaler, label_mapping, model weights near cwd and this script."""
    roots = [Path.cwd(), Path(__file__).resolve().parent, Path(__file__).resolve().parent.parent]
    names = [
        ("hyperparameters.pkl", "scaler.pkl", "label_mapping.pkl", "best_model.pth"),
        ("hyperparameters.pkl", "scaler.pkl", "label_mapping.pkl", "gru_lstm_stroke_classifier.pth"),
    ]
    for base in roots:
        for hyper_n, sc_n, lab_n, w_n in names:
            hyper = base / hyper_n
            sc = base / sc_n
            lab = base / lab_n
            w = base / w_n
            if all(f.exists() for f in (hyper, sc, lab, w)):
                return hyper, sc, lab, w
    return None


def _load_model_bundle(device):
    found = _find_training_artifacts()
    if found is None:
        raise FileNotFoundError(
            "Could not find hyperparameters.pkl, scaler.pkl, label_mapping.pkl, and "
            "best_model.pth (or gru_lstm_stroke_classifier.pth) in the current directory "
            "or GRU-LSTM folder."
        )
    hyper_path, scaler_path, label_path, weights_path = found
    with open(hyper_path, "rb") as f:
        params = pickle.load(f)
    with open(scaler_path, "rb") as f:
        scaler = pickle.load(f)
    with open(label_path, "rb") as f:
        label_mapping = pickle.load(f)

    model = GRULSTMStrokeClassifier(
        input_size=params["input_size"],
        hidden_size=params["hidden_size"],
        num_classes=params["num_classes"],
        num_layers=params["num_layers"],
        dropout=params["dropout"],
    )
    model.load_state_dict(torch.load(weights_path, map_location=device))
    model = model.to(device)
    model.eval()
    return params, scaler, label_mapping, model, weights_path


def classify_and_copy_to_output(
    csv_path: Path,
    input_root: Path,
    output_root: Path,
    model,
    scaler,
    params,
    label_mapping,
    device,
):
    """
    Classify one CSV and copy only the original file under:
      output_root / <predicted_class> / <filename>.csv
    No input subfolders and no sidecar metadata files.
    """
    pred, conf = predict_file(
        csv_path, model, scaler, params["sequence_length"], label_mapping, device
    )
    if conf is None:
        print(f"  Skip {csv_path.name}: {pred}")
        return None

    try:
        rel = csv_path.relative_to(input_root)
        rel_str = str(rel)
    except ValueError:
        rel_str = csv_path.name

    class_dir = output_root / _sanitize_dir_name(pred)
    class_dir.mkdir(parents=True, exist_ok=True)

    dest = class_dir / csv_path.name
    if dest.exists() and dest.resolve() != csv_path.resolve():
        stem, suf = csv_path.stem, csv_path.suffix
        n = 1
        while dest.exists():
            n += 1
            dest = class_dir / f"{stem}_{n}{suf}"

    shutil.copy2(csv_path, dest)
    print(f"  {rel_str} -> [{pred}] ({conf*100:.2f}%) -> {dest}")
    return pred


def run_single_file_flow(model, scaler, params, label_mapping, device, tk, filedialog):
    root = tk.Tk()
    root.withdraw()
    csv_path = filedialog.askopenfilename(
        title="Select CSV file to classify",
        filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
    )
    root.destroy()
    if not csv_path:
        print("No file selected.")
        return
    csv_path = Path(csv_path)
    root2 = tk.Tk()
    root2.withdraw()
    out_root = filedialog.askdirectory(title="Select output folder for classified results")
    root2.destroy()
    if not out_root:
        print("No output folder selected.")
        return
    output_root = Path(out_root)
    input_root = csv_path.parent
    classify_and_copy_to_output(
        csv_path, input_root, output_root, model, scaler, params, label_mapping, device
    )
    print(f"\nDone. Results under: {output_root}")


def default_style_only_output_root() -> Path:
    """Default first-pass style registry next to the project (sibling of GRU-LSTM/)."""
    return Path(__file__).resolve().parent.parent / "test_result_syle_only"


def run_folder_flow(model, scaler, params, label_mapping, device, tk, filedialog):
    root = tk.Tk()
    root.withdraw()
    in_dir = filedialog.askdirectory(
        title="Select folder containing CSV files (subfolders are searched)"
    )
    root.destroy()
    if not in_dir:
        print("No folder selected.")
        return
    input_root = Path(in_dir)

    root2 = tk.Tk()
    root2.withdraw()
    out_root = filedialog.askdirectory(title="Select output folder for classified results")
    root2.destroy()
    if not out_root:
        print("No output folder selected.")
        return
    output_root = Path(out_root)

    files = _iter_csv_recursive(input_root)
    if not files:
        print("No CSV files found.")
        return
    print(f"\nFound {len(files)} CSV file(s). Output: {output_root}\n")
    for csv_path in files:
        classify_and_copy_to_output(
            csv_path, input_root, output_root, model, scaler, params, label_mapping, device
        )
    print(f"\nDone. Results under: {output_root}")


# ==================== Main ====================
if __name__ == "__main__":
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    cli = argparse.ArgumentParser(add_help=True)
    cli.add_argument(
        "--classify-folder",
        type=Path,
        default=None,
        help="Recursively classify all CSVs under this folder (no GUI)",
    )
    cli.add_argument(
        "--classify-file",
        type=Path,
        default=None,
        help="Classify a single session CSV (no GUI)",
    )
    cli.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output root: predicted_class/<filename>.csv (default: ../test_result_syle_only)",
    )
    cli.add_argument(
        "--input-root",
        type=Path,
        default=None,
        help="Anchor for relative paths in logs (default: folder being classified or file's parent)",
    )
    args, _unknown = cli.parse_known_args()

    try:
        import tkinter as tk
        from tkinter import filedialog

        tk_ok = True
    except ImportError:
        tk = None
        filedialog = None
        tk_ok = False

    try:
        params, scaler, label_mapping, model, weights_path = _load_model_bundle(device)
        print(f"Loaded model weights: {weights_path}")
    except Exception as e:
        print(f"Error loading model: {e}")
        sys.exit(1)

    if args.classify_folder is not None or args.classify_file is not None:
        out_root = args.output if args.output is not None else default_style_only_output_root()
        out_root = Path(out_root).resolve()
        out_root.mkdir(parents=True, exist_ok=True)
        print(f"Output root: {out_root}")

        if args.classify_file is not None:
            csv_path = Path(args.classify_file).resolve()
            if not csv_path.is_file():
                print(f"Not a file: {csv_path}")
                sys.exit(1)
            input_root = args.input_root.resolve() if args.input_root else csv_path.parent
            classify_and_copy_to_output(
                csv_path, input_root, out_root, model, scaler, params, label_mapping, device
            )
            print("Done.")
            sys.exit(0)

        folder = Path(args.classify_folder).resolve()
        if not folder.is_dir():
            print(f"Not a directory: {folder}")
            sys.exit(1)
        input_root = args.input_root.resolve() if args.input_root else folder
        files = _iter_csv_recursive(folder)
        if not files:
            print("No CSV files found.")
            sys.exit(1)
        print(f"Classifying {len(files)} CSV file(s)...")
        for csv_path in files:
            classify_and_copy_to_output(
                csv_path, input_root, out_root, model, scaler, params, label_mapping, device
            )
        print(f"Done. Results under: {out_root}")
        sys.exit(0)

    label_mapping_path = None
    for base in (Path.cwd(), Path(__file__).resolve().parent):
        lp = base / "label_mapping.pkl"
        if lp.exists():
            label_mapping_path = str(lp)
            break
    if label_mapping_path is None:
        label_mapping_path = "label_mapping.pkl"

    while True:
        print("\n--- GRU-LSTM inference ---")
        print("1. Classify a single CSV file (pick file & output folder)")
        print("2. Classify a whole folder (recursive; pick folder & output folder)")
        print("3. Evaluate on Test Set (newData)")
        print("4. Exit")
        choice = input("Enter choice [1-4]: ").strip()

        if choice == "1":
            if not tk_ok:
                p = Path(input("CSV path: ").strip().strip('"'))
                o = Path(input("Output folder: ").strip().strip('"'))
                if p.is_file() and o:
                    classify_and_copy_to_output(
                        p, p.parent, o, model, scaler, params, label_mapping, device
                    )
            else:
                run_single_file_flow(
                    model, scaler, params, label_mapping, device, tk, filedialog
                )

        elif choice == "2":
            if not tk_ok:
                inp = Path(input("Input folder: ").strip().strip('"'))
                o = Path(input("Output folder: ").strip().strip('"'))
                if inp.is_dir() and o:
                    for f in _iter_csv_recursive(inp):
                        classify_and_copy_to_output(
                            f, inp, o, model, scaler, params, label_mapping, device
                        )
            else:
                run_folder_flow(
                    model, scaler, params, label_mapping, device, tk, filedialog
                )

        elif choice == "3":
            data_dirs = ["./newData"]
            test_dataset = TestDataset(
                data_dirs, params["sequence_length"], scaler, label_mapping_path
            )
            test_loader = DataLoader(test_dataset, batch_size=32, shuffle=False)
            preds, labels = evaluate_model(model, test_loader, label_mapping, device)
            print(f"\nAccuracy: {accuracy_score(labels, preds)*100:.2f}%")
            plot_confusion_matrix(labels, preds, label_mapping)

        elif choice == "4":
            break
        else:
            print("Invalid choice.")
