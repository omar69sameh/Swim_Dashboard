"""
SWIMMING STROKE CLASSIFIER - TRAINING SCRIPT
============================================
Detects swimming stroke types using accelerometer and gyroscope data.

Usage:
    python GRU-LSTM.py
        (opens a folder dialog to pick the data root if --data-root is omitted)
    python GRU-LSTM.py --data-root "C:/path/to/NewSensorRealData"
    python GRU-LSTM.py --cpu --data-root "..."   # only if you cannot use CUDA
    python GRU-LSTM.py --eval-only --model-path best_model.pth

Data structure:
    Root folder (e.g. NewSensorRealData/) with one subfolder per class label;
    each class folder contains CSV files (header: time, ax, ay, az, wx, wy, wz).
"""

import argparse
import os
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
from pathlib import Path
import pickle
import warnings
from scipy import signal
import traceback
from datetime import datetime
import json

warnings.filterwarnings('ignore')

# ==================== Data Filtering & Preprocessing ====================
class DataFilter:
    """Filter and standardize sensor data from CSV files"""
    
    @staticmethod
    def apply_lowpass_filter(data, cutoff=20, fs=100, order=4):
        """Apply Butterworth low-pass filter to remove noise"""
        nyquist = 0.5 * fs
        normal_cutoff = cutoff / nyquist
        b, a = signal.butter(order, normal_cutoff, btype='low', analog=False)
        
        # Apply filter to each column
        filtered_data = np.zeros_like(data)
        for i in range(data.shape[1]):
            filtered_data[:, i] = signal.filtfilt(b, a, data[:, i])
            
        return filtered_data

    @staticmethod
    def load_and_process_csv(csv_file):
        """
        Load CSV, handle different formats, and apply filtering.
        Returns: numpy array of shape (n_samples, 6) -> [ax, ay, az, gx, gy, gz]
        """
        try:
            # Check if file is from humanData (no header) or newData (header)
            # Heuristic: Check first line. If it contains letters, it has a header.
            with open(csv_file, 'r') as f:
                first_line = f.readline()
            
            has_header = any(c.isalpha() for c in first_line.split(',')[0])
            
            if has_header:
                # Format: time, ax, ay, az, wx, wy, wz (newData)
                df = pd.read_csv(csv_file)
                # Drop time column (usually first column or named 'time')
                cols_to_drop = [c for c in df.columns if 'time' in c.lower()]
                df = df.drop(columns=cols_to_drop, errors='ignore')
                
                # Ensure we have 6 columns
                if df.shape[1] < 6:
                    # Try to find specific columns if possible, otherwise take first 6 numeric
                    numeric_df = df.select_dtypes(include=[np.number])
                    if numeric_df.shape[1] < 6:
                        return None
                    data = numeric_df.values[:, :6]
                else:
                    # Select only numeric columns and convert to float
                    numeric_df = df.select_dtypes(include=[np.number])
                    if numeric_df.shape[1] < 6:
                        return None
                    data = numeric_df.values[:, :6]
                    
            else:
                # Format: t1, ax, ay, az, t2, gx, gy, gz (humanData)
                # Read without header
                df = pd.read_csv(csv_file, header=None)
                
                # Expected columns: 0:t1, 1:ax, 2:ay, 3:az, 4:t2, 5:gx, 6:gy, 7:gz
                # We want cols 1,2,3 (acc) and 5,6,7 (gyro)
                if df.shape[1] >= 8:
                    # Select only numeric columns
                    selected_cols = df.iloc[:, [1, 2, 3, 5, 6, 7]]
                    # Convert to numeric, coercing errors to NaN
                    for col_idx in range(selected_cols.shape[1]):
                        selected_cols.iloc[:, col_idx] = pd.to_numeric(selected_cols.iloc[:, col_idx], errors='coerce')
                    data = selected_cols.values
                else:
                    # Fallback: take all numeric columns
                    numeric_df = df.select_dtypes(include=[np.number])
                    if numeric_df.shape[1] < 6:
                        print(f"Warning: Unexpected format in {csv_file}, shape {df.shape}")
                        return None
                    data = numeric_df.values[:, :6]

            # Convert to float array and handle any remaining non-numeric values
            try:
                data = data.astype(np.float64)
            except (ValueError, TypeError):
                # If conversion fails, try converting each column individually
                df_temp = pd.DataFrame(data)
                for col in df_temp.columns:
                    df_temp[col] = pd.to_numeric(df_temp[col], errors='coerce')
                data = df_temp.values.astype(np.float64)

            # Handle NaNs - check if data is numeric first
            if data.size > 0 and np.issubdtype(data.dtype, np.number):
                nan_mask = np.isnan(data)
                if nan_mask.any():
                    df_temp = pd.DataFrame(data)
                    df_temp = df_temp.ffill().bfill().fillna(0)
                    data = df_temp.values.astype(np.float64)
            else:
                # If data is not numeric, skip this file
                return None

            # Validate data shape and content
            if data.size == 0 or data.shape[1] != 6:
                return None
            
            # Check if all values are finite (not inf or nan)
            if not np.isfinite(data).all():
                # Replace inf and remaining nan with 0
                data = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)

            # Apply Low-pass filter
            data = DataFilter.apply_lowpass_filter(data)
            
            return data

        except Exception as e:
            print(f"Error processing {csv_file}: {e}")
            return None

