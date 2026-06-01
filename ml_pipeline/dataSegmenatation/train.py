"""
TRAIN MODEL ON SEGMENTED STROKE DATA
=====================================
Trains the GRU-LSTM model using actual stroke segments (not sliding windows).

Usage:
    python train.py
    python train.py --cpu   # only if CUDA is unavailable; training defaults to GPU-only

This script:
1. Loads segmentation results (stroke_segments_detailed.csv)
2. Extracts actual stroke segments from original CSV files
3. Resizes segments to 100 samples (model input size)
4. Trains model with 70% training, 30% testing split
"""

import argparse
import os
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix, classification_report
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
import pickle
import warnings
from scipy import signal
from scipy.interpolate import interp1d
from datetime import datetime
import json

from tier_labels import is_gb_nested_layout, normalize_tier_token

warnings.filterwarnings('ignore')

# Import model architecture from GRU-LSTM.py
sys.path.append(str(Path(__file__).parent.parent / 'GRU-LSTM'))
try:
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
        """
        Resize data to target_length samples using interpolation.
        If data is shorter, interpolate. If longer, downsample.
        """
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


# ==================== Dataset Class for Segmented Data ====================
class SegmentedStrokeDataset(Dataset):
    """
    Dataset that loads actual stroke segments from segmentation results.
    Each sample is one stroke segment resized to sequence_length.
    
    Supports manual train/test split by session file.
    """
    
    def __init__(self, segments_df, original_data_root, sequence_length=100, 
                 train=True, train_sessions=None, test_sessions=None, scaler=None):
        """
        Args:
            segments_df: DataFrame with segmentation results
            original_data_root: Root folder containing CSV files
            sequence_length: Target sequence length (default 100)
            train: True for training set, False for test set
            train_sessions: List of session file names (relative paths) for training
            test_sessions: List of session file names (relative paths) for testing
            scaler: Pre-fitted StandardScaler (required for test set)
        """
        self.sequence_length = sequence_length
        self.scaler = scaler
        self.train = train
        
        # Extract segments and labels
        all_segments = []
        all_labels = []
        label_to_idx = {}
        idx_to_label = {}
        current_idx = 0
        
        print(f"Loading segments from {len(segments_df)} stroke segments...")
        
        # Filter segments based on train/test split
        if train:
            if train_sessions is None:
                raise ValueError("train_sessions must be provided for training set")
            # Only process segments from training sessions
            filtered_df = segments_df[segments_df['relative_path'].isin(train_sessions)]
            print(f"Using {len(filtered_df)} segments from {len(train_sessions)} training sessions")
        else:
            if test_sessions is None:
                raise ValueError("test_sessions must be provided for test set")
            # Only process segments from test sessions
            filtered_df = segments_df[segments_df['relative_path'].isin(test_sessions)]
            print(f"Using {len(filtered_df)} segments from {len(test_sessions)} test sessions")
       
        # Track stroke order per session so we can map segmentation rows to
        # per-stroke CSV files written as stroke001_sessionname.csv, etc.
        session_stroke_counters = {}

        for idx, row in filtered_df.iterrows():
            # Get session file path
            rel_path = row['relative_path']
            session_file = Path(original_data_root) / rel_path
            stroke_number = session_stroke_counters.get(rel_path, 0) + 1
            session_stroke_counters[rel_path] = stroke_number
            
            # Get stroke type from folder name (e.g., Freestyle/session11.csv -> Freestyle)
            style = Path(rel_path).parts[0] if len(Path(rel_path).parts) > 1 else "Unknown"
            
            # Create label mapping
            if style not in label_to_idx:
                label_to_idx[style] = current_idx
                idx_to_label[current_idx] = style
                current_idx += 1
            
            label_idx = label_to_idx[style]
            
            # Load original CSV
            try:
                if session_file.exists():
                    df = pd.read_csv(session_file)
                    if 'time' not in df.columns:
                        print(f"Warning: No 'time' column in {session_file}, skipping...")
                        continue

                    # Standard mode: extract stroke window from full session CSV.
                    start_time = row['start_time']
                    end_time = row['end_time']
                    segment_data = df[(df['time'] >= start_time) & (df['time'] <= end_time)].copy()
                else:
                    # Fallback mode: read pre-segmented stroke CSVs produced by
                    # segment_strokes.py in style folders.
                    stroke_file = (
                        Path(original_data_root)
                        / style
                        / f"stroke{stroke_number:03d}_{Path(rel_path).stem}.csv"
                    )
                    if not stroke_file.exists():
                        print(f"Warning: {session_file} not found, and fallback stroke file {stroke_file} not found, skipping...")
                        continue
                    segment_data = pd.read_csv(stroke_file)
                
                if len(segment_data) < 10:  # Too short, skip
                    continue
                
                # Extract IMU columns (6 features)
                imu_cols = ['ax_filtered', 'ay_filtered', 'az_filtered', 
                           'wx_filtered', 'wy_filtered', 'wz_filtered']
                
                if not all(col in segment_data.columns for col in imu_cols):
                    # Try alternative column names
                    numeric_cols = segment_data.select_dtypes(include=[np.number]).columns.tolist()
                    if 'time' in numeric_cols:
                        numeric_cols.remove('time')
                    if len(numeric_cols) >= 6:
                        imu_data = segment_data[numeric_cols[:6]].values
                    else:
                        continue
                else:
                    imu_data = segment_data[imu_cols].values
                
                # Apply low-pass filter
                imu_data = DataFilter.apply_lowpass_filter(imu_data)
                
                # Resize to sequence_length
                imu_data = DataFilter.resize_to_length(imu_data, target_length=sequence_length)
                
                all_segments.append(imu_data)
                all_labels.append(label_idx)
                
            except Exception as e:
                print(f"Error processing {session_file}: {e}")
                continue
        
        if not all_segments:
            raise ValueError("No valid segments found!")
        
        # Convert to numpy arrays
        X = np.array(all_segments)  # Shape: (n_segments, sequence_length, 6)
        y = np.array(all_labels)
        
        print(f"Loaded {len(X)} stroke segments")
        print(f"Classes: {idx_to_label}")
        
        # No automatic split - data is already filtered by train/test sessions
        self.data = X
        self.targets = y
        
        if train:
            # Fit scaler on training data
            if self.scaler is None:
                self.scaler = StandardScaler()
                N, T, F = self.data.shape
                self.scaler.fit(self.data.reshape(-1, F))
                print("Scaler fitted on training data.")
        else:
            if self.scaler is None:
                raise ValueError("Scaler must be provided for test set.")
        
        # Transform data
        N, T, F = self.data.shape
        self.data = self.scaler.transform(self.data.reshape(-1, F)).reshape(N, T, F)
        
        # Convert to tensors
        self.samples = torch.FloatTensor(self.data)
        self.labels = torch.LongTensor(self.targets)
        
        self.label_to_idx = label_to_idx
        self.idx_to_label = idx_to_label
        
        print(f"{'Training' if train else 'Test'} set: {len(self.samples)} samples")
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        return self.samples[idx], self.labels[idx]


