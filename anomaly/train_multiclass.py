#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════╗
║         INSA SDN — Multi-Class Random Forest Training Script           ║
║                                                                        ║
║  Trains a multi-class RF classifier on the InSDN dataset               ║
║  (CICFlowMeter features) and maps them to 8 ODL-compatible features.   ║
║                                                                        ║
║  Supports:                                                             ║
║    - InSDN dataset (Normal_data.csv, OVS.csv, metasploitable-2.csv)    ║
║    - Any CICFlowMeter-based CSV with a "Label" column                  ║
║    - Single CSV or directory of CSVs                                   ║
║                                                                        ║
║  Usage:                                                                ║
║    uv run python train_multiclass.py --data ../datasets/               ║
║    uv run python train_multiclass.py --data ../datasets/ --consolidate ║
║    uv run python train_multiclass.py --data single_file.csv            ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

import argparse
import os
import sys
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.preprocessing import RobustScaler, LabelEncoder
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix, f1_score

# ── Constants ───────────────────────────────────────────────────────────────

EPS = 1e-9

# 8 ODL-aligned features — these are what the live detector extracts from ODL
FEATURES = [
    "avg_pkt_size",         # Average packet size (bytes/packet)
    "bytes_per_sec",        # Byte rate
    "packets_per_sec",      # Packet rate
    "active_flow_count",    # Number of active subflows
    "flow_duration",        # Flow duration in seconds
    "avg_bytes_per_flow",   # Average bytes per subflow
    "tx_rx_byte_ratio",     # Forward/backward byte ratio
    "packet_size_variance", # Packet size variance
]

# High-magnitude right-skewed features — log1p before scaling
LOG_FEATURES = [
    "avg_pkt_size",
    "bytes_per_sec",
    "packets_per_sec",
    "avg_bytes_per_flow",
]

# Consolidation map: merge granular labels into broader categories
# Maps InSDN labels → consolidated attack types
CONSOLIDATION_MAP = {
    "Normal":      "Normal",
    "DoS":         "DoS",
    "DDoS":        "DDoS",
    "Probe":       "Probe",
    "BFA":         "Brute_Force",
    "Web-Attack":  "Web_Attack",
    "BOTNET":      "Botnet",
    "U2R":         "Exploitation",
}

# ── CICFlowMeter → ODL Feature Mapping ─────────────────────────────────────