# ==================== Dataset Class ====================
class SwimmingStrokeDataset(Dataset):
    """Load data using sliding window approach"""
    
    def __init__(self, data_dirs, sequence_length=100, window_overlap=0.5, train=True, test_split=0.2, scaler=None):
        self.sequence_length = sequence_length
        self.window_step = int(sequence_length * (1 - window_overlap))
        self.samples = []
        self.labels = []
        self.label_to_idx = {}
        self.idx_to_label = {}
        self.scaler = scaler
        self.train = train
        
        # Collect all data
        all_sequences = []
        all_seq_labels = []
        
        # Process each data directory
        current_label_idx = 0
        
        for data_dir in data_dirs:
            data_path = Path(data_dir)
            if not data_path.exists():
                print(f"Warning: Directory {data_dir} does not exist.")
                continue
                
            class_folders = sorted([f for f in data_path.iterdir() if f.is_dir()])
            
            for folder in class_folders:
                class_name = folder.name
                
                # Assign label index if new class
                if class_name not in self.label_to_idx:
                    self.label_to_idx[class_name] = current_label_idx
                    self.idx_to_label[current_label_idx] = class_name
                    current_label_idx += 1
                
                label_idx = self.label_to_idx[class_name]
                csv_files = list(folder.glob('*.csv'))
                
                print(f"Processing {class_name} ({len(csv_files)} files)...")
                
                for csv_file in csv_files:
                    data = DataFilter.load_and_process_csv(csv_file)
                    if data is None or len(data) < sequence_length:
                        continue
                    
                    # Sliding window
                    num_windows = (len(data) - sequence_length) // self.window_step + 1
                    for i in range(num_windows):
                        start = i * self.window_step
                        end = start + sequence_length
                        window = data[start:end]
                        all_sequences.append(window)
                        all_seq_labels.append(label_idx)

        if not all_sequences:
            raise ValueError("No valid data found in provided directories.")

        # Convert to numpy arrays
        X = np.array(all_sequences)
        y = np.array(all_seq_labels)
        
        # Train/Test Split
        # Stratified split to maintain class balance
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_split, random_state=42, stratify=y
        )
        
        if train:
            self.data = X_train
            self.targets = y_train
            
            # Fit scaler on training data
            if self.scaler is None:
                self.scaler = StandardScaler()
                # Reshape to (N*T, F) for scaling
                N, T, F = self.data.shape
                self.scaler.fit(self.data.reshape(-1, F))
                print("Scaler fitted on training data.")
        else:
            self.data = X_test
            self.targets = y_test
            if self.scaler is None:
                raise ValueError("Scaler must be provided for test set.")
        
        # Transform data
        N, T, F = self.data.shape
        self.data = self.scaler.transform(self.data.reshape(-1, F)).reshape(N, T, F)
        
        # Convert to tensors
        self.samples = torch.FloatTensor(self.data)
        self.labels = torch.LongTensor(self.targets)
        
        print(f"{'Training' if train else 'Test'} set: {len(self.samples)} samples")

    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        return self.samples[idx], self.labels[idx]

