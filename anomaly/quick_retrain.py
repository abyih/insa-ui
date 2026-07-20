#!/usr/bin/env python3
"""
Quick retrain of RF model with 5 features (no tx_rx_byte_asymmetry)
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import RobustScaler
import joblib
import sys

print("Loading dataset...")
df = pd.read_csv("/home/alazar/Desktop/dataset_sdn.csv")

# Define 5 features (no tx_rx_byte_asymmetry)
FEATURES = ["avg_pkt_size", "total_duration_sec", "bytes_per_sec", "pktcount", "tx_bytes"]
LOG_FEATURES = ["avg_pkt_size", "bytes_per_sec", "pktcount", "tx_bytes"]
POLL_INTERVAL = 15.0
EPS = 1e-9

print("Building features...")
X = pd.DataFrame()

# Calculate features matching ODL extraction
pktcount = pd.to_numeric(df["pktcount"], errors="coerce").fillna(0).clip(lower=0)
bytecount = pd.to_numeric(df["bytecount"], errors="coerce").fillna(0).clip(lower=0)
tx_bytes = pd.to_numeric(df["tx_bytes"], errors="coerce").fillna(0).clip(lower=0)

X["avg_pkt_size"] = bytecount / (pktcount + EPS)
X["total_duration_sec"] = POLL_INTERVAL  # Fixed polling interval
X["bytes_per_sec"] = bytecount / POLL_INTERVAL
X["pktcount"] = pktcount
X["tx_bytes"] = tx_bytes

# Clean up
X.replace([np.inf, -np.inf], 0, inplace=True)
X = X.fillna(0).clip(lower=0)

y = pd.to_numeric(df["label"], errors="coerce").fillna(0).astype(int)

print(f"Dataset shape: {X.shape}")
print(f"Class distribution: {dict(y.value_counts())}")

# Apply log transform
X_log = X.copy()
for f in LOG_FEATURES:
    if f in X_log.columns:
        X_log[f] = np.log1p(X_log[f].clip(lower=0))

# Fit scaler on benign-only samples
benign_mask = (y.values == 0)
scaler = RobustScaler()
scaler.fit(X_log[benign_mask])
X_scaled = scaler.transform(X_log)

print(f"\nTraining Random Forest with {len(FEATURES)} features...")
print(f"Features: {FEATURES}")

clf = RandomForestClassifier(
    n_estimators=300,
    min_samples_leaf=5,
    class_weight="balanced",
    random_state=42,
    n_jobs=-1,
)
clf.fit(X_scaled, y)

# Save model
model_data = {
    "model": clf,
    "scaler": scaler,
    "feature_order": FEATURES,
    "log_features": LOG_FEATURES,
    "attack_class": 1,
    "poll_interval": POLL_INTERVAL,
    "note": "Retrained for ODL with 5 features (no tx_rx_byte_asymmetry)",
}

joblib.dump(model_data, "pretrained_clf_odl.pkl")
print(f"\n✅ Model saved as pretrained_clf_odl.pkl")
print(f"✅ Features: {FEATURES}")
print(f"✅ Ready for ODL integration")