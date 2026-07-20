# RF OFFLINE_RF Mode — Full Forensic Audit Report

## Status: ALL BUGS FIXED ✓

---

## Bug 1 — Scale Mismatch (CRITICAL) ✓ FIXED

**Root cause:** RF trained with `StandardScaler` on dataset where features have enormous values
(APf mean=6562, ABf mean=4.8M). Live Mininet traffic is orders of magnitude smaller.
After scaling, all live vectors land in deeply-negative feature space → RF stuck at ~50% prob.

**Fix:** Replaced `StandardScaler` with `log1p + RobustScaler`:
- `log1p` compresses high-magnitude features (APf, ABf, APkS, GSf, BW) before scaling
- `RobustScaler` uses median/IQR instead of mean/std — robust to outlier attack spikes
- Same transform applied at inference time in `detector.py` via `clf_log_features` from pkl

---

## Bug 2 — Suspicious Zone Falls Through to NORMAL ✓ FIXED

**Root cause:** `DecisionEngine.decide()` had no branch for `if_score is None AND rf_zone == "suspicious"`.
Result: `prob=0.55, zone=suspicious → final_decision=NORMAL`.

**Fix:** Added explicit branch in `detector.py`:
```python
elif if_score is None and rf_zone == "suspicious":
    d, r = "SUSPICIOUS", "RF suspicious: prob=%.2f zone=%s" % (...)
```

---

## Bug 3 — Pretrained Model Path Assumes CWD ✓ FIXED

**Root cause:** `PRETRAINED_CLF_PATH` defaulted to `"pretrained_clf.pkl"` (relative).
When detector runs from workspace root, file not found → RF never loads.

**Fix:**
```python
_HERE = os.path.dirname(os.path.abspath(__file__))
PRETRAINED_CLF_PATH = os.path.join(_HERE, "pretrained_clf.pkl")
```

---

## Bug 4 — Stale API Documentation ✓ FIXED

`anomaly-api.js` comment documented old fields (`raw_decision`, `anomaly_signal`,
`escalation_hits`, `mitigation`). Updated to match actual response shape.

---

## Bug 5 — UDP Flood Not Detected (CRITICAL) ✓ FIXED

**Root cause (dataset mismatch):**

The training dataset attacks are characterized by **HIGH APf/ABf** (many bytes per flow):
```
APf:  benign median=30,    attack median=8575
ABf:  benign median=2940,  attack median=6,028,230
GSf:  benign median=1,     attack median=285  (max=639 pkt/s)
```

Live UDP floods have the **opposite signature**:
- LOW APf (small packets, e.g. 64-byte UDP)
- LOW ABf (small bytes per flow)
- HIGH GSf (500–90,000 pkt/s — far exceeds dataset max of 639)

The RF model has never seen GSf > 639 during training. It cannot classify
high-rate UDP floods correctly via normal inference.

**Fix 1 — Added BW (bandwidth kbps) as 7th feature:**
- `dataset_sdn.csv` has `tot_kbps` column: attack median=253 kbps vs benign median=2 kbps
- Live pipeline computes: `BW = (delta_bytes * 8) / (delta_time * 1000)`
- BW captures the UDP flood bandwidth signal that APf/ABf alone miss
- Feature importance: BW=4.85% (5th most important, above PPf and GDP)

**Fix 2 — UDP flood hard override in `score_rf()`:**
```python
if gsf_val > 800 or bw_val > 2000:
    prob = min(0.50 + (gsf_val / 1600) + (bw_val / 8000), 0.99)
```
When GSf or BW exceeds the dataset's training range, the override fires and
computes a scaled probability directly from the rate/bandwidth values.

**Files changed:**
- `train_classifier.py` — added BW feature, log1p+RobustScaler
- `detector.py` — FEATURE_KEYS now 7 items, score_rf() has UDP override
- `traffic-features-mapper.js` — computes BW per-switch and globally
- `src/Pages/Stats.jsx` — shows BW feature card

---

## Validation Results

After all fixes, end-to-end test through live detector:

```
benign-light      prob=0.36  zone=benign              → NORMAL   ✓
benign-moderate   prob=0.26  zone=benign              → NORMAL   ✓
udp-flood-medium  prob=0.99  zone=high_conf_attack    → ATTACK   ✓  (override)
udp-flood-large   prob=0.99  zone=high_conf_attack    → ATTACK   ✓  (override)
dataset-attack    prob=0.85  zone=attack              → ATTACK   ✓
```

RF model accuracy on test set: **95.68%**

---

## Feature Pipeline (Final State)

| Feature | Dataset column | Live computation | log1p |
|---------|---------------|-----------------|-------|
| APf | pktperflow | Δpackets / Δflows | ✓ |
| ABf | byteperflow | Δbytes / Δflows | ✓ |
| APkS | derived | ABf / APf | ✓ |
| PPf | Pairflow×100 | hasPair ? 100 : 0 | ✗ |
| GSf | pktrate | Δpackets / Δtime | ✓ |
| GDP | port_no | extractSwitchPortNo() 1–5 | ✗ |
| BW | tot_kbps | (Δbytes×8) / (Δtime×1000) | ✓ |

---

## How to Run

```bash
# Retrain (already done — pretrained_clf.pkl is current)
/home/alazar/venv/bin/python3 Insa-dlux/anomaly/train_classifier.py \
  --data ~/Downloads/dataset_sdn.csv

# Start detector
MODE=OFFLINE_RF /home/alazar/venv/bin/python3 Insa-dlux/anomaly/detector.py

# Test
/home/alazar/venv/bin/python3 Insa-dlux/anomaly/test_attack.py \
  --data ~/Downloads/dataset_sdn.csv --samples 100
```