# ==================== GRU-LSTM Model ====================
class GRULSTMStrokeClassifier(nn.Module):
    """
    Combined GRU-LSTM architecture with Batch Normalization
    """
    def __init__(self, input_size, hidden_size, num_classes, num_layers=2, dropout=0.3):
        super(GRULSTMStrokeClassifier, self).__init__()
        
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        # Input Batch Normalization
        self.bn_input = nn.BatchNorm1d(input_size)
        
        # GRU layer
        self.gru = nn.GRU(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
            bidirectional=False
        )
        
        # LSTM layer
        self.lstm = nn.LSTM(
            input_size=hidden_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
            bidirectional=False
        )
        
        # Attention Mechanism
        self.attention = nn.MultiheadAttention(
            embed_dim=hidden_size,
            num_heads=4,
            batch_first=True,
            dropout=dropout
        )
        
        # Fully Connected Layers
        self.dropout = nn.Dropout(dropout)
        self.fc1 = nn.Linear(hidden_size, hidden_size // 2)
        self.bn1 = nn.BatchNorm1d(hidden_size // 2)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hidden_size // 2, num_classes)
    
    def forward(self, x):
        # x shape: (batch, seq_len, features)
        
        # Apply BN to input (permute needed for BN1d: batch, features, seq_len)
        x = x.permute(0, 2, 1)
        x = self.bn_input(x)
        x = x.permute(0, 2, 1)
        
        # GRU
        gru_out, _ = self.gru(x)
        
        # LSTM
        lstm_out, _ = self.lstm(gru_out)
        
        # Attention
        # query, key, value all from lstm_out
        attn_out, _ = self.attention(lstm_out, lstm_out, lstm_out)
        
        # Global Average Pooling or Last Step? 
        # Using Last Step often works well for classification, 
        # but Average Pooling can be more robust. Let's use Last Step as before.
        last_out = attn_out[:, -1, :]
        
        # Classifier
        out = self.dropout(last_out)
        out = self.fc1(out)
        out = self.bn1(out)
        out = self.relu(out)
        out = self.dropout(out)
        out = self.fc2(out)
        
        return out

# ==================== Training Function ====================
def train_model(model, train_loader, test_loader, num_epochs=50, learning_rate=0.001, device='cpu'):
    """Train the GRU-LSTM model"""
    # Move model to device
    model = model.to(device)
    
    # Verify GPU usage
    if device.type == 'cuda':
        print(f"[VERIFIED] Model moved to GPU: {torch.cuda.get_device_name(0)}")
        print(f"[VERIFIED] Model parameters on: {next(model.parameters()).device}")
    else:
        print(f"[INFO] Training on CPU")
    
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=learning_rate, weight_decay=1e-5)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode='max', factor=0.5, patience=5
    )
    
    train_losses = []
    test_accuracies = []
    train_accuracies = []
    best_test_acc = 0.0
    best_model_state = None
    
    print(f"Training on device: {device}")
    print(f"Model: {model.__class__.__name__}\n")
    
    for epoch in range(num_epochs):
        # ============ Training Phase ============
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        
        # Add progress bar or print every N batches
        for i, (X, y) in enumerate(train_loader):
            X = X.to(device)
            # Handle y dimensions properly - ensure it's 1D
            y = y.to(device)
            # Only squeeze if y has more than 1 dimension
            if y.dim() > 1:
                y = y.squeeze()
            # Ensure y is at least 1D (not scalar) - reshape if needed
            if y.dim() == 0:
                y = y.view(1)
            
            optimizer.zero_grad()
            outputs = model(X)
            loss = criterion(outputs, y)
            loss.backward()
            
            # Gradient clipping to prevent exploding gradients
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            
            optimizer.step()
            
            train_loss += loss.item()
            _, predicted = torch.max(outputs.data, 1)
            # Get batch size safely
            batch_size = y.shape[0] if y.dim() > 0 else 1
            train_total += batch_size
            train_correct += (predicted == y).sum().item()
            
            if (i + 1) % 10 == 0:
                print(f"\rEpoch [{epoch+1}/{num_epochs}] Batch [{i+1}/{len(train_loader)}]", end="")
        
        print() # New line after epoch
        
        train_loss /= len(train_loader)
        train_acc = 100 * train_correct / train_total
        train_losses.append(train_loss)
        train_accuracies.append(train_acc)
        
        # ============ Validation Phase ============
        model.eval()
        test_correct = 0
        test_total = 0
        
        with torch.no_grad():
            for X, y in test_loader:
                X = X.to(device)
                # Handle y dimensions properly - ensure it's 1D
                y = y.to(device)
                # Only squeeze if y has more than 1 dimension
                if y.dim() > 1:
                    y = y.squeeze()
                # Ensure y is at least 1D (not scalar) - reshape if needed
                if y.dim() == 0:
                    y = y.view(1)
                
                outputs = model(X)
                _, predicted = torch.max(outputs.data, 1)
                # Get batch size safely
                batch_size = y.shape[0] if y.dim() > 0 else 1
                test_total += batch_size
                test_correct += (predicted == y).sum().item()
        
        test_acc = 100 * test_correct / test_total
        test_accuracies.append(test_acc)
        
        # Update learning rate
        scheduler.step(test_acc)
        
        # Save best model (will be saved with timestamp in main)
        if test_acc > best_test_acc:
            best_test_acc = test_acc
            best_model_state = model.state_dict().copy()
        
        # Print progress
        if (epoch + 1) % 5 == 0:
            print(f'Epoch [{epoch+1}/{num_epochs}], Loss: {train_loss:.4f}, '
                  f'Train Acc: {train_acc:.2f}%, Val Acc: {test_acc:.2f}%')
    
    print(f"\n{'='*60}")
    print(f"Training Complete!")
    print(f"Best Validation Accuracy: {best_test_acc:.2f}%")
    print(f"Final Validation Accuracy: {test_accuracies[-1]:.2f}%")
    print(f"{'='*60}\n")
    
    # If no best model was saved (shouldn't happen), use final model
    if best_model_state is None:
        best_model_state = model.state_dict().copy()
    
    return train_losses, train_accuracies, test_accuracies, best_model_state

