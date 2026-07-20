# Train Random Forest on dataset_sdn.csv
# Feature set: avg_pkt_size, total_duration_sec, bytes_per_sec,
#              tx_rx_byte_asymmetry, pktcount, tx_bytes
#
# Usage:
#   python train_classifier.py --data ~/Downloads/dataset_sdn.csv

import argparse
import os
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import RobustScaler
from sklearn.metrics import classification_report, accuracy_score

EPS = 1e-9

FEATURES = [
    "avg_pkt_size",
    "total_duration_sec",
    "bytes_per_sec",
    "tx_rx_byte_asymmetry",
    "pktcount",
    "tx_bytes",
]

# High-magnitude right-skewed features — log1p before scaling
LOG_FEATURES = ["avg_pkt_size", "bytes_per_sec", "pktcount", "tx_bytes"]

LABEL_COL = "label"


def build_features(df):
    X = pd.DataFrame()

    pktcount  = pd.to_numeric(df["pktcount"],  errors="coerce").fillna(0).clip(lower=0)
    bytecount = pd.to_numeric(df["bytecount"], errors="coerce").fillna(0).clip(lower=0)
    dur       = pd.to_numeric(df["dur"],       errors="coerce").fillna(0).clip(lower=0)
    dur_nsec  = pd.to_numeric(df["dur_nsec"],  errors="coerce").fillna(0).clip(lower=0)
    tx_bytes  = pd.to_numeric(df.get("tx_bytes", pd.Series(0, index=df.index)),
                               errors="coerce").fillna(0).clip(lower=0)
    rx_bytes  = pd.to_numeric(df.get("rx_bytes", pd.Series(0, index=df.index)),
                               errors="coerce").fillna(0).clip(lower=0)

    total_dur = dur + dur_nsec / 1e9

    X["avg_pkt_size"]         = bytecount / (pktcount + EPS)
    X["total_duration_sec"]   = total_dur
    X["bytes_per_sec"]        = bytecount / (total_dur + EPS)
    X["tx_rx_byte_asymmetry"] = (tx_bytes - rx_bytes).abs() / (tx_bytes + rx_bytes + EPS)
    X["pktcount"]             = pktcount
    X["tx_bytes"]             = tx_bytes

    X.replace([np.inf, -np.inf], 0, inplace=True)
    X = X.fillna(0).clip(lower=0)

    # ── Debug: shape and NaN check ────────────────────────────────────────────
    print("[DEBUG] Feature matrix shape:", X.shape)
    nan_counts = X.isnull().sum()
    if nan_counts.any():
        print("[DEBUG] NaN counts after build:\n", nan_counts[nan_counts > 0])
    else:
        print("[DEBUG] No NaN values.")
    print("[DEBUG] Feature stats:")
    print(X.describe().to_string())

    return X[FEATURES]