class FolderStrokeDataset(Dataset):
    """
    Dataset that loads per-stroke CSV files from either:

    - **Flat layout**: ``root_folder/<ClassName>/*.csv`` (e.g. ``Butterfly_Low``, ``Freestyle_High``).
    - **GB nested layout**: ``root_folder/GB/<Butterfly|Freestyle|Breast>/<tier_folder>/*.csv``
      Tier folder names are normalized via ``tier_labels.normalize_tier_token`` (LOW, Modrate, …).

    ``layout``:
      - ``\"auto\"`` (default): use GB nested if ``tier_labels.is_gb_nested_layout`` holds, else flat.
      - ``\"flat\"`` / ``\"nested_gb\"``: force that layout.
    """

    KNOWN_STYLES = ("Butterfly", "Freestyle", "Breast")

    def __init__(self, root_folder, sequence_length=100, scaler=None, layout="auto"):
        self.sequence_length = sequence_length
        self.scaler = scaler
        self.root_folder = Path(root_folder)
        self.layout_used = layout

        if layout == "auto":
            self.layout_used = "nested_gb" if is_gb_nested_layout(self.root_folder) else "flat"

        samples_by_class: dict[str, list[Path]] = {}

        if self.layout_used == "nested_gb":
            gb = self.root_folder / "GB"
            if not gb.is_dir():
                raise ValueError(f"nested_gb layout requires {gb} to exist")
            for style in self.KNOWN_STYLES:
                sd = gb / style
                if not sd.is_dir():
                    continue
                for tier_dir in sorted([p for p in sd.iterdir() if p.is_dir()]):
                    tok = normalize_tier_token(tier_dir.name)
                    if tok is None:
                        continue
                    class_name = f"{style}_{tok}"
                    for csv_file in sorted(tier_dir.rglob("*.csv")):
                        samples_by_class.setdefault(class_name, []).append(csv_file)
        else:
            for class_dir in sorted([p for p in self.root_folder.iterdir() if p.is_dir()]):
                if class_dir.name == "GB":
                    continue
                class_name = class_dir.name
                for csv_file in sorted(class_dir.rglob("*.csv")):
                    samples_by_class.setdefault(class_name, []).append(csv_file)

        class_names = sorted(samples_by_class.keys())
        samples_by_class = {k: samples_by_class[k] for k in class_names if samples_by_class[k]}
        class_names = sorted(samples_by_class.keys())
        if not class_names:
            raise ValueError(
                f"No stroke CSV files found under {self.root_folder} (layout={self.layout_used})"
            )

        label_to_idx = {name: i for i, name in enumerate(class_names)}
        idx_to_label = {i: name for i, name in enumerate(class_names)}

        all_segments = []
        all_labels = []

        for class_name in class_names:
            class_idx = label_to_idx[class_name]
            for csv_file in samples_by_class[class_name]:
                try:
                    df = pd.read_csv(csv_file)
                    imu_cols = ['ax_filtered', 'ay_filtered', 'az_filtered',
                                'wx_filtered', 'wy_filtered', 'wz_filtered']
                    if all(col in df.columns for col in imu_cols):
                        imu_data = df[imu_cols].values
                    else:
                        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
                        if 'time' in numeric_cols:
                            numeric_cols.remove('time')
                        if len(numeric_cols) < 6:
                            continue
                        imu_data = df[numeric_cols[:6]].values

                    if len(imu_data) < 10:
                        continue

                    imu_data = DataFilter.apply_lowpass_filter(imu_data)
                    imu_data = DataFilter.resize_to_length(imu_data, target_length=sequence_length)
                    all_segments.append(imu_data)
                    all_labels.append(class_idx)
                except Exception:
                    continue

        if not all_segments:
            raise ValueError("No valid stroke CSV files found in class folders")

        print(f"FolderStrokeDataset layout: {self.layout_used} ({len(class_names)} classes)")

        X = np.array(all_segments)
        y = np.array(all_labels)

        if self.scaler is None:
            self.scaler = StandardScaler()
            N, T, F = X.shape
            self.scaler.fit(X.reshape(-1, F))

        N, T, F = X.shape
        X = self.scaler.transform(X.reshape(-1, F)).reshape(N, T, F)

        self.samples = torch.FloatTensor(X)
        self.labels = torch.LongTensor(y)
        self.label_to_idx = label_to_idx
        self.idx_to_label = idx_to_label

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        return self.samples[idx], self.labels[idx]