# ==================== Comprehensive Evaluation Function ====================
def evaluate_model_comprehensive(model, test_loader, label_mapping, device='cpu'):
    """
    Comprehensive evaluation with all metrics: accuracy, precision, recall, F1, support, confusion matrix
    """
    model.eval()
    all_preds = []
    all_labels = []
    
    with torch.no_grad():
        for X, y in test_loader:
            X = X.to(device)
            # Handle y dimensions properly - ensure it's 1D
            y = y.to(device)
            # Only squeeze if y has more than 1 dimension
            if y.dim() > 1:
                y = y.squeeze()
            # Ensure y is at least 1D (not scalar) - reshape if needed
            if y.dim() == 0:
                y = y.view(1)
            
            outputs = model(X)
            _, predicted = torch.max(outputs.data, 1)
            
            # Convert to numpy and ensure they're arrays (not scalars)
            pred_np = predicted.cpu().numpy()
            label_np = y.cpu().numpy()
            
            # Handle scalar case
            if pred_np.ndim == 0:
                pred_np = np.array([pred_np.item()])
            if label_np.ndim == 0:
                label_np = np.array([label_np.item()])
            
            all_preds.extend(pred_np)
            all_labels.extend(label_np)
    
    # Convert to numpy arrays
    all_preds = np.array(all_preds)
    all_labels = np.array(all_labels)
    
    # Overall accuracy
    overall_accuracy = accuracy_score(all_labels, all_preds)
    
    # Per-class metrics
    precision, recall, f1, support = precision_recall_fscore_support(
        all_labels, all_preds, average=None, zero_division=0
    )
    
    # Confusion matrix
    cm = confusion_matrix(all_labels, all_preds)
    
    # Get class names
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
    """Print comprehensive evaluation report"""
    print("\n" + "="*80)
    print("COMPREHENSIVE EVALUATION REPORT")
    print("="*80)
    
    # Overall accuracy
    print(f"\n{'OVERALL ACCURACY':<30}: {eval_results['overall_accuracy']*100:.2f}%")
    
    # Per-class metrics
    print(f"\n{'PER-CLASS METRICS':<30}")
    print("-"*80)
    print(f"{'Class':<20} {'Accuracy':<12} {'Precision':<12} {'Recall':<12} {'F1-Score':<12} {'Support':<12}")
    print("-"*80)
    
    class_names = eval_results['class_names']
    precision = eval_results['precision']
    recall = eval_results['recall']
    f1 = eval_results['f1']
    support = eval_results['support']
    cm = eval_results['confusion_matrix']
    
    # Calculate per-class accuracy from confusion matrix
    per_class_accuracy = cm.diagonal() / cm.sum(axis=1)
    
    for i, class_name in enumerate(class_names):
        print(f"{class_name:<20} {per_class_accuracy[i]*100:>10.2f}%  {precision[i]*100:>10.2f}%  {recall[i]*100:>10.2f}%  {f1[i]*100:>10.2f}%  {int(support[i]):>10}")
    
    # Macro and weighted averages
    macro_precision = np.mean(precision)
    macro_recall = np.mean(recall)
    macro_f1 = np.mean(f1)
    
    weighted_precision, weighted_recall, weighted_f1, _ = precision_recall_fscore_support(
        eval_results['labels'], eval_results['predictions'], average='weighted', zero_division=0
    )
    
    print("-"*80)
    print(f"{'MACRO AVERAGE':<20} {'N/A':<12} {macro_precision*100:>10.2f}%  {macro_recall*100:>10.2f}%  {macro_f1*100:>10.2f}%  {int(np.sum(support)):>10}")
    print(f"{'WEIGHTED AVERAGE':<20} {'N/A':<12} {weighted_precision*100:>10.2f}%  {weighted_recall*100:>10.2f}%  {weighted_f1*100:>10.2f}%  {int(np.sum(support)):>10}")
    
    print("\n" + "="*80)

