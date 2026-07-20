"""
Feature signal test — finds which unused columns and engineered features
have the most predictive power for the RF classifier.

Usage:
    python anomaly/feature_signal_test.py --data ~/Downloads/dataset_sdn.csv
"""

import argparse
import numpy as np
import pandas as pd
from sklearn.feature_selection import mutual_info_classif

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    args = parser.parse_args()

    df = pd.read_csv(args.data, low_memory=False)
    df.columns = df.columns.str.strip()

    df['rx_kbps']  = df['rx_kbps'].fillna(df['rx_kbps'].median())
    df['tot_kbps'] = df['tot_kbps'].fillna(df['tot_kbps'].median())
    y = df['label'].values

    # ── Step 1: Raw ignored columns ───────────────────────────────────────────
    print("=" * 55)
    print("RAW COLUMN SIGNAL TEST")
    print("=" * 55)

    raw_candidates = [
        'pktcount', 'bytecount', 'dur', 'dur_nsec',
        'tot_dur', 'packetins', 'tx_bytes', 'rx_bytes',
        'tx_kbps', 'rx_kbps', 'tot_kbps', 'Protocol',
    ]
    # Only keep columns that actually exist in this dataset
    raw_candidates = [c for c in raw_candidates if c in df.columns]

    raw_data = df[raw_candidates].copy()
    # Convert each column to numeric individually — Protocol may be a string ("TCP"/"UDP")
    for col in raw_data.columns:
        raw_data[col] = pd.to_numeric(raw_data[col], errors="coerce")
    raw_data = raw_data.replace([np.inf, -np.inf], np.nan)
    raw_data = raw_data.fillna(raw_data.median(numeric_only=True))
    raw_data = raw_data.fillna(0)  # catch columns where median itself is NaN (all-NaN cols)

    mi_raw = mutual_info_classif(raw_data, y, random_state=42)

    print(f"{'Column':<25} {'MI Score':<12} Signal")
    print("-" * 60)
    for col, mi in sorted(zip(raw_candidates, mi_raw), key=lambda x: -x[1]):
        bar     = '█' * int(mi * 30)
        verdict = '🔥 Strong' if mi > 0.3 else ('✅ Moderate' if mi > 0.1 else '❌ Weak')
        print(f"{col:<25} {mi:<12.4f} {bar} {verdict}")

    # ── Step 2: Engineered features ───────────────────────────────────────────
    print("\n" + "=" * 55)
    print("ENGINEERED FEATURE SIGNAL TEST")
    print("=" * 55)

    eng = pd.DataFrame()

    if 'tx_bytes' in df.columns and 'rx_bytes' in df.columns:
        eng['tx_rx_byte_asymmetry'] = (
            (df['tx_bytes'] - df['rx_bytes']) /
            (df['tx_bytes'] + df['rx_bytes'] + 1)
        )
    if 'tx_kbps' in df.columns and 'rx_kbps' in df.columns:
        eng['tx_rx_kbps_asymmetry'] = (
            (df['tx_kbps'] - df['rx_kbps']) /
            (df['tx_kbps'] + df['rx_kbps'] + 1)
        )
    if 'dur' in df.columns and 'dur_nsec' in df.columns:
        eng['total_duration_sec'] = df['dur'] + df['dur_nsec'] / 1e9
        if 'bytecount' in df.columns:
            eng['bytes_per_sec'] = df['bytecount'] / (eng['total_duration_sec'] + 1e-9)
        if 'pktcount' in df.columns:
            eng['pkts_per_sec'] = df['pktcount'] / (eng['total_duration_sec'] + 1e-9)
    if 'packetins' in df.columns and 'flows' in df.columns:
        eng['controller_pressure'] = df['packetins'] / (df['flows'] + 1)
    if 'Protocol' in df.columns:
        proto = pd.to_numeric(df['Protocol'], errors="coerce").fillna(0)
        eng['is_tcp']  = (proto == 6).astype(int)
        eng['is_udp']  = (proto == 17).astype(int)
        eng['is_icmp'] = (proto == 1).astype(int)
    if 'bytecount' in df.columns and 'pktcount' in df.columns:
        eng['avg_pkt_size'] = df['bytecount'] / (df['pktcount'] + 1)
    if 'bytecount' in df.columns and 'flows' in df.columns:
        eng['bytes_per_flow'] = df['bytecount'] / (df['flows'] + 1)
    if 'pktcount' in df.columns and 'flows' in df.columns:
        eng['pkts_per_flow'] = df['pktcount'] / (df['flows'] + 1)

    if eng.empty:
        print("  No engineered features could be built — missing source columns.")
    else:
        eng = eng.replace([np.inf, -np.inf], np.nan)
        eng = eng.fillna(eng.median())

        mi_eng = mutual_info_classif(eng, y, random_state=42)

        print(f"{'Engineered Feature':<30} {'MI Score':<12} Signal")
        print("-" * 65)
        for col, mi in sorted(zip(eng.columns, mi_eng), key=lambda x: -x[1]):
            bar     = '█' * int(mi * 30)
            verdict = '🔥 Strong' if mi > 0.3 else ('✅ Moderate' if mi > 0.1 else '❌ Weak')
            print(f"{col:<30} {mi:<12.4f} {bar} {verdict}")

    # ── Step 3: Verdict ───────────────────────────────────────────────────────
    print("\n" + "=" * 55)
    print("VERDICT")
    print("=" * 55)

    all_cols = raw_candidates + (list(eng.columns) if not eng.empty else [])
    all_mi   = list(mi_raw)   + (list(mi_eng)      if not eng.empty else [])

    strong   = [(c, m) for c, m in zip(all_cols, all_mi) if m > 0.3]
    moderate = [(c, m) for c, m in zip(all_cols, all_mi) if 0.1 < m <= 0.3]
    weak     = [(c, m) for c, m in zip(all_cols, all_mi) if m <= 0.1]

    print(f"Strong features   (MI > 0.3):    {len(strong)}")
    print(f"Moderate features (MI 0.1-0.3):  {len(moderate)}")
    print(f"Weak/dead features (MI < 0.1):   {len(weak)}")

    print("\nRecommended additions to feature set:")
    candidates = sorted(strong + moderate, key=lambda x: -x[1])
    if not candidates:
        print("  No new features above MI=0.1 threshold found.")
    for col, mi in candidates:
        print(f"  ✅  {col:<30} MI={mi:.4f}")

    print("\nWeak/dead (consider dropping if already in use):")
    for col, mi in sorted(weak, key=lambda x: x[1]):
        print(f"  ❌  {col:<30} MI={mi:.4f}")


if __name__ == "__main__":
    main()