def map_cicflowmeter_to_odl(df: pd.DataFrame) -> pd.DataFrame:
    """
    Map CICFlowMeter columns (84 features) to 8 ODL-compatible features.

    CICFlowMeter Source → ODL Feature:
      Pkt Size Avg (or derived)      → avg_pkt_size
      Flow Byts/s                    → bytes_per_sec
      Flow Pkts/s                    → packets_per_sec
      Subflow Fwd Pkts + Bwd Pkts    → active_flow_count
      Flow Duration (μs → seconds)   → flow_duration
      Fwd Pkt Len Mean               → avg_bytes_per_flow
      TotLen Fwd / TotLen Bwd        → tx_rx_byte_ratio
      Pkt Len Var                    → packet_size_variance
    """
    X = pd.DataFrame(index=df.index)

    # 1. avg_pkt_size — average packet size
    if "Pkt Size Avg" in df.columns:
        X["avg_pkt_size"] = pd.to_numeric(df["Pkt Size Avg"], errors="coerce").fillna(0)
    else:
        tot_fwd = pd.to_numeric(df.get("TotLen Fwd Pkts", 0), errors="coerce").fillna(0)
        tot_bwd = pd.to_numeric(df.get("TotLen Bwd Pkts", 0), errors="coerce").fillna(0)
        pkts_fwd = pd.to_numeric(df.get("Tot Fwd Pkts", 0), errors="coerce").fillna(0)
        pkts_bwd = pd.to_numeric(df.get("Tot Bwd Pkts", 0), errors="coerce").fillna(0)
        X["avg_pkt_size"] = (tot_fwd + tot_bwd) / (pkts_fwd + pkts_bwd + EPS)

    # 2. bytes_per_sec — flow byte rate
    X["bytes_per_sec"] = pd.to_numeric(df.get("Flow Byts/s", 0), errors="coerce").fillna(0)

    # 3. packets_per_sec — flow packet rate
    X["packets_per_sec"] = pd.to_numeric(df.get("Flow Pkts/s", 0), errors="coerce").fillna(0)

    # 4. active_flow_count — number of subflows (proxy for ODL flow table size)
    sub_fwd = pd.to_numeric(df.get("Subflow Fwd Pkts", 0), errors="coerce").fillna(0)
    sub_bwd = pd.to_numeric(df.get("Subflow Bwd Pkts", 0), errors="coerce").fillna(0)
    X["active_flow_count"] = sub_fwd + sub_bwd
    # Ensure minimum of 1 (at least 1 flow exists)
    X["active_flow_count"] = X["active_flow_count"].clip(lower=1)

    # 5. flow_duration — in seconds (CICFlowMeter uses microseconds)
    dur = pd.to_numeric(df.get("Flow Duration", 0), errors="coerce").fillna(0)
    X["flow_duration"] = dur / 1_000_000.0  # μs → seconds

    # 6. avg_bytes_per_flow — average bytes per flow direction
    fwd_mean = pd.to_numeric(df.get("Fwd Pkt Len Mean", 0), errors="coerce").fillna(0)
    X["avg_bytes_per_flow"] = fwd_mean

    # 7. tx_rx_byte_ratio — forward/backward byte ratio
    tot_fwd_bytes = pd.to_numeric(df.get("TotLen Fwd Pkts", 0), errors="coerce").fillna(0)
    tot_bwd_bytes = pd.to_numeric(df.get("TotLen Bwd Pkts", 0), errors="coerce").fillna(0)
    X["tx_rx_byte_ratio"] = tot_fwd_bytes / (tot_bwd_bytes + EPS)

    # 8. packet_size_variance
    if "Pkt Len Var" in df.columns:
        X["packet_size_variance"] = pd.to_numeric(df["Pkt Len Var"], errors="coerce").fillna(0)
    elif "Pkt Len Std" in df.columns:
        std = pd.to_numeric(df["Pkt Len Std"], errors="coerce").fillna(0)
        X["packet_size_variance"] = std ** 2
    else:
        X["packet_size_variance"] = 0.0

    # Clean up infinities and negatives
    X.replace([np.inf, -np.inf], 0, inplace=True)
    X = X.fillna(0).clip(lower=0)

    return X[FEATURES]


# ── Dataset Loading ─────────────────────────────────────────────────────────

def load_dataset(path: str, consolidate: bool = True) -> tuple:
    """
    Load dataset from a single CSV or a directory of CSVs.
    Returns (DataFrame with features, Series with labels, list of class names).
    """
    if os.path.isdir(path):
        csv_files = sorted([
            os.path.join(path, f) for f in os.listdir(path)
            if f.lower().endswith(".csv")
        ])
        if not csv_files:
            print(f"❌ No CSV files found in {path}")
            sys.exit(1)

        print(f"Loading {len(csv_files)} CSV files from {path}:")
        dfs = []
        for csv_file in csv_files:
            print(f"  → {os.path.basename(csv_file)}", end="")
            df = pd.read_csv(csv_file, low_memory=False)
            df.columns = df.columns.str.strip()
            print(f" ({len(df):,} rows)")
            dfs.append(df)
        df = pd.concat(dfs, ignore_index=True)
    else:
        print(f"Loading {path}")
        df = pd.read_csv(path, low_memory=False)
        df.columns = df.columns.str.strip()

    print(f"  Total rows: {len(df):,}  Columns: {len(df.columns)}")

    # Find label column (case-insensitive)
    label_col = None
    for col in df.columns:
        if col.lower() == "label":
            label_col = col
            break
    if label_col is None:
        print(f"❌ No 'Label' column found. Available: {list(df.columns)}")
        sys.exit(1)

    # Clean labels
    labels = df[label_col].astype(str).str.strip()

    # Consolidate if requested
    if consolidate:
        print("\nConsolidating labels:")
        labels = labels.map(lambda x: CONSOLIDATION_MAP.get(x, x))
        unmapped = set(labels.unique()) - set(CONSOLIDATION_MAP.values())
        if unmapped:
            print(f"  ⚠ Unmapped labels (kept as-is): {unmapped}")

    # Map features
    print("\nMapping CICFlowMeter → 8 ODL-compatible features...")
    X = map_cicflowmeter_to_odl(df)

    print(f"\n{'='*60}")
    print("DATASET SUMMARY")
    print(f"{'='*60}")
    print(f"  Feature matrix: {X.shape}")
    print(f"  Label distribution:")
    label_counts = labels.value_counts()
    for label, count in label_counts.items():
        pct = count / len(labels) * 100
        print(f"    {label:20s}  {count:>8,}  ({pct:5.1f}%)")
    print(f"  Total classes: {labels.nunique()}")

    return X, labels