def plot_confusion_matrix_comprehensive(cm, class_names, save_path='confusion_matrix.png'):
    """Plot and save confusion matrix"""
    plt.figure(figsize=(12, 10))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                xticklabels=class_names, yticklabels=class_names,
                cbar_kws={'label': 'Count'})
    plt.title('Confusion Matrix', fontsize=16, fontweight='bold')
    plt.ylabel('True Label', fontsize=12)
    plt.xlabel('Predicted Label', fontsize=12)
    plt.xticks(rotation=45, ha='right')
    plt.yticks(rotation=0)
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    print(f"[OK] Confusion matrix saved as '{save_path}'")

def save_evaluation_metrics(eval_results, label_mapping, save_path='evaluation_metrics.json'):
    """Save evaluation metrics to JSON file"""
    metrics_dict = {
        'overall_accuracy': float(eval_results['overall_accuracy']),
        'per_class_metrics': {}
    }
    
    class_names = eval_results['class_names']
    precision = eval_results['precision']
    recall = eval_results['recall']
    f1 = eval_results['f1']
    support = eval_results['support']
    cm = eval_results['confusion_matrix']
    per_class_accuracy = cm.diagonal() / cm.sum(axis=1)
    
    for i, class_name in enumerate(class_names):
        metrics_dict['per_class_metrics'][class_name] = {
            'accuracy': float(per_class_accuracy[i]),
            'precision': float(precision[i]),
            'recall': float(recall[i]),
            'f1_score': float(f1[i]),
            'support': int(support[i])
        }
    
    # Add macro and weighted averages
    macro_precision = np.mean(precision)
    macro_recall = np.mean(recall)
    macro_f1 = np.mean(f1)
    
    weighted_precision, weighted_recall, weighted_f1, _ = precision_recall_fscore_support(
        eval_results['labels'], eval_results['predictions'], average='weighted', zero_division=0
    )
    
    metrics_dict['macro_averages'] = {
        'precision': float(macro_precision),
        'recall': float(macro_recall),
        'f1_score': float(macro_f1)
    }
    
    metrics_dict['weighted_averages'] = {
        'precision': float(weighted_precision),
        'recall': float(weighted_recall),
        'f1_score': float(weighted_f1)
    }
    
    # Add confusion matrix as list
    metrics_dict['confusion_matrix'] = cm.tolist()
    metrics_dict['class_names'] = class_names
    
    with open(save_path, 'w') as f:
        json.dump(metrics_dict, f, indent=4)
    
    print(f"[OK] Evaluation metrics saved as '{save_path}'")


# ==================== Evaluation Only Mode ====================
def evaluate_existing_model(data_dirs, model_path='best_model.pth', device='cpu'):
    """
    Evaluate an existing trained model without retraining.
    Usage: python GRU-LSTM.py --eval-only, or call this function directly.
    """
    print("\n" + "="*80)
    print("SWIMMING STROKE CLASSIFIER - EVALUATION ONLY MODE")
    print("="*80 + "\n")
    
    # Load saved artifacts
    print("Loading saved artifacts...")
    try:
        with open('hyperparameters.pkl', 'rb') as f:
            params = pickle.load(f)
        with open('scaler.pkl', 'rb') as f:
            scaler = pickle.load(f)
        with open('label_mapping.pkl', 'rb') as f:
            label_mapping = pickle.load(f)
        print("[OK] Artifacts loaded successfully")
    except FileNotFoundError as e:
        print(f"[ERROR] Could not find required files: {e}")
        print("Make sure you have trained the model first!")
        return
    
    # Load test data
    print("\n" + "="*60)
    print("LOADING TEST DATA")
    print("="*60)
    test_dataset = SwimmingStrokeDataset(
        data_dirs,
        sequence_length=params['sequence_length'],
        train=False,
        test_split=0.3,
        scaler=scaler
    )
    
    # Create data loader
    test_loader = DataLoader(test_dataset, batch_size=32, shuffle=False, num_workers=0)
    
    # Initialize model
    print("\n" + "="*60)
    print("LOADING MODEL")
    print("="*60)
    model = GRULSTMStrokeClassifier(
        input_size=params['input_size'],
        hidden_size=params['hidden_size'],
        num_classes=params['num_classes'],
        num_layers=params['num_layers'],
        dropout=params['dropout']
    )
    
    # Load model weights
    try:
        model.load_state_dict(torch.load(model_path, map_location=device))
        print(f"[OK] Model loaded from '{model_path}'")
    except FileNotFoundError:
        # Try alternative path
        alt_path = 'gru_lstm_stroke_classifier.pth'
        try:
            model.load_state_dict(torch.load(alt_path, map_location=device))
            print(f"[OK] Model loaded from '{alt_path}'")
        except FileNotFoundError:
            print(f"[ERROR] Could not find model file: {model_path} or {alt_path}")
            return
    
    model = model.to(device)
    
    # Run evaluation
    print("\n" + "="*80)
    print("RUNNING COMPREHENSIVE EVALUATION")
    print("="*80)
    
    eval_results = evaluate_model_comprehensive(
        model, test_loader, label_mapping, device=device
    )
    
    # Print evaluation report
    print_evaluation_report(eval_results, label_mapping)
    
    # Plot and save confusion matrix
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    cm_path = f'confusion_matrix_eval_{timestamp}.png'
    plot_confusion_matrix_comprehensive(
        eval_results['confusion_matrix'], 
        eval_results['class_names'],
        save_path=cm_path
    )
    
    # Save evaluation metrics
    metrics_path = f'evaluation_metrics_eval_{timestamp}.json'
    save_evaluation_metrics(eval_results, label_mapping, save_path=metrics_path)
    
    print("\n" + "="*80)
    print("Evaluation completed successfully!")
    print(f"Results saved: {cm_path}, {metrics_path}")
    print("="*80)


