"""
Final correlation check before deciding what to add/drop.

Usage:
    python anomaly/correlation_check.py --data ~/Downloads/dataset_sdn.csv
"""

import argparse
import numpy as np
import pandas as pd

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    args = parser.parse_args()

    df = pd.read_csv(args.data, low_memory=False)
    df.columns = df.columns.str.strip()

    df['rx_kbps']  = pd.to_numeric(df['rx_kbps'],  errors="coerce").fillna(df['rx_kbps'].median())
    df['tot_kbps'] = pd.to_numeric(df['tot_kbps'], errors="coerce").fillna(df['tot_kbps'].median())

    # Engineered features
    df['avg_pkt_size']         = df['bytecount'] / (df['pktcount'] + 1)
    df['total_duration_sec']   = df['dur'] + df['dur_nsec'] / 1e9
    df['bytes_per_sec']        = df['bytecount'] / (df['total_duration_sec'] + 1e-9)
    df['pkts_per_sec']         = df['pktcount']  / (df['total_duration_sec'] + 1e-9)
    df['controller_pressure']  = df['packetins'] / (df['flows'] + 1)
    df['tx_rx_byte_asymmetry'] = (
        (df['tx_bytes'] - df['rx_bytes']) /
        (df['tx_bytes'] + df['rx_bytes'] + 1)
    )

    candidates = [
        'avg_pkt_size', 'total_duration_sec', 'bytes_per_sec',
        'pkts_per_sec', 'controller_pressure', 'tx_rx_byte_asymmetry',
        'bytecount', 'pktcount', 'tot_dur', 'packetins', 'tx_bytes',
    ]
    # Only keep columns that exist
    candidates = [c for c in candidates if c in df.columns]

    data = df[candidates].copy()
    for col in data.columns:
        data[col] = pd.to_numeric(data[col], errors="coerce")
    data = data.replace([np.inf, -np.inf], np.nan).fillna(0)

    corr = data.corr().abs().round(3)

    print("Absolute correlation matrix:")
    print(corr.to_string())

    print("\nHighly correlated pairs (>0.85) — one of each pair is redundant:")
    found = False
    for i in range(len(corr.columns)):
        for j in range(i):
            val = corr.iloc[i, j]
            if val > 0.85:
                found = True
                print(f"  ⚠️  {corr.columns[i]:<30} <-> {corr.columns[j]:<30} r={val}")
    if not found:
        print("  ✅  No highly correlated pairs found.")

    print("\nModerately correlated pairs (0.6–0.85) — be aware:")
    for i in range(len(corr.columns)):
        for j in range(i):
            val = corr.iloc[i, j]
            if 0.6 < val <= 0.85:
                print(f"  ℹ️  {corr.columns[i]:<30} <-> {corr.columns[j]:<30} r={val}")

if __name__ == "__main__":
    main()