# ==================== Training Function (No Test Set) ====================
def train_model_no_test(model, train_loader, num_epochs=50, learning_rate=0.001, device='cpu'):
    """Train model without test set (for final model training)"""
    model = model.to(device)
    
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=learning_rate, weight_decay=1e-5)
    
    train_losses = []
    train_accuracies = []
    best_model_state = None
    
    print(f"Training on device: {device}\n")
    
    for epoch in range(num_epochs):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        
        for i, (X, y) in enumerate(train_loader):
            X = X.to(device)
            y = y.to(device)
            if y.dim() > 1:
                y = y.squeeze()
            if y.dim() == 0:
                y = y.view(1)
            
            optimizer.zero_grad()
            outputs = model(X)
            loss = criterion(outputs, y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            
            train_loss += loss.item()
            _, predicted = torch.max(outputs.data, 1)
            batch_size = y.shape[0] if y.dim() > 0 else 1
            train_total += batch_size
            train_correct += (predicted == y).sum().item()
        
        train_loss /= len(train_loader)
        train_acc = 100 * train_correct / train_total
        train_losses.append(train_loss)
        train_accuracies.append(train_acc)
        
        if (epoch + 1) % 5 == 0:
            print(f'Epoch [{epoch+1}/{num_epochs}], Loss: {train_loss:.4f}, Train Acc: {train_acc:.2f}%')
    
    print(f"\n{'='*60}")
    print(f"Training Complete!")
    print(f"Final Training Accuracy: {train_accuracies[-1]:.2f}%")
    print(f"{'='*60}\n")
    
    best_model_state = model.state_dict().copy()
    return train_losses, train_accuracies, [], best_model_state


# ==================== Training Function ====================
def train_model(model, train_loader, test_loader, num_epochs=50, learning_rate=0.001, device='cpu'):
    """Train the GRU-LSTM model"""
    model = model.to(device)
    
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=learning_rate, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='max', factor=0.5, patience=5)
    
    train_losses = []
    test_accuracies = []
    train_accuracies = []
    best_test_acc = 0.0
    best_model_state = None
    
    print(f"Training on device: {device}\n")
    
    for epoch in range(num_epochs):
        # Training Phase
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        
        for i, (X, y) in enumerate(train_loader):
            X = X.to(device)
            y = y.to(device)
            if y.dim() > 1:
                y = y.squeeze()
            if y.dim() == 0:
                y = y.view(1)
            
            optimizer.zero_grad()
            outputs = model(X)
            loss = criterion(outputs, y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            
            train_loss += loss.item()
            _, predicted = torch.max(outputs.data, 1)
            batch_size = y.shape[0] if y.dim() > 0 else 1
            train_total += batch_size
            train_correct += (predicted == y).sum().item()
        
        train_loss /= len(train_loader)
        train_acc = 100 * train_correct / train_total
        train_losses.append(train_loss)
        train_accuracies.append(train_acc)
        
        # Validation Phase
        model.eval()
        test_correct = 0
        test_total = 0
        
        with torch.no_grad():
            for X, y in test_loader:
                X = X.to(device)
                y = y.to(device)
                if y.dim() > 1:
                    y = y.squeeze()
                if y.dim() == 0:
                    y = y.view(1)
                
                outputs = model(X)
                _, predicted = torch.max(outputs.data, 1)
                batch_size = y.shape[0] if y.dim() > 0 else 1
                test_total += batch_size
                test_correct += (predicted == y).sum().item()
        
        test_acc = 100 * test_correct / test_total
        test_accuracies.append(test_acc)
        scheduler.step(test_acc)
        
        if test_acc > best_test_acc:
            best_test_acc = test_acc
            best_model_state = model.state_dict().copy()
        
        if (epoch + 1) % 5 == 0:
            print(f'Epoch [{epoch+1}/{num_epochs}], Loss: {train_loss:.4f}, '
                  f'Train Acc: {train_acc:.2f}%, Val Acc: {test_acc:.2f}%')
    
    print(f"\n{'='*60}")
    print(f"Training Complete!")
    print(f"Best Validation Accuracy: {best_test_acc:.2f}%")
    print(f"Final Validation Accuracy: {test_accuracies[-1]:.2f}%")
    print(f"{'='*60}\n")
    
    if best_model_state is None:
        best_model_state = model.state_dict().copy()
    
    return train_losses, train_accuracies, test_accuracies, best_model_state


# ==================== Evaluation Function ====================
def evaluate_model_comprehensive(model, test_loader, label_mapping, device='cpu'):
    """Comprehensive evaluation"""
    model.eval()
    all_preds = []
    all_labels = []
    
    with torch.no_grad():
        for X, y in test_loader:
            X = X.to(device)
            y = y.to(device)
            if y.dim() > 1:
                y = y.squeeze()
            if y.dim() == 0:
                y = y.view(1)
            
            outputs = model(X)
            _, predicted = torch.max(outputs.data, 1)
            
            pred_np = predicted.cpu().numpy()
            label_np = y.cpu().numpy()
            
            if pred_np.ndim == 0:
                pred_np = np.array([pred_np.item()])
            if label_np.ndim == 0:
                label_np = np.array([label_np.item()])
            
            all_preds.extend(pred_np)
            all_labels.extend(label_np)
    
    all_preds = np.array(all_preds)
    all_labels = np.array(all_labels)
    
    overall_accuracy = accuracy_score(all_labels, all_preds)
    precision, recall, f1, support = precision_recall_fscore_support(
        all_labels, all_preds, average=None, zero_division=0
    )
    cm = confusion_matrix(all_labels, all_preds)
    class_names = [label_mapping[i] for i in sorted(label_mapping.keys())]
    
    return {
        'overall_accuracy': overall_accuracy,
        'predictions': all_preds,
        'labels': all_labels,
        'precision': precision,
        'recall': recall,
        'f1': f1,
        'support': support,
        'confusion_matrix': cm,
        'class_names': class_names
    }


def print_evaluation_report(eval_results, label_mapping):
    """Print evaluation report"""
    print("\n" + "="*80)
    print("COMPREHENSIVE EVALUATION REPORT")
    print("="*80)
    print(f"\n{'OVERALL ACCURACY':<30}: {eval_results['overall_accuracy']*100:.2f}%")
    print(f"\n{'PER-CLASS METRICS':<30}")
    print("-"*80)
    print(f"{'Class':<20} {'Precision':<12} {'Recall':<12} {'F1-Score':<12} {'Support':<12}")
    print("-"*80)
    
    class_names = eval_results['class_names']
    precision = eval_results['precision']
    recall = eval_results['recall']
    f1 = eval_results['f1']
    support = eval_results['support']
    cm = eval_results['confusion_matrix']
    per_class_accuracy = cm.diagonal() / cm.sum(axis=1)
    
    for i, class_name in enumerate(class_names):
        print(f"{class_name:<20} {precision[i]*100:>10.2f}%  {recall[i]*100:>10.2f}%  {f1[i]*100:>10.2f}%  {int(support[i]):>10}")
    
    print("-"*80)


# ==================== Main ====================
if __name__ == '__main__':
    _parser = argparse.ArgumentParser(
        description='Train GRU-LSTM on segmented stroke data (CUDA GPU required by default).'
    )
    _parser.add_argument(
        '--cpu',
        action='store_true',
        help='Train on CPU (slow). Default: require a CUDA GPU.',
    )
    _args = _parser.parse_args()

    print("\n" + "="*80)
    print("TRAIN MODEL ON SEGMENTED STROKE DATA")
    print("="*80 + "\n")
    
    # Configuration
    try:
        import tkinter as tk
        from tkinter import filedialog
        tk_available = True
    except ImportError:
        tk_available = False
    
    # Choose training source mode
    print("Choose training data mode:")
    print("  1) segmentation CSV + original sessions (existing mode)")
    print("  2) class folders from Feature_extraction output (new mode)")
    mode = input("Enter choice (1 or 2) [2]: ").strip() or "2"
    
    # Hyperparameters
    sequence_length = 100
    hidden_size = 64
    batch_size = 16
    num_epochs = 50
    learning_rate = 0.001
    num_layers = 2
    dropout = 0.3
    
    if _args.cpu:
        device = torch.device('cpu')
        print("[INFO] Training on CPU (--cpu). This will be slow.\n")
    elif not torch.cuda.is_available():
        print("ERROR: Training requires a CUDA GPU (PyTorch built with CUDA and drivers working).")
        print("  Check: nvidia-smi")
        print("  Install CUDA PyTorch from https://pytorch.org/get-started/locally/")
        print("  To train on CPU anyway: python train.py --cpu")
        sys.exit(1)
    else:
        device = torch.device('cuda')
        print(f"[OK] GPU: {torch.cuda.get_device_name(0)}")
        print(f"[OK] CUDA: {torch.version.cuda}\n")

    if device.type == 'cuda':
        try:
            _t = torch.randn(1, 1).to(device)
            print(f"[VERIFIED] GPU ready ({_t.device})\n")
            del _t
            torch.cuda.empty_cache()
        except Exception as e:
            print(f"ERROR: GPU initialization failed: {e}")
            print("Fix CUDA/drivers, or run with --cpu.")
            sys.exit(1)

    print(f"Using device: {device}\n")

    print("="*60)
    print("LOADING TRAINING DATA")
    print("="*60)
    if mode == "1":
        if tk_available:
            root = tk.Tk()
            root.withdraw()
            print("Select the segmentation results CSV file (stroke_segments_detailed.csv)...")
            segments_file = filedialog.askopenfilename(
                title="Select segmentation results CSV",
                filetypes=[("CSV files", "*.csv"), ("All files", "*.*")]
            )
            if not segments_file:
                print("No file selected, exiting.")
                sys.exit(0)
            segments_file = Path(segments_file)

            print("Select the folder containing original CSV session files...")
            original_data_root = filedialog.askdirectory(
                title="Select folder with original CSV files"
            )
            if not original_data_root:
                print("No folder selected, exiting.")
                sys.exit(0)
            original_data_root = Path(original_data_root)
            root.destroy()
        else:
            default_segments = Path("stroke_segments_detailed.csv")
            default_root = Path(".")
            segments_file = Path(input(f"Enter path to segmentation CSV [{default_segments}]: ").strip() or str(default_segments))
            original_data_root = Path(input(f"Enter path to original data folder [{default_root}]: ").strip() or str(default_root))

        print(f"\nLoading segmentation results from: {segments_file}")
        segments_df = pd.read_csv(segments_file)
        print(f"Found {len(segments_df)} stroke segments")
        unique_sessions = sorted(segments_df['relative_path'].unique())
        print(f"\nFound {len(unique_sessions)} unique sessions")
        train_sessions = unique_sessions

        train_dataset = SegmentedStrokeDataset(
            segments_df,
            original_data_root,
            sequence_length=sequence_length,
            train=True,
            train_sessions=train_sessions,
            test_sessions=None,
            scaler=None
        )
    else:
        if tk_available:
            root = tk.Tk()
            root.withdraw()
            print("Select root folder that contains class/risk folders with stroke CSV files...")
            class_root = filedialog.askdirectory(
                title="Select root folder with class/risk subfolders"
            )
            root.destroy()
            if not class_root:
                print("No folder selected, exiting.")
                sys.exit(0)
            class_root = Path(class_root)
        else:
            default_root = Path("classified_strokes")
            class_root = Path(input(f"Enter class-folder root [{default_root}]: ").strip() or str(default_root))

        print(f"\nLoading class-folder dataset from: {class_root}")
        train_dataset = FolderStrokeDataset(
            class_root,
            sequence_length=sequence_length,
            scaler=None
        )
    
    print("="*60)
    print("NO TEST SET - Training on all provided data")
    print("="*60)
    print("You can test the model later using segment_and_classify.py on new CSV files")
    test_dataset = None
    
    sample_data, _ = train_dataset[0]
    input_size = sample_data.shape[1]  
    num_classes = len(train_dataset.idx_to_label)
    
    print(f"\n{'='*60}")
    print("DATASET INFORMATION")
    print("="*60)
    print(f"Input size (features): {input_size}")
    print(f"Sequence length: {sequence_length}")
    print(f"Number of classes: {num_classes}")
    print(f"Classes: {train_dataset.idx_to_label}")
    print(f"Training samples: {len(train_dataset)}")
    print(f"Test samples: 0 (no test set - will test manually later)")
    print()
    
    # Create data loaders
    _pin = device.type == 'cuda'
    train_loader = DataLoader(
        train_dataset, batch_size=batch_size, shuffle=True, num_workers=0, pin_memory=_pin
    )
    test_loader = None
    
    # Initialize model
    model = GRULSTMStrokeClassifier(
        input_size=input_size,
        hidden_size=hidden_size,
        num_classes=num_classes,
        num_layers=num_layers,
        dropout=dropout
    )
    
    print("="*60)
    print("MODEL ARCHITECTURE")
    print("="*60)
    print(model)
    print(f"\nTotal parameters: {sum(p.numel() for p in model.parameters()):,}\n")
    
    # Save artifacts before training
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    model_save_dir = Path('saved_models_segmented')
    model_save_dir.mkdir(exist_ok=True)
    
    print("="*60)
    print("SAVING ARTIFACTS")
    print("="*60)
    
    scaler_path = model_save_dir / f'scaler_segmented_{timestamp}.pkl'
    label_mapping_path = model_save_dir / f'label_mapping_segmented_{timestamp}.pkl'
    hyperparams_path = model_save_dir / f'hyperparameters_segmented_{timestamp}.pkl'
    
    with open(scaler_path, 'wb') as f:
        pickle.dump(train_dataset.scaler, f)
    with open(label_mapping_path, 'wb') as f:
        pickle.dump(train_dataset.idx_to_label, f)
    
    hyperparams = {
        'input_size': input_size,
        'hidden_size': hidden_size,
        'num_classes': num_classes,
        'num_layers': num_layers,
        'dropout': dropout,
        'sequence_length': sequence_length,
        'timestamp': timestamp,
        'training_method': 'segmented_strokes'
    }
    with open(hyperparams_path, 'wb') as f:
        pickle.dump(hyperparams, f)
    
    # Also save latest versions
    with open('scaler_segmented.pkl', 'wb') as f:
        pickle.dump(train_dataset.scaler, f)
    with open('label_mapping_segmented.pkl', 'wb') as f:
        pickle.dump(train_dataset.idx_to_label, f)
    with open('hyperparameters_segmented.pkl', 'wb') as f:
        pickle.dump(hyperparams, f)
    
    print(f"[OK] Artifacts saved")
    print()
    
    # Train model
    print("="*60)
    print("STARTING TRAINING")
    print("="*60 + "\n")
    print("Training on all provided data (no validation set)")
    print("You can test the model later using segment_and_classify.py\n")
    
    try:
        train_losses, train_accs, test_accuracies, best_model_state = train_model_no_test(
            model, train_loader,
            num_epochs=num_epochs,
            learning_rate=learning_rate,
            device=device
        )
        
        if best_model_state is not None:
            model.load_state_dict(best_model_state)
        
        # Plot training results
        plt.figure(figsize=(15, 5))
        plt.subplot(1, 3, 1)
        plt.plot(train_losses, label='Training Loss')
        plt.xlabel('Epoch')
        plt.ylabel('Loss')
        plt.title('Training Loss')
        plt.legend()
        plt.grid(True)
        
        plt.subplot(1, 3, 2)
        plt.plot(train_accs, label='Training Accuracy')
        plt.plot(test_accuracies, label='Validation Accuracy')
        plt.xlabel('Epoch')
        plt.ylabel('Accuracy (%)')
        plt.title('Accuracy Over Time')
        plt.legend()
        plt.grid(True)
        
        plt.subplot(1, 3, 3)
        plt.plot(test_accuracies)
        plt.xlabel('Epoch')
        plt.ylabel('Validation Accuracy (%)')
        plt.title('Validation Accuracy')
        plt.grid(True)
        
        plt.tight_layout()
        training_plot_path = model_save_dir / f'training_results_segmented_{timestamp}.png'
        plt.savefig(training_plot_path, dpi=150)
        plt.savefig('training_results_segmented.png', dpi=150)
        print(f"[OK] Training plot saved")
        
        # Save model
        model_path = model_save_dir / f'model_segmented_{timestamp}.pth'
        best_model_path = model_save_dir / f'best_model_segmented_{timestamp}.pth'
        
        torch.save(model.state_dict(), model_path)
        if best_model_state is not None:
            torch.save(best_model_state, best_model_path)
        
        torch.save(model.state_dict(), 'model_segmented.pth')
        if best_model_state is not None:
            torch.save(best_model_state, 'best_model_segmented.pth')
        
        print(f"[OK] Model saved")
        
        # No evaluation - user will test manually
        print("\n" + "="*80)
        print("TRAINING COMPLETE")
        print("="*80)
        print("\nModel has been trained on all provided data.")
        print("To test the model, use segment_and_classify.py with new CSV files.")
        print("\nExample:")
        print("  python segment_and_classify.py")
        print("  -> Choose Option 1: Single File")
        print("  -> Select your test CSV file")
        print("  -> Get classification results")
        
        print("\n" + "="*80)
        print("Training completed successfully!")
        print(f"Model files saved in: {model_save_dir}")
        print("="*80)
        
    except KeyboardInterrupt:
        print("\nTraining interrupted by user.")
    except Exception as e:
        print(f"\nAn error occurred: {e}")
        import traceback
        traceback.print_exc()