def select_data_root_folder(
    title: str = "Select data folder (subfolders = class labels, each with CSV files)",
) -> str | None:
    """Open a native folder dialog; return absolute path or None if cancelled."""
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError:
        print("tkinter is not available; install a Python build with Tk or pass --data-root.")
        return None
    root = tk.Tk()
    root.withdraw()
    try:
        root.attributes("-topmost", True)
    except tk.TclError:
        pass
    path = filedialog.askdirectory(title=title)
    root.destroy()
    return path if path else None


# ==================== Main ====================
if __name__ == '__main__':
    import sys

    _script_dir = Path(__file__).resolve().parent
    _default_data_root = _script_dir.parent / 'NewSensorRealData'

    parser = argparse.ArgumentParser(
        description='Train or evaluate the swimming stroke GRU-LSTM classifier.'
    )
    parser.add_argument(
        '--data-root',
        action='append',
        dest='data_roots',
        metavar='PATH',
        help=(
            'Root directory: each immediate subfolder name is a class label, '
            'and CSV files inside that folder are training samples. '
            'Use this flag multiple times to combine several roots. '
            'If omitted, a folder dialog opens to choose the data root.'
        ),
    )
    parser.add_argument(
        '--eval-only',
        action='store_true',
        help='Load saved weights and run evaluation only (no training).',
    )
    parser.add_argument(
        '--model-path',
        type=str,
        default='best_model.pth',
        help='Checkpoint path when using --eval-only (default: best_model.pth).',
    )
    parser.add_argument(
        '--cpu',
        action='store_true',
        help='Allow training on CPU (slow). By default training requires a CUDA GPU.',
    )
    args = parser.parse_args()

    if args.data_roots:
        data_dirs = [str(Path(p).expanduser().resolve()) for p in args.data_roots]
    else:
        print("\nSelect the folder that contains your class subfolders (e.g. Butterfly, Freestyle, Breast).")
        print("A folder dialog will open...\n")
        picked = select_data_root_folder()
        if picked:
            data_dirs = [str(Path(picked).resolve())]
        else:
            if _default_data_root.exists():
                print(
                    f"No folder selected. Using default data root: {_default_data_root}\n"
                    "(Pass --data-root PATH to skip the dialog.)"
                )
                data_dirs = [str(_default_data_root.resolve())]
            else:
                print(
                    "No folder selected and default data root does not exist:\n"
                    f"  {_default_data_root}\n"
                    "Run again and choose a folder, or use: python GRU-LSTM.py --data-root <path>"
                )
                sys.exit(1)

    print(f"Data root(s): {data_dirs}")

    if args.eval_only:
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"Using device: {device}\n")
        evaluate_existing_model(data_dirs, args.model_path, device)
        raise SystemExit(0)

    print("\n" + "="*60)
    print("SWIMMING STROKE CLASSIFIER - TRAINING MODE")
    print("="*60 + "\n")
    
    # Hyperparameters
    hidden_size = 64
    batch_size = 16
    num_epochs = 50
    learning_rate = 0.001
    sequence_length = 100
    num_layers = 2
    dropout = 0.3
    
    # Device: default training path requires CUDA (no silent CPU training).
    if args.cpu:
        device = torch.device('cpu')
        print("[INFO] Training on CPU (--cpu). This will be slow.\n")
    elif not torch.cuda.is_available():
        print("ERROR: Training requires a CUDA GPU (PyTorch built with CUDA and drivers working).")
        print("  If you have an NVIDIA GPU, check: nvidia-smi")
        print("  Install a CUDA-enabled PyTorch build from https://pytorch.org/get-started/locally/")
        print("  To override and train on CPU anyway: python GRU-LSTM.py --cpu ...")
        sys.exit(1)
    else:
        device = torch.device('cuda')
        print(f"[OK] GPU Detected: {torch.cuda.get_device_name(0)}")
        print(f"[OK] CUDA Version: {torch.version.cuda}")
        print(f"[OK] GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
        print(f"[OK] PyTorch CUDA Version: {torch.version.cuda}")

    print(f"Using device: {device}\n")
    
    # Load training data
    print("="*60)
    print("LOADING TRAINING DATA")
    print("="*60)
    train_dataset = SwimmingStrokeDataset(
        data_dirs, 
        sequence_length=sequence_length, 
        train=True,
        test_split=0.3  # 70% training, 30% testing
    )
    
    # Load validation data (uses same scaler and columns as training)
    print("="*60)
    print("LOADING VALIDATION DATA")
    print("="*60)
    test_dataset = SwimmingStrokeDataset(
        data_dirs, 
        sequence_length=sequence_length, 
        train=False,
        test_split=0.3,  # 70% training, 30% testing
        scaler=train_dataset.scaler
    )
    
    # Get dataset info
    sample_data, _ = train_dataset[0]
    input_size = sample_data.shape[1]
    num_classes = len(train_dataset.idx_to_label)
    
    print(f"\n{'='*60}")
    print("DATASET INFORMATION")
    print("="*60)
    print(f"Input size (number of features): {input_size}")
    print(f"Sequence length: {sequence_length}")
    print(f"Number of classes: {num_classes}")
    print(f"Classes: {train_dataset.idx_to_label}")
    print(f"Training samples: {len(train_dataset)}")
    print(f"Validation samples: {len(test_dataset)}")
    print()
    
    # Create data loaders
    # num_workers=0 is crucial for Windows to avoid multiprocessing issues
    _pin = device.type == 'cuda'
    train_loader = DataLoader(
        train_dataset, batch_size=batch_size, shuffle=True, num_workers=0, pin_memory=_pin
    )
    test_loader = DataLoader(
        test_dataset, batch_size=batch_size, shuffle=False, num_workers=0, pin_memory=_pin
    )
    
    # Initialize model
    model = GRULSTMStrokeClassifier(
        input_size=input_size,
        hidden_size=hidden_size,
        num_classes=num_classes,
        num_layers=num_layers,
        dropout=dropout
    )
    
    # Verify GPU before training (no fallback to CPU when CUDA was required)
    if device.type == 'cuda':
        try:
            test_tensor = torch.randn(1, 1).to(device)
            print(f"[VERIFIED] GPU test successful - tensor created on {test_tensor.device}")
            del test_tensor
            torch.cuda.empty_cache()
        except Exception as e:
            print(f"ERROR: GPU test failed: {e}")
            print("Fix the CUDA/driver issue above, or run with --cpu if you must train on CPU.")
            sys.exit(1)
    
    print("="*60)
    print("MODEL ARCHITECTURE")
    print("="*60)
    print(model)
    print(f"\nTotal parameters: {sum(p.numel() for p in model.parameters()):,}")
    print()

    # Create timestamp for saving models (to preserve old models)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    model_save_dir = Path('saved_models')
    model_save_dir.mkdir(exist_ok=True)
    
    # Save artifacts before training
    print("="*60)
    print("SAVING ARTIFACTS")
    print("="*60)
    
    # Save with timestamp to preserve old models
    scaler_path = model_save_dir / f'scaler_{timestamp}.pkl'
    label_mapping_path = model_save_dir / f'label_mapping_{timestamp}.pkl'
    hyperparams_path = model_save_dir / f'hyperparameters_{timestamp}.pkl'
    
    with open(scaler_path, 'wb') as f:
        pickle.dump(train_dataset.scaler, f)
    
    with open(label_mapping_path, 'wb') as f:
        pickle.dump(train_dataset.idx_to_label, f)
    
    # Save hyperparameters
    hyperparams = {
        'input_size': input_size,
        'hidden_size': hidden_size,
        'num_classes': num_classes,
        'num_layers': num_layers,
        'dropout': dropout,
        'sequence_length': sequence_length,
        'data_dirs': data_dirs,
        'timestamp': timestamp
    }
    with open(hyperparams_path, 'wb') as f:
        pickle.dump(hyperparams, f)
    
    # Also save latest versions (for compatibility)
    with open('scaler.pkl', 'wb') as f:
        pickle.dump(train_dataset.scaler, f)
    with open('label_mapping.pkl', 'wb') as f:
        pickle.dump(train_dataset.idx_to_label, f)
    with open('hyperparameters.pkl', 'wb') as f:
        pickle.dump(hyperparams, f)
        
    print(f"[OK] Scaler saved as '{scaler_path}' and 'scaler.pkl'")
    print(f"[OK] Label mapping saved as '{label_mapping_path}' and 'label_mapping.pkl'")
    print(f"[OK] Hyperparameters saved as '{hyperparams_path}' and 'hyperparameters.pkl'")
    print()
    
    # Train model
    print("="*60)
    print("STARTING TRAINING")
    print("="*60 + "\n")
    try:
        train_losses, train_accs, test_accuracies, best_model_state = train_model(
            model, train_loader, test_loader, 
            num_epochs=num_epochs, 
            learning_rate=learning_rate,
            device=device
        )
        
        # Load best model state if available
        if best_model_state is not None:
            model.load_state_dict(best_model_state)
            print("[INFO] Loaded best model state for evaluation")
        
        # Plot training results
        plt.figure(figsize=(15, 5))
        
        plt.subplot(1, 3, 1)
        plt.plot(train_losses, label='Training Loss')
        plt.xlabel('Epoch')
        plt.ylabel('Loss')
        plt.title('Training Loss Over Time')
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
        training_plot_path = model_save_dir / f'training_results_{timestamp}.png'
        plt.savefig(training_plot_path, dpi=150)
        plt.savefig('training_results.png', dpi=150)  # Also save latest
        print(f"[OK] Training plot saved as '{training_plot_path}' and 'training_results.png'")
        
        # Save model and related files with timestamp
        model_path = model_save_dir / f'gru_lstm_stroke_classifier_{timestamp}.pth'
        best_model_path = model_save_dir / f'best_model_{timestamp}.pth'
        
        torch.save(model.state_dict(), model_path)
        if best_model_state is not None:
            torch.save(best_model_state, best_model_path)
        
        # Also save latest versions (for compatibility)
        torch.save(model.state_dict(), 'gru_lstm_stroke_classifier.pth')
        if best_model_state is not None:
            torch.save(best_model_state, 'best_model.pth')
        
        print(f"\n[OK] Model saved as '{model_path}' and 'gru_lstm_stroke_classifier.pth'")
        if best_model_state is not None:
            print(f"[OK] Best model saved as '{best_model_path}' and 'best_model.pth'")
        
        # ============ Comprehensive Evaluation ============
        print("\n" + "="*80)
        print("RUNNING COMPREHENSIVE EVALUATION")
        print("="*80)
        
        eval_results = evaluate_model_comprehensive(
            model, test_loader, train_dataset.idx_to_label, device=device
        )
        
        # Print evaluation report
        print_evaluation_report(eval_results, train_dataset.idx_to_label)
        
        # Plot and save confusion matrix
        cm_path = model_save_dir / f'confusion_matrix_{timestamp}.png'
        plot_confusion_matrix_comprehensive(
            eval_results['confusion_matrix'], 
            eval_results['class_names'],
            save_path=str(cm_path)
        )
        plot_confusion_matrix_comprehensive(
            eval_results['confusion_matrix'], 
            eval_results['class_names'],
            save_path='confusion_matrix.png'  # Also save latest
        )
        
        # Save evaluation metrics to JSON
        metrics_path = model_save_dir / f'evaluation_metrics_{timestamp}.json'
        save_evaluation_metrics(eval_results, train_dataset.idx_to_label, save_path=str(metrics_path))
        save_evaluation_metrics(eval_results, train_dataset.idx_to_label, save_path='evaluation_metrics.json')  # Also save latest
        
        print("\n" + "="*80)
        print("Training and Evaluation completed successfully!")
        print(f"All files saved in 'saved_models' directory with timestamp: {timestamp}")
        print("Latest versions also saved in root directory for compatibility")
        print("="*80)
        
    except KeyboardInterrupt:
        print("\nTraining interrupted by user.")
    except Exception as e:
        print(f"\nAn error occurred during training: {e}")
        import traceback
        traceback.print_exc()