# ── Training Pipeline ───────────────────────────────────────────────────────

def log_transform(X_df: pd.DataFrame) -> np.ndarray:
    """Apply log1p transform to right-skewed features."""
    if not hasattr(X_df, "columns"):
        X_df = pd.DataFrame(X_df, columns=FEATURES)
    X = X_df.copy()
    for f in LOG_FEATURES:
        if f in X.columns:
            X[f] = np.log1p(X[f].clip(lower=0))
    return X.values


def train(X: pd.DataFrame, y_labels: pd.Series, args) -> dict:
    """
    Full training pipeline:
      1. Encode labels
      2. Train/test split
      3. Log transform + RobustScaler
      4. Train Random Forest
      5. Evaluate + cross-validate
      6. Return model bundle
    """
    # Encode labels
    le = LabelEncoder()
    y = le.fit_transform(y_labels)
    class_names = list(le.classes_)
    normal_idx = list(class_names).index("Normal") if "Normal" in class_names else 0

    print(f"\n{'='*60}")
    print("LABEL ENCODING")
    print(f"{'='*60}")
    for i, name in enumerate(class_names):
        count = (y == i).sum()
        print(f"  {i} → {name:20s}  ({count:,} samples)")

    # Drop extremely rare classes (< min_samples) to avoid training issues
    min_samples = args.min_samples
    class_counts = pd.Series(y).value_counts()
    rare_classes = class_counts[class_counts < min_samples].index.tolist()
    if rare_classes:
        rare_names = [class_names[i] for i in rare_classes]
        print(f"\n  ⚠ Dropping rare classes (< {min_samples} samples): {rare_names}")
        mask = ~np.isin(y, rare_classes)
        X = X[mask].reset_index(drop=True)
        y = y[mask]
        # Re-encode after dropping
        y_labels_filtered = pd.Series(le.inverse_transform(y))
        le = LabelEncoder()
        y = le.fit_transform(y_labels_filtered)
        class_names = list(le.classes_)
        normal_idx = list(class_names).index("Normal") if "Normal" in class_names else 0
        print(f"  Remaining classes: {class_names}")

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y
    )
    print(f"\n  Train: {len(X_train):,}  Test: {len(X_test):,}")

    # Log transform
    X_train_log = log_transform(X_train)
    X_test_log = log_transform(X_test)

    # Fit scaler on Normal-only training samples
    normal_mask = (y_train == normal_idx)
    scaler = RobustScaler()
    if normal_mask.sum() > 10:
        scaler.fit(X_train_log[normal_mask])
        print(f"  Scaler fit on {normal_mask.sum():,} Normal-only samples")
    else:
        scaler.fit(X_train_log)
        print(f"  Scaler fit on all {len(X_train_log):,} samples (too few Normal)")

    X_train_s = scaler.transform(X_train_log)
    X_test_s = scaler.transform(X_test_log)

    # Train Random Forest
    print(f"\n{'='*60}")
    print(f"TRAINING RANDOM FOREST ({len(FEATURES)} features, {len(class_names)} classes)")
    print(f"{'='*60}")

    clf = RandomForestClassifier(
        n_estimators=args.n_estimators,
        min_samples_leaf=args.min_leaf,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train_s, y_train)

    # Evaluate
    y_pred = clf.predict(X_test_s)
    acc = accuracy_score(y_test, y_pred)
    f1_macro = f1_score(y_test, y_pred, average="macro")

    print(f"\n  Accuracy:  {acc:.4f}")
    print(f"  F1 Macro:  {f1_macro:.4f}")
    print(f"\n{classification_report(y_test, y_pred, target_names=class_names)}")

    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    print("Confusion Matrix:")
    # Header
    header = "             " + "  ".join(f"{n[:8]:>8}" for n in class_names)
    print(header)
    for i, row in enumerate(cm):
        row_str = f"  {class_names[i]:10s}  " + "  ".join(f"{v:>8}" for v in row)
        print(row_str)

    # Feature importances
    importances = sorted(zip(FEATURES, clf.feature_importances_), key=lambda x: -x[1])
    print(f"\nFeature importances:")
    for f, imp in importances:
        bar = "█" * int(imp * 50)
        print(f"  {f:25s} {imp:.4f}  {bar}")

    # Cross-validation
    print(f"\n{'='*60}")
    print("CROSS VALIDATION (5-fold)")
    print(f"{'='*60}")

    X_all_log = log_transform(X)
    X_all_s = scaler.transform(X_all_log)

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(clf, X_all_s, y, cv=cv, scoring="f1_macro", n_jobs=-1)

    print(f"  F1 per fold: {cv_scores.round(4)}")
    print(f"  Mean F1:     {cv_scores.mean():.4f}")
    print(f"  Std  F1:     {cv_scores.std():.4f}")
    if cv_scores.std() > 0.02:
        print("  ⚠️  MODERATE VARIANCE — model may vary across folds")
    else:
        print("  ✅  STABLE — consistent across folds")

    # Build model bundle
    model_data = {
        "model":          clf,
        "scaler":         scaler,
        "feature_order":  FEATURES,
        "log_features":   LOG_FEATURES,
        "label_encoder":  le,
        "class_names":    class_names,
        "normal_label":   "Normal",
        "label_mode":     "multiclass",
        "attack_class":   1,  # backward compat (unused in multiclass)
        "n_classes":      len(class_names),
        "training_stats": {
            "accuracy":   round(acc, 4),
            "f1_macro":   round(f1_macro, 4),
            "cv_f1_mean": round(cv_scores.mean(), 4),
            "cv_f1_std":  round(cv_scores.std(), 4),
            "train_size": len(X_train),
            "test_size":  len(X_test),
            "class_distribution": {
                name: int((y == i).sum()) for i, name in enumerate(class_names)
            },
        },
        "note": "Multi-class RF trained on InSDN dataset, 8 ODL-compatible features",
    }

    return model_data


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Train multi-class RF on InSDN/CICFlowMeter dataset"
    )
    parser.add_argument(
        "--data", required=True,
        help="Path to CSV file or directory of CSVs"
    )
    parser.add_argument(
        "--out", default=os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "pretrained_multiclass_rf.pkl"
        ),
        help="Output model path (default: pretrained_multiclass_rf.pkl)"
    )
    parser.add_argument(
        "--consolidate", action="store_true", default=True,
        help="Consolidate granular labels into broader categories (default: True)"
    )
    parser.add_argument(
        "--no-consolidate", dest="consolidate", action="store_false",
        help="Keep original granular labels"
    )
    parser.add_argument(
        "--n-estimators", type=int, default=500,
        help="Number of RF trees (default: 500)"
    )
    parser.add_argument(
        "--min-leaf", type=int, default=5,
        help="Minimum samples per leaf (default: 5)"
    )
    parser.add_argument(
        "--min-samples", type=int, default=30,
        help="Minimum samples per class — classes below this are dropped (default: 30)"
    )
    args = parser.parse_args()

    print("=" * 70)
    print("  INSA SDN — Multi-Class Random Forest Training")
    print("=" * 70)
    print(f"  Dataset:       {args.data}")
    print(f"  Output:        {args.out}")
    print(f"  Consolidate:   {args.consolidate}")
    print(f"  Estimators:    {args.n_estimators}")
    print(f"  Min leaf:      {args.min_leaf}")
    print(f"  Min samples:   {args.min_samples}")
    print(f"  Features:      {FEATURES}")
    print("=" * 70)

    # Load and map features
    X, y_labels = load_dataset(args.data, consolidate=args.consolidate)

    # Train
    model_data = train(X, y_labels, args)

    # Save
    joblib.dump(model_data, args.out)

    print(f"\n{'='*70}")
    print("✅ MODEL SAVED SUCCESSFULLY")
    print(f"{'='*70}")
    print(f"  Path:          {args.out}")
    print(f"  Label mode:    {model_data['label_mode']}")
    print(f"  Classes:       {model_data['class_names']}")
    print(f"  Features:      {model_data['feature_order']}")
    print(f"  Accuracy:      {model_data['training_stats']['accuracy']}")
    print(f"  F1 Macro:      {model_data['training_stats']['f1_macro']}")
    print(f"  CV F1 Mean:    {model_data['training_stats']['cv_f1_mean']}")
    print(f"\n  Load with:")
    print(f"    import joblib")
    print(f"    d = joblib.load('{os.path.basename(args.out)}')")
    print(f"    print(d['class_names'])  # {model_data['class_names']}")
    print(f"    print(d['label_mode'])   # multiclass")


if __name__ == "__main__":
    main()
