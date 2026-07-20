# Live attack replay test.
# Reads labeled rows from dataset_sdn.csv and sends them to the detector.
#
# Usage:
#   python test_attack.py --data ~/Downloads/dataset_sdn.csv
#   python test_attack.py --data ~/Downloads/dataset_sdn.csv --samples 100 --delay 0.05

import argparse
import time
import requests
import pandas as pd
import numpy as np

DETECTOR_URL = "http://localhost:5001"
EPS          = 1e-9

COLORS = {
    "ATTACK":         "\033[91m",
    "FAST_SUSPICIOUS":"\033[93m",
    "SUSPICIOUS":     "\033[93m",
    "NORMAL":         "\033[92m",
    "DEGRADED":       "\033[95m",
}
RESET = "\033[0m"
BOLD  = "\033[1m"


def row_to_features(row: dict) -> dict:
    """
    Build the 5-feature dict from a dataset_sdn.csv row.
    Must match FLOW_TABLE_FEATURES in features.py exactly.
    """
    pktcount  = max(float(row.get("pktcount",  0) or 0), 0)
    bytecount = max(float(row.get("bytecount", 0) or 0), 0)
    dur       = max(float(row.get("dur",       0) or 0), 0)
    dur_nsec  = max(float(row.get("dur_nsec",  0) or 0), 0)
    flows     = max(float(row.get("flows",     1) or 1), 1)

    total_dur = dur + dur_nsec / 1e9

    return {
        "avg_packet_size":   round(bytecount / (pktcount + EPS),  4),
        "bytes_per_second":  round(bytecount / (total_dur + EPS), 4),
        "packet_count":      round(pktcount,                       4),
        "active_flow_count": round(flows,                          4),
        "asymmetry":         1.0,
        "switch_id":         "global",
    }


def check_health() -> dict:
    try:
        r = requests.get("%s/health" % DETECTOR_URL, timeout=3)
        h = r.json()
        print("  features : %s" % h.get("features", "?"))
        print("  switches : %s" % h.get("switches", []))
        return h
    except Exception:
        print("Detector not reachable at", DETECTOR_URL)
        exit(1)


def send(features: dict) -> dict:
    r = requests.post("%s/detect" % DETECTOR_URL, json=features, timeout=5)
    return r.json()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data",    required=True)
    parser.add_argument("--samples", type=int,   default=50)
    parser.add_argument("--delay",   type=float, default=0.05)
    args = parser.parse_args()

    print("\n%sDetector health:%s" % (BOLD, RESET))
    check_health()

    df = pd.read_csv(args.data, low_memory=False)
    df.columns = df.columns.str.strip()

    n_benign = min(args.samples, int((df["label"] == 0).sum()))
    n_attack = min(args.samples, int((df["label"] == 1).sum()))
    samples  = pd.concat([
        df[df["label"] == 0].sample(n=n_benign, random_state=42),
        df[df["label"] == 1].sample(n=n_attack, random_state=42),
    ]).sample(frac=1, random_state=42).reset_index(drop=True)

    print("\nSending %d benign + %d attack samples\n" % (n_benign, n_attack))
    print("%-4s %-8s %-16s %-10s %-8s %s"
          % ("#", "True", "State", "Score", "Hard", "Match"))
    print("─" * 60)

    results = []
    for i, (_, row) in enumerate(samples.iterrows()):
        true_label = int(row["label"])
        features   = row_to_features(row.to_dict())

        try:
            resp = send(features)
        except Exception as e:
            print("%-4d ERROR: %s" % (i + 1, e))
            continue

        phase = resp.get("phase", "?")
        if phase in ("BASELINE", "SKIP", "TRAINED"):
            print("%-4d %-8s (%s)" % (i + 1,
                  "ATTACK" if true_label else "BENIGN", phase.lower()))
            time.sleep(args.delay)
            continue

        state      = resp.get("state", "NORMAL")
        raw_score  = resp.get("raw_score")
        hard_anom  = resp.get("hard_anomaly", False)
        color      = COLORS.get(state, "")
        is_attack  = state in ("ATTACK", "SUSPICIOUS", "FAST_SUSPICIOUS")
        true_str   = "ATTACK" if true_label else "BENIGN"
        match      = (true_label == 1) == is_attack
        score_str  = ("%.4f" % raw_score) if raw_score is not None else "—"

        print("%-4d %-8s %s%-16s%s %-10s %-8s %s"
              % (i + 1, true_str, color, state, RESET,
                 score_str, str(hard_anom), "OK" if match else "MISS"))

        results.append({"true": true_label, "state": state})
        time.sleep(args.delay)

    det = [r for r in results if r["state"] not in ("BASELINE", "SKIP", "TRAINED")]
    if not det:
        print("\nAll samples consumed during baseline/training. Re-run to test detection.")
        return

    total = len(det)
    tp = sum(1 for r in det if r["true"] == 1 and r["state"] in ("ATTACK", "SUSPICIOUS", "FAST_SUSPICIOUS"))
    tn = sum(1 for r in det if r["true"] == 0 and r["state"] == "NORMAL")
    fp = sum(1 for r in det if r["true"] == 0 and r["state"] in ("ATTACK", "SUSPICIOUS", "FAST_SUSPICIOUS"))
    fn = sum(1 for r in det if r["true"] == 1 and r["state"] == "NORMAL")

    acc  = (tp + tn) / total * 100 if total else 0
    prec = tp / (tp + fp) * 100    if (tp + fp) else 0
    rec  = tp / (tp + fn) * 100    if (tp + fn) else 0
    fpr  = fp / (fp + tn) * 100    if (fp + tn) else 0
    f1   = 2 * prec * rec / (prec + rec) if (prec + rec) else 0

    print("\n%s%s" % (BOLD, "─" * 60))
    print("Summary (%d detection-phase samples)%s" % (total, RESET))
    print("  Accuracy  : %.1f%%" % acc)
    print("  Precision : %.1f%%" % prec)
    print("  Recall    : %.1f%%" % rec)
    print("  FPR       : %.2f%%  %s" % (fpr, "✅ < 1%" if fpr < 1 else "⚠️  > 1%"))
    print("  F1        : %.1f%%" % f1)
    print("  TP=%d  TN=%d  FP=%d  FN=%d" % (tp, tn, fp, fn))


if __name__ == "__main__":
    main()