def log_transform(X_df):
    if not hasattr(X_df, "columns"):
        X_df = pd.DataFrame(X_df, columns=FEATURES)
    X = X_df.copy()
    for f in LOG_FEATURES:
        if f in X.columns:
            X[f] = np.log1p(X[f].clip(lower=0))
    return X.values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    parser.add_argument("--out",  default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "pretrained_clf.pkl"))
    args = parser.parse_args()

    print("Loading", args.data)
    df = pd.read_csv(args.data, low_memory=False)
    df.columns = df.columns.str.strip()
    print("  Rows: %d  Columns: %d" % (len(df), len(df.columns)))

    X = build_features(df)
    y = df[LABEL_COL].astype(int)

    print("\nClass distribution:", dict(y.value_counts()))
    print("Balance ratio: %.4f" % (y.value_counts().min() / y.value_counts().max()))

    print("\nFeature separation (benign vs attack median):")
    for f in FEATURES:
        b, a = X[f][y == 0].median(), X[f][y == 1].median()
        print("  %-25s benign=%-12.2f attack=%-12.2f sep=%.2f" % (f, b, a, abs(a - b)))

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y)

    X_train_log = log_transform(X_train)
    X_test_log  = log_transform(X_test)

    # Fit scaler on benign-only training samples
    benign_mask = y_train.values == 0
    scaler = RobustScaler()
    scaler.fit(X_train_log[benign_mask])
    X_train_s = scaler.transform(X_train_log)
    X_test_s  = scaler.transform(X_test_log)

    print("\nScaler fit on %d benign-only samples" % benign_mask.sum())
    print("  Center:", np.round(scaler.center_, 4))
    print("  Scale: ", np.round(scaler.scale_,  4))

    print("\nTraining Random Forest (%d features)..." % len(FEATURES))
    clf = RandomForestClassifier(
        n_estimators=300,
        min_samples_leaf=5,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train_s, y_train)

    y_pred = clf.predict(X_test_s)
    print("\nAccuracy: %.4f" % accuracy_score(y_test, y_pred))
    print(classification_report(y_test, y_pred, target_names=["Benign", "Attack"]))

    importances = sorted(zip(FEATURES, clf.feature_importances_), key=lambda x: -x[1])
    print("Feature importances:")
    for f, imp in importances:
        print("  %-25s %.4f  %s" % (f, imp, "█" * int(imp * 50)))

    # ── Cross-validation ──────────────────────────────────────────────────────
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    from sklearn.pipeline import Pipeline

    print("\n" + "=" * 50)
    print("CROSS VALIDATION RESULTS")
    print("=" * 50)

    # Build a pipeline so CV applies log+scale consistently on each fold
    from sklearn.preprocessing import FunctionTransformer
    def log_scale(X_arr):
        df = pd.DataFrame(X_arr, columns=FEATURES)
        logged = log_transform(df)
        return scaler.transform(logged)

    cv     = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    X_all  = log_transform(X)          # log-transform full set
    X_all_s = scaler.transform(X_all)  # scale with benign-fit scaler

    cv_scores = cross_val_score(clf, X_all_s, y, cv=cv, scoring="f1_macro", n_jobs=-1)
    print("F1 per fold: %s" % cv_scores.round(4))
    print("Mean F1:     %.4f" % cv_scores.mean())
    print("Std  F1:     %.4f" % cv_scores.std())
    if cv_scores.std() > 0.01:
        print("⚠️  UNSTABLE — model varies too much across folds")
    else:
        print("✅  STABLE — consistent across folds")

    # ── Misclassified sample analysis ─────────────────────────────────────────
    print("\n" + "=" * 50)
    print("MISCLASSIFIED SAMPLE ANALYSIS")
    print("=" * 50)

    wrong_mask = y_pred != y_test.values
    wrong_df   = pd.DataFrame(X_test.values, columns=FEATURES)
    wrong_df["true_label"] = y_test.values
    wrong_df["predicted"]  = y_pred
    wrong = wrong_df[wrong_mask]

    fn = wrong[wrong["true_label"] == 1]  # attacks missed
    fp = wrong[wrong["true_label"] == 0]  # benign flagged

    print("Total misclassified: %d" % len(wrong))
    print("\nType breakdown:")
    print("  False Negatives (missed attacks): %d  ← DANGEROUS" % len(fn))
    print("  False Positives (benign flagged): %d  ← ANNOYING"  % len(fp))

    if len(fn) > 0:
        print("\nMissed attack feature profile:")
        print(fn[FEATURES].describe().round(3).to_string())
        print("\nMissed attack feature means vs all attack means:")
        all_attacks = wrong_df[wrong_df["true_label"] == 1]
        for f in FEATURES:
            missed_mean = fn[f].mean()
            all_mean    = all_attacks[f].mean() if len(all_attacks) else float("nan")
            print("  %-25s missed=%-12.2f all_attacks=%-12.2f" % (f, missed_mean, all_mean))

    if len(fp) > 0:
        print("\nFalse positive feature profile:")
        print(fp[FEATURES].describe().round(3).to_string())

    joblib.dump({
        "model":         clf,
        "scaler":        scaler,
        "feature_order": FEATURES,
        "log_features":  LOG_FEATURES,
        "attack_class":  1,
    }, args.out)
    print("\nSaved ->", args.out)
    print("Features:", FEATURES)


if __name__ == "__main__":
    main()
