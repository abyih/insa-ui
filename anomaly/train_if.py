# Train Isolation Forest on dataset_sdn.csv (benign-only).
# Feature set matches FlowTableExtractor in features.py exactly.
#
# Usage:
#   python train_if.py --data ~/Downloads/dataset_sdn.csv

import argparse
import os
import numpy as np
import pandas as pd
import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.ensemble import IsolationForest
from sklearn.metrics import classification_report, accuracy_score

EPS = 1e-9

# Must match FLOW_TABLE_FEATURES in features.py
FEATURES = [
    "avg_packet_size",
    "bytes_per_second",
    "packet_count",
    "active_flow_count",
    "asymmetry",
]

LABEL_COL = "label"


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    pktcount  = pd.to_numeric(df["pktcount"],  errors="coerce").fillna(0).clip(lower=0)
    bytecount = pd.to_numeric(df["bytecount"], errors="coerce").fillna(0).clip(lower=0)
    dur       = pd.to_numeric(df["dur"],       errors="coerce").fillna(0).clip(lower=0)
    dur_nsec  = pd.to_numeric(df["dur_nsec"],  errors="coerce").fillna(0).clip(lower=0)
    flows     = pd.to_numeric(df.get("flows",  pd.Series(1, index=df.index)),
                               errors="coerce").fillna(1).clip(lower=1)

    total_dur = dur + dur_nsec / 1e9

    X = pd.DataFrame()
    X["avg_packet_size"]   = bytecount / (pktcount + EPS)
    X["bytes_per_second"]  = bytecount / (total_dur + EPS)
    X["packet_count"]      = pktcount
    X["active_flow_count"] = flows
    X["asymmetry"]         = 1.0          # constant placeholder

    X.replace([np.inf, -np.inf], 0, inplace=True)
    X = X.fillna(0).clip(lower=0)
    return X[FEATURES]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data",   required=True)
    parser.add_argument("--out",    default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "pretrained_if.pkl"))
    parser.add_argument("--sample", type=float, default=1.0)
    args = parser.parse_args()

    print("Loading", args.data)
    df = pd.read_csv(args.data, low_memory=False)
    df.columns = df.columns.str.strip()

    X = build_features(df)
    y = df[LABEL_COL].astype(int)

    X_benign = X[y == 0]
    X_train  = X_benign.sample(frac=min(args.sample, 1.0), random_state=1)
    print("Training IF on %d benign-only samples (%d features)" % (len(X_train), len(FEATURES)))

    clf = IsolationForest(n_estimators=100, contamination=0.01, random_state=42)
    clf.fit(X_train)

    X_test = X.sample(frac=min(args.sample, 0.2), random_state=42)
    y_test = y.loc[X_test.index]
    scores   = clf.decision_function(X_test)
    y_mapped = np.where(clf.predict(X_test) == -1, 1, 0)

    print("Accuracy: %.4f" % accuracy_score(y_test, y_mapped))
    print(classification_report(y_test, y_mapped, target_names=["Benign", "Attack"]))

    benign_scores = scores[y_test.values == 0]
    mu  = float(benign_scores.mean())
    sig = float(benign_scores.std())

    soft_threshold = float(np.percentile(benign_scores, 1.0))
    hard_threshold = float(np.percentile(benign_scores, 0.1))
    print("Soft threshold (1st pct) : %.4f" % soft_threshold)
    print("Hard threshold (0.1 pct): %.4f" % hard_threshold)

    try:
        plt.figure(figsize=(10, 4))
        sns.histplot(scores[y_test.values == 0], color="green", label="Benign", kde=True, bins=50)
        sns.histplot(scores[y_test.values == 1], color="red",   label="Attack", kde=True, bins=50)
        plt.axvline(soft_threshold, color="orange", linestyle="--", label="Soft threshold")
        plt.axvline(hard_threshold, color="black",  linestyle="--", label="Hard threshold")
        plt.title("IF Score Distribution — new feature set")
        plt.legend()
        plt.tight_layout()
        out_img = os.path.join(os.path.dirname(args.out), "if_score_distribution.png")
        plt.savefig(out_img)
        print("Plot saved →", out_img)
    except Exception as e:
        print("Plot skipped:", e)

    joblib.dump({
        "model":            clf,
        "feature_order":    FEATURES,
        "contamination":    0.01,
        "trained_samples":  len(X_train),
        "soft_threshold":   soft_threshold,
        "hard_threshold":   hard_threshold,
    }, args.out)
    print("Saved →", args.out)


if __name__ == "__main__":
    main()
