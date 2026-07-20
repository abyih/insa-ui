"""
Dataset diagnostic script — run this once before any training.

Usage:
    python anomaly/diagnose_dataset.py --data ~/Downloads/dataset_sdn.csv
"""

import argparse
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")  # no display needed — saves plots to files
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.feature_selection import mutual_info_classif

# The 7 features the RF is trained on (must match train_classifier.py)
FEATURE_COLS = {
    "pktperflow":  "APf",
    "byteperflow": "ABf",
    "Pairflow":    "PPf",
    "pktrate":     "GSf",
    "port_no":     "GDP",
    "tot_kbps":    "BW",
}
FEATURE_ORDER = ["APf", "ABf", "APkS", "PPf", "GSf", "GDP", "BW"]
LABEL_COL     = "label"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="Path to dataset_sdn.csv")
    args = parser.parse_args()

    print("=" * 60)
    print("  SDN Dataset Diagnostic")
    print("=" * 60)

    # ── Load ──────────────────────────────────────────────────────────────────
    df = pd.read_csv(args.data, low_memory=False)
    df.columns = df.columns.str.strip()
    print("\nShape:", df.shape)

    # ── Class distribution ────────────────────────────────────────────────────
    print("\nClass distribution:")
    counts = df[LABEL_COL].value_counts()
    print(counts.to_string())
    ratio = counts.min() / counts.max()
    print(f"\nClass balance ratio (minority/majority): {ratio:.4f}")
    if ratio < 0.5:
        print("  ⚠️  Imbalanced dataset — consider class_weight='balanced' in RF")
    else:
        print("  ✅  Reasonably balanced")

    # ── Missing values ────────────────────────────────────────────────────────
    missing = df.isnull().sum()
    missing = missing[missing > 0]
    print("\nMissing values:")
    if missing.empty:
        print("  ✅  None")
    else:
        print(missing.to_string())

    # ── Infinite values ───────────────────────────────────────────────────────
    inf_count = np.isinf(df.select_dtypes(include=np.number)).sum().sum()
    print(f"\nInfinite values: {inf_count}")
    if inf_count > 0:
        print("  ⚠️  Infinite values found — will be replaced with 0 during training")

    # ── Build feature matrix ──────────────────────────────────────────────────
    X = pd.DataFrame()
    for raw_col, feat in FEATURE_COLS.items():
        X[feat] = pd.to_numeric(df[raw_col], errors="coerce").fillna(0)
    X["APkS"] = np.where(X["APf"] > 0, X["ABf"] / X["APf"], 0)
    X["PPf"]  = X["PPf"] * 100
    X.replace([np.inf, -np.inf], 0, inplace=True)
    X = X.clip(lower=0)
    X = X[FEATURE_ORDER]
    y = df[LABEL_COL].astype(int)

    # ── Per-feature stats by class ────────────────────────────────────────────
    print("\nFeature statistics by class (benign=0 / attack=1):")
    print(f"  {'Feature':<8} {'Benign median':>14} {'Benign p95':>12} {'Attack median':>14} {'Attack p95':>12} {'Separation':>12}")
    print("  " + "-" * 76)
    for feat in FEATURE_ORDER:
        b = X[feat][y == 0]
        a = X[feat][y == 1]
        sep = abs(a.median() - b.median())
        print(f"  {feat:<8} {b.median():>14.2f} {b.quantile(0.95):>12.2f} "
              f"{a.median():>14.2f} {a.quantile(0.95):>12.2f} {sep:>12.2f}")

    # ── Mutual information ────────────────────────────────────────────────────
    print("\nMutual information with label (higher = more predictive):")
    mi = mutual_info_classif(X, y, random_state=42)
    for feat, score in sorted(zip(FEATURE_ORDER, mi), key=lambda x: -x[1]):
        bar = "█" * int(score * 40)
        print(f"  {feat:<8} {score:.4f}  {bar}")

    # ── All columns audit — find unused features ──────────────────────────────
    print("\n--- All dataset columns ---")
    print(df.columns.tolist())
    used_raw = set(FEATURE_COLS.keys()) | {LABEL_COL}
    unused = [c for c in df.columns if c not in used_raw]
    print(f"\nColumns NOT currently used ({len(unused)}):")
    for col in unused:
        series = pd.to_numeric(df[col], errors="coerce")
        if series.notna().sum() == 0:
            print(f"  {col:<30} — non-numeric, skipping")
            continue
        mi_score = None
        try:
            from sklearn.feature_selection import mutual_info_classif as mic
            mi_score = mic(series.fillna(0).values.reshape(-1,1), y, random_state=42)[0]
        except Exception:
            pass
        sep = abs(series[y==1].median() - series[y==0].median()) if series.notna().sum() > 0 else 0
        flag = "  ← HIGH MI, consider adding" if mi_score and mi_score > 0.1 else ""
        print(f"  {col:<30} MI={mi_score:.4f if mi_score is not None else 'n/a'}  "
              f"sep={sep:.2f}{flag}")

    # ── Strong feature correlation ────────────────────────────────────────────
    print("\n--- Correlation matrix (strong features only) ---")
    strong = ["ABf", "APf", "APkS", "GSf", "BW"]
    strong_present = [f for f in strong if f in X.columns]
    corr = X[strong_present].corr().round(3)
    print(corr.to_string())
    print()
    # Flag highly correlated pairs
    for i in range(len(strong_present)):
        for j in range(i+1, len(strong_present)):
            val = corr.iloc[i, j]
            if abs(val) > 0.85:
                print(f"  ⚠️  {strong_present[i]} ↔ {strong_present[j]} = {val:.3f} "
                      f"— highly correlated, one may be redundant")
            elif abs(val) > 0.6:
                print(f"  ℹ️  {strong_present[i]} ↔ {strong_present[j]} = {val:.3f} "
                      f"— moderate correlation")

    # ── PPf and GDP deep investigation ───────────────────────────────────────
    print("\n--- PPf (Pairflow) raw investigation ---")
    raw_ppf = pd.to_numeric(df["Pairflow"], errors="coerce").fillna(0)
    print(raw_ppf.describe().to_string())
    print("\nTop value counts (raw, before ×100 scaling):")
    print(raw_ppf.value_counts().head(10).to_string())
    ppf_by_label = pd.DataFrame({"PPf_raw": raw_ppf, "label": y})
    print("\nPPf=1 rate by class:")
    print(ppf_by_label.groupby("label")["PPf_raw"].mean().to_string())
    if raw_ppf.nunique() <= 2:
        print("  ⚠️  PPf is binary (0/1 only) — low variance, likely low MI")
        ones_pct = (raw_ppf == 1).mean() * 100
        print(f"  PPf=1 in {ones_pct:.1f}% of all rows")
        if ones_pct > 90 or ones_pct < 10:
            print("  ⚠️  Nearly constant — almost no discriminative power")
        benign_ones = ppf_by_label[ppf_by_label["label"]==0]["PPf_raw"].mean()*100
        attack_ones = ppf_by_label[ppf_by_label["label"]==1]["PPf_raw"].mean()*100
        print(f"  PPf=1 in benign: {benign_ones:.1f}%  |  attack: {attack_ones:.1f}%")
        if abs(benign_ones - attack_ones) < 5:
            print("  ⚠️  No class separation — PPf is not helping the RF at all")
        else:
            print(f"  ✅  {abs(benign_ones-attack_ones):.1f}pp separation — PPf has some signal")

    print("\n--- GDP (port_no) raw investigation ---")
    raw_gdp = pd.to_numeric(df["port_no"], errors="coerce").fillna(0)
    print(raw_gdp.describe().to_string())
    print("\nTop value counts:")
    print(raw_gdp.value_counts().head(10).to_string())
    gdp_by_label = pd.DataFrame({"GDP": raw_gdp, "label": y})
    print("\nGDP mean by class:")
    print(gdp_by_label.groupby("label")["GDP"].mean().to_string())
    if raw_gdp.nunique() <= 5:
        print(f"  ⚠️  GDP has only {raw_gdp.nunique()} unique values — low cardinality")
    gdp_sep = abs(gdp_by_label[gdp_by_label["label"]==1]["GDP"].mean() -
                  gdp_by_label[gdp_by_label["label"]==0]["GDP"].mean())
    if gdp_sep < 0.5:
        print("  ⚠️  GDP mean difference between classes < 0.5 — near-zero discriminative power")
    else:
        print(f"  ✅  GDP mean separation: {gdp_sep:.3f}")

    # ── Correlation matrix plot ───────────────────────────────────────────────
    corr = X.corr()
    plt.figure(figsize=(8, 6))
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm", square=True)
    plt.title("Feature Correlation Matrix")
    plt.tight_layout()
    plt.savefig("anomaly/correlation_matrix.png")
    print("\nCorrelation matrix saved → anomaly/correlation_matrix.png")

    # ── Score distribution hint ───────────────────────────────────────────────
    print("\nKey ratios for RF accuracy:")
    apf_sep  = abs(X["APf"][y==1].median()  - X["APf"][y==0].median())
    gsf_sep  = abs(X["GSf"][y==1].median()  - X["GSf"][y==0].median())
    bw_sep   = abs(X["BW"][y==1].median()   - X["BW"][y==0].median())
    print(f"  APf separation (attack-benign median): {apf_sep:.1f}")
    print(f"  GSf separation:                        {gsf_sep:.1f}")
    print(f"  BW  separation:                        {bw_sep:.1f}")
    if bw_sep > gsf_sep:
        print("  → BW is your strongest discriminator for this dataset")
    else:
        print("  → GSf is your strongest discriminator for this dataset")

    print("\n" + "=" * 60)
    print("  Done. Fix any ⚠️  warnings before retraining.")
    print("=" * 60)


if __name__ == "__main__":
    main()
