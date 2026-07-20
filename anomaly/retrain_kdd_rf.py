#!/usr/bin/env python3
"""
Retrain a Random Forest on the repo's SDN dataset and save a replacement model bundle.

This script targets dataset_sdn.csv in the workspace root, which contains columns like:
    dt, switch, src, dst, pktcount, bytecount, dur, dur_nsec, tot_dur, flows,
    packetins, pktperflow, byteperflow, pktrate, Pairflow, Protocol, port_no,
    tx_bytes, rx_bytes, tx_kbps, rx_kbps, tot_kbps, label

The output is a joblib bundle that rf_detector.py can load as a replacement model.
"""

import argparse
import os
from typing import List

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


NUMERIC_COLUMNS = [
    "pktcount",
    "bytecount",
    "dur",
    "dur_nsec",
    "tot_dur",
    "flows",
    "packetins",
    "pktperflow",
    "byteperflow",
    "pktrate",
    "Pairflow",
    "port_no",
    "tx_bytes",
    "rx_bytes",
    "tx_kbps",
    "rx_kbps",
    "tot_kbps",
]

CATEGORICAL_COLUMNS = ["switch", "src", "dst", "Protocol"]


def normalize_label(value, binary: bool):
    if binary:
        try:
            numeric = float(value)
            return int(numeric > 0)
        except (TypeError, ValueError):
            text = str(value).strip().lower()
            return 0 if text in {"normal", "benign", "0"} else 1
    text = str(value).strip()
    return text.lower()


def load_dataset(path: str, binary: bool):
    df = pd.read_csv(path, low_memory=False)
    df.columns = df.columns.str.strip()

    if "label" not in df.columns:
        raise ValueError("Dataset must contain a label column")

    missing_numeric = [col for col in NUMERIC_COLUMNS if col not in df.columns]
    missing_categorical = [col for col in CATEGORICAL_COLUMNS if col not in df.columns]

    if missing_numeric:
        print("[WARN] Missing numeric columns will be filled with 0:", missing_numeric)
    if missing_categorical:
        print("[WARN] Missing categorical columns will be filled with '__missing__':", missing_categorical)

    X = pd.DataFrame(index=df.index)
    for col in NUMERIC_COLUMNS:
        if col in df.columns:
            X[col] = pd.to_numeric(df[col], errors="coerce")
        else:
            X[col] = 0.0
    for col in CATEGORICAL_COLUMNS:
        if col in df.columns:
            X[col] = df[col].fillna("__missing__").astype(str)
        else:
            X[col] = "__missing__"

    X = X.replace([np.inf, -np.inf], np.nan)
    y = df["label"].apply(lambda v: normalize_label(v, binary))

    if binary:
        y = y.astype(int)

    return X, y


def build_pipeline():
    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
        ]
    )

    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, NUMERIC_COLUMNS),
            ("cat", categorical_pipeline, CATEGORICAL_COLUMNS),
        ],
        remainder="drop",
    )

    classifier = RandomForestClassifier(
        n_estimators=500,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", classifier),
        ]
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="Path to dataset_sdn.csv")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "pretrained_kdd_rf.pkl"))
    args = parser.parse_args()

    binary = True
    print("Loading dataset:", args.data)
    X, y = load_dataset(args.data, binary=binary)

    print("Rows:", len(X))
    print("Columns:", list(X.columns))
    print("Label mode:", "binary")
    print("Label distribution:")
    print(y.value_counts().to_string())

    if y.nunique() < 2:
        raise ValueError("Dataset must contain at least two label classes")

    stratify = y if y.nunique() > 1 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.3,
        random_state=42,
        stratify=stratify,
    )

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)

    print("\nAccuracy:", round(accuracy_score(y_test, y_pred), 4))
    print("F1 macro:", round(f1_score(y_test, y_pred, average="macro"), 4))
    print(classification_report(y_test, y_pred))

    model_data = {
        "pipeline": pipeline,
        "feature_order": NUMERIC_COLUMNS + CATEGORICAL_COLUMNS,
        "numeric_features": NUMERIC_COLUMNS,
        "categorical_features": CATEGORICAL_COLUMNS,
        "label_mode": "binary",
        "normal_label": 0,
        "attack_class": 1,
        "source_dataset": os.path.abspath(args.data),
        "note": "SDN RF replacement model trained from dataset_sdn.csv",
    }

    joblib.dump(model_data, args.out)
    print("\nSaved replacement model bundle ->", args.out)
    print("Feature order:", model_data["feature_order"])


if __name__ == "__main__":
    main()