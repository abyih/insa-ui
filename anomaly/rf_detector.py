"""
Random Forest detector for offline supervised classification.

Features:
- Loads the replacement RF bundle from pretrained_kdd_rf.pkl when available
- Falls back to the legacy 6-feature offline RF model
- Strictly offline, no baseline collection or online learning
- Independent feature pipeline from ODL-based detector

RF Features (must match train_classifier.py):
1. avg_pkt_size
2. total_duration_sec  
3. bytes_per_sec
4. tx_rx_byte_asymmetry
5. pktcount
6. tx_bytes
"""

import os
import time
import threading
from collections import deque
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib

# ── Constants ───────────────────────────────────────────────────────────────

FEATURE_KEYS = [
    "avg_pkt_size",
    "total_duration_sec", 
    "bytes_per_sec",
    "tx_rx_byte_asymmetry",
    "pktcount",
    "tx_bytes"
]

# Features that receive log1p transform (matches training)
LOG_FEATURES_DEFAULT = ["avg_pkt_size", "bytes_per_sec", "pktcount", "tx_bytes"]

# Probability thresholds for zones
RF_BENIGN_MAX      = 0.40    # < 0.40 → benign
RF_SUSPICIOUS_MAX  = 0.70    # 0.40-0.70 → suspicious  
RF_ATTACK_MIN      = 0.70    # 0.70-0.85 → attack
RF_HIGH_CONF       = 0.85    # ≥ 0.85 → high_confidence_attack

# Flood detection thresholds (override)
FLOOD_BPS_THRESHOLD = 250_000  # bytes per second
FLOOD_PKT_THRESHOLD = 50_000   # packets per second

PKL_PATHS = [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "pretrained_multiclass_rf.pkl"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "pretrained_kdd_rf.pkl"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "pretrained_clf.pkl"),
]

# ── RF State ────────────────────────────────────────────────────────────────

class DetectorState:
    """Thread-safe RF model state."""
    def __init__(self):
        self.mode              = "OFFLINE_RF"
        self.phase             = "DETECTION"
        self.clf_model         = None
        self.clf_scaler        = None
        self.clf_log_features  = []
        self.clf_feature_order  = FEATURE_KEYS.copy()
        self.clf_categorical_features = []
        self.clf_label_mode    = "binary"
        self.clf_normal_label  = 0
        self.clf_attack_index  = 1
        self.clf_class_names   = []         # multi-class: list of class name strings
        self.clf_label_encoder = None       # multi-class: LabelEncoder instance
        self.clf_normal_index  = 0          # multi-class: index of "Normal" in class list
        self.total_samples     = 0
        self.lock              = threading.Lock()

state = DetectorState()

# ── Adaptive Threshold Engine ───────────────────────────────────────────────

class AdaptiveThreshold:
    """Simple adaptive threshold for RF probabilities."""
    
    RF_BENIGN_MAX      = 0.40
    RF_SUSPICIOUS_MAX  = 0.69  # Changed from 0.70 to avoid overlap with attack zone
    RF_ATTACK_MIN      = 0.70
    RF_HIGH_CONF       = 0.85
    
    def __init__(self):
        self.threshold = 0.50  # Default threshold
        
    def stats(self):
        return {
            "threshold": self.threshold,
            "rf_zones": {
                "benign_max": self.RF_BENIGN_MAX,
                "suspicious_max": self.RF_SUSPICIOUS_MAX,
                "attack_min": self.RF_ATTACK_MIN,
                "high_conf": self.RF_HIGH_CONF,
            }
        }
    
    def rf_zone(self, prob):
        """Map RF probability to zone."""
        if prob >= self.RF_HIGH_CONF:
            return "high_confidence_attack"
        if prob >= self.RF_ATTACK_MIN:
            return "attack"
        if prob >= self.RF_BENIGN_MAX:
            return "suspicious"
        return "benign"

adaptive = AdaptiveThreshold()

# ── Metrics Tracker ────────────────────────────────────────────────────────

class MetricsTracker:
    """Simple metrics tracking."""
    def __init__(self):
        self.counts = {"NORMAL": 0, "SUSPICIOUS": 0, "ATTACK": 0}
        self.lock = threading.Lock()
    
    def record(self, score, final_state, threshold):
        with self.lock:
            if final_state in self.counts:
                self.counts[final_state] += 1
    
    def stats(self):
        with self.lock:
            total = sum(self.counts.values())
            return {
                "counts": dict(self.counts),
                "total": total,
                "percentages": {k: (v/total*100 if total > 0 else 0) 
                               for k, v in self.counts.items()}
            }

metrics = MetricsTracker()

# ── Recent Events Ring Buffer ──────────────────────────────────────────────

class RecentEvents:
    """Thread-safe ring buffer of recent detection events for the frontend."""
    MAX_EVENTS = 200

    def __init__(self):
        self.events = deque(maxlen=self.MAX_EVENTS)
        self.lock = threading.Lock()
        self._id_counter = 0

    def add(self, event: dict):
        with self.lock:
            self._id_counter += 1
            event["id"] = self._id_counter
            event["ts"] = time.time()
            self.events.append(event)

    def since(self, after_id: int = 0, limit: int = 100) -> list:
        with self.lock:
            result = [e for e in self.events if e["id"] > after_id]
            return result[-limit:]

    def all(self, limit: int = 100) -> list:
        with self.lock:
            return list(self.events)[-limit:]

    def clear(self):
        with self.lock:
            self.events.clear()
            self._id_counter = 0

    def stats(self) -> dict:
        with self.lock:
            events = list(self.events)
        total = len(events)
        if total == 0:
            return {"total": 0, "attacks": 0, "suspicious": 0, "normal": 0,
                    "attack_rate": 0, "avg_prob": 0, "threat_level": "NONE",
                    "by_protocol": {}, "recent_window": []}

        attacks = sum(1 for e in events if e.get("state") == "ATTACK")
        suspicious = sum(1 for e in events if e.get("state") == "SUSPICIOUS")
        normal = total - attacks - suspicious
        avg_prob = sum(e.get("attack_prob", 0) for e in events) / total

        # Threat level based on last 20 events
        recent = events[-20:]
        recent_attacks = sum(1 for e in recent if e.get("state") == "ATTACK")
        recent_ratio = recent_attacks / len(recent) if recent else 0
        if recent_ratio >= 0.5:
            threat = "CRITICAL"
        elif recent_ratio >= 0.25:
            threat = "HIGH"
        elif recent_attacks > 0:
            threat = "MEDIUM"
        elif any(e.get("state") == "SUSPICIOUS" for e in recent):
            threat = "LOW"
        else:
            threat = "NONE"

        # Protocol breakdown
        by_proto = {}
        for e in events:
            p = e.get("protocol", "unknown")
            s = e.get("state", "NORMAL")
            if p not in by_proto:
                by_proto[p] = {"total": 0, "attacks": 0}
            by_proto[p]["total"] += 1
            if s in ("ATTACK", "SUSPICIOUS"):
                by_proto[p]["attacks"] += 1

        # Probability timeline (last 50 events)
        timeline = [{"id": e["id"], "ts": e["ts"], "prob": e.get("attack_prob", 0),
                     "state": e.get("state", "NORMAL")} for e in events[-50:]]

        return {
            "total": total, "attacks": attacks, "suspicious": suspicious,
            "normal": normal, "attack_rate": round(attacks / total * 100, 1),
            "avg_prob": round(avg_prob, 4), "threat_level": threat,
            "by_protocol": by_proto, "recent_window": timeline,
        }

recent_events = RecentEvents()

# ── Decision Engine ────────────────────────────────────────────────────────

class DecisionEngine:
    """Simple decision engine for RF results."""
    
    @staticmethod
    def decide(src, if_score, if_anomaly, attack_prob, is_attack, threshold):
        """Convert RF results to final decision."""
        rf_zone_val = adaptive.rf_zone(attack_prob)
        esc = {
            "rf_zone":                rf_zone_val,
            "attack_prob":            attack_prob,
            "consecutive_if_anomaly": 0,
            "adaptive_threshold":     adaptive.threshold,
        }
        if attack_prob >= adaptive.RF_HIGH_CONF:
            return "ATTACK",    f"RF high confidence: prob={attack_prob:.4f}", esc
        if is_attack:
            return "ATTACK",    f"RF attack zone: prob={attack_prob:.4f}", esc
        if attack_prob >= adaptive.RF_BENIGN_MAX:
            return "SUSPICIOUS", f"RF suspicious zone: prob={attack_prob:.4f}", esc
        return "NORMAL",         f"RF benign zone: prob={attack_prob:.4f}", esc

engine = DecisionEngine()

# ── RF Functions ───────────────────────────────────────────────────────────

def load_rf():
    """Load RF model from pickle file."""
    pkl_path = next((path for path in PKL_PATHS if os.path.exists(path)), None)
    if not pkl_path:
        print(f"[RF] ERROR: PKL file not found in: {PKL_PATHS}")
        return False

    try:
        data = joblib.load(pkl_path)  # ← outside lock
        model = data.get("pipeline") or data.get("model")
        scaler = data.get("scaler")
        log_features = data.get("log_features", LOG_FEATURES_DEFAULT)
        feature_order = data.get("feature_order", FEATURE_KEYS)
        categorical_features = data.get("categorical_features", [])
        label_mode = data.get("label_mode", "binary")
        normal_label = data.get("normal_label", 0 if label_mode == "binary" else "Normal")
        attack_class = data.get("attack_class", 1)

        # Multi-class specific fields
        class_names = data.get("class_names", [])
        label_encoder = data.get("label_encoder", None)
        normal_index = 0

        attack_index = 1
        final_model = model.named_steps["model"] if hasattr(model, "named_steps") and "model" in model.named_steps else model
        classes_list = list(getattr(final_model, "classes_", [])) if final_model is not None else []

        if label_mode == "multiclass":
            # For multi-class, find the Normal class index
            if class_names:
                normal_index = class_names.index("Normal") if "Normal" in class_names else 0
            elif label_encoder is not None:
                class_names = list(label_encoder.classes_)
                normal_index = class_names.index("Normal") if "Normal" in class_names else 0
            else:
                class_names = [str(c) for c in classes_list]
                normal_index = 0
            print(f"[RF] Multi-class model: {len(class_names)} classes")
            print(f"[RF] Classes: {class_names}")
        elif label_mode == "binary" and model is not None:
            if attack_class in classes_list:
                attack_index = classes_list.index(attack_class)
            else:
                attack_index = 1 if len(classes_list) > 1 else 0

        if scaler is not None and not hasattr(scaler, "transform"):
            print("[RF] WARN: scaler missing transform method, using None")
            scaler = None

        with state.lock:  # ← assign inside lock only
            state.clf_model = model
            state.clf_scaler = scaler
            state.clf_log_features = log_features
            state.clf_feature_order = list(feature_order)
            state.clf_categorical_features = list(categorical_features)
            state.clf_label_mode = label_mode
            state.clf_normal_label = normal_label
            state.clf_attack_index = attack_index
            state.clf_class_names = class_names
            state.clf_label_encoder = label_encoder
            state.clf_normal_index = normal_index

        print(f"[RF] Loaded: {os.path.basename(pkl_path)}")
        print(f"[RF] Model: {'ready' if model else 'missing'}")
        print(f"[RF] log_features={log_features}")
        print(f"[RF] feature_order={feature_order}")
        print(f"[RF] label_mode={label_mode}")
        if label_mode == "multiclass":
            print(f"[RF] class_names={class_names}")
            print(f"[RF] normal_index={normal_index}")
        else:
            print(f"[RF] attack_class index = {attack_index}")
        return True

    except Exception as e:
        print(f"[RF] ERROR loading PKL: {e}")
        import traceback
        traceback.print_exc()
        return False

def to_vector(body):
    """Convert JSON body to feature vector."""
    vector = []
    for key in FEATURE_KEYS:
        try:
            value = float(body.get(key, 0.0))
            vector.append(value)
        except (ValueError, TypeError):
            vector.append(0.0)
    
    # Make sure we have exactly 6 features
    if len(vector) != 6:
        # Pad or truncate to 6
        if len(vector) < 6:
            vector = vector + [0.0] * (6 - len(vector))
        else:
            vector = vector[:6]
    
    return vector

def build_generic_frame(body):
    """Build a one-row DataFrame for a replacement pipeline model."""
    row = {}
    for key in state.clf_feature_order:
        if key in state.clf_categorical_features:
            value = body.get(key, "__missing__")
            row[key] = "__missing__" if value in (None, "") else str(value)
        else:
            try:
                row[key] = float(body.get(key, 0.0))
            except (ValueError, TypeError):
                row[key] = 0.0
    return pd.DataFrame([row], columns=state.clf_feature_order)

def score_rf(body):
    """
    RF scoring pipeline.

    Returns:
      (attack_prob, is_attack, features_dict, multiclass_info)

    multiclass_info is None for binary models, or a dict:
      {
        "attack_type": str,         # predicted class name
        "attack_confidence": float, # probability of predicted class
        "class_probabilities": dict, # {class_name: prob, ...}
      }
    """
    if state.clf_model is None:
        return 0.0, False, {}, None

    # ── Multi-class path ──────────────────────────────────────────────────
    if state.clf_label_mode == "multiclass":
        return _score_multiclass(body)

    # ── Replacement bundle path (non-default features or categoricals) ───
    if state.clf_feature_order != FEATURE_KEYS or state.clf_categorical_features:
        X = build_generic_frame(body)
        try:
            proba = state.clf_model.predict_proba(X)[0]
            classes_list = list(getattr(state.clf_model, "classes_", []))
            if state.clf_attack_index < len(proba):
                prob = round(float(proba[state.clf_attack_index]), 4)
            else:
                prob = round(float(np.max(proba)), 4)
        except Exception as e:
            print(f"[RF] Model prediction error: {e}")
            prob = 0.05

        is_attack = prob >= adaptive.RF_ATTACK_MIN
        return prob, is_attack, X.iloc[0].to_dict(), None

    # ── Legacy 6-feature binary path ─────────────────────────────────────
    vector = to_vector(body)
    feat_idx = {f: i for i, f in enumerate(FEATURE_KEYS)}
    bps = float(vector[feat_idx["bytes_per_sec"]])
    pkt = float(vector[feat_idx["pktcount"]])

    if bps > FLOOD_BPS_THRESHOLD or pkt > FLOOD_PKT_THRESHOLD:
        prob = min(0.50 + (bps / 2_000_000) + (pkt / 400_000), 0.99)
        prob = round(prob, 4)
        is_attack = prob >= adaptive.RF_ATTACK_MIN
        return prob, is_attack, dict(zip(FEATURE_KEYS, vector)), None

    X = np.array([vector], dtype=float)
    for fname in state.clf_log_features:
        if fname in feat_idx:
            X[0, feat_idx[fname]] = np.log1p(max(X[0, feat_idx[fname]], 0.0))

    if state.clf_scaler is not None:
        X = state.clf_scaler.transform(X)

    try:
        proba = state.clf_model.predict_proba(X)[0]
        prob = round(float(proba[state.clf_attack_index]), 4)
    except Exception as e:
        print(f"[RF] Model prediction error: {e}")
        prob = 0.05

    is_attack = prob >= adaptive.RF_ATTACK_MIN
    return prob, is_attack, dict(zip(FEATURE_KEYS, vector)), None


def _score_multiclass(body):
    """
    Multi-class scoring pipeline.
    Supports both direct 8 ODL features and derived fields from simulation/legacy payloads.
    """
    feat_order = state.clf_feature_order
    feat_idx = {f: i for i, f in enumerate(feat_order)}

    # Derived values from simulation or legacy payloads
    pktcount  = float(body.get("pktcount", 0))
    bytecount = float(body.get("bytecount", 0))
    dur       = float(body.get("dur", 0))
    flows     = float(body.get("flows", 1))
    tx_bytes  = float(body.get("tx_bytes", 0))
    rx_bytes  = float(body.get("rx_bytes", 0))
    pktrate   = float(body.get("pktrate", 0))

    avg_pkt_size = bytecount / pktcount if pktcount > 0 else float(body.get("avg_pkt_size", 0.0))
    bytes_per_sec = bytecount / dur if dur > 0 else (pktrate * avg_pkt_size if pktrate > 0 else float(body.get("bytes_per_sec", 0.0)))
    packets_per_sec = pktcount / dur if dur > 0 else (pktrate if pktrate > 0 else float(body.get("packets_per_sec", 0.0)))
    active_flow_count = float(body.get("active_flow_count", max(flows, 1)))
    flow_duration = float(body.get("flow_duration", dur if dur > 0 else 15.0))
    avg_bytes_per_flow = bytecount / flows if flows > 0 else float(body.get("avg_bytes_per_flow", 0.0))
    tx_rx_byte_ratio = tx_bytes / (rx_bytes + 1e-9) if (tx_bytes > 0 or rx_bytes > 0) else float(body.get("tx_rx_byte_ratio", 1.0))
    packet_size_variance = float(body.get("packet_size_variance", 0.0))

    derived_map = {
        "avg_pkt_size":          avg_pkt_size,
        "bytes_per_sec":         bytes_per_sec,
        "packets_per_sec":       packets_per_sec,
        "active_flow_count":     active_flow_count,
        "flow_duration":         flow_duration,
        "avg_bytes_per_flow":    avg_bytes_per_flow,
        "tx_rx_byte_ratio":      tx_rx_byte_ratio,
        "packet_size_variance":  packet_size_variance,
    }

    # Build feature vector
    vector = []
    for key in feat_order:
        if key in body:
            try:
                val = float(body[key])
            except (ValueError, TypeError):
                val = derived_map.get(key, 0.0)
        else:
            val = derived_map.get(key, 0.0)
        vector.append(val)

    features_dict = dict(zip(feat_order, vector))
    X = np.array([vector], dtype=float)

    # Log transform
    for fname in state.clf_log_features:
        if fname in feat_idx:
            X[0, feat_idx[fname]] = np.log1p(max(X[0, feat_idx[fname]], 0.0))

    # Scale
    if state.clf_scaler is not None:
        X = state.clf_scaler.transform(X)

    try:
        pred_idx = int(state.clf_model.predict(X)[0])
        proba = state.clf_model.predict_proba(X)[0]
    except Exception as e:
        print(f"[RF] Multi-class prediction error: {e}")
        return 0.05, False, features_dict, None

    # Map prediction back to class name
    class_names = state.clf_class_names
    if state.clf_label_encoder is not None:
        attack_type = state.clf_label_encoder.inverse_transform([pred_idx])[0]
    elif pred_idx < len(class_names):
        attack_type = class_names[pred_idx]
    else:
        attack_type = f"Class_{pred_idx}"

    # Build per-class probability dict
    class_probs = {}
    for i, name in enumerate(class_names):
        if i < len(proba):
            class_probs[name] = round(float(proba[i]), 4)

    # Compute aggregate attack_prob = 1 - P(Normal)
    normal_idx = state.clf_normal_index
    if normal_idx < len(proba):
        attack_prob = round(float(1.0 - proba[normal_idx]), 4)
    else:
        attack_prob = round(float(np.max(proba)), 4)

    # Confidence = probability of the predicted class
    attack_confidence = round(float(proba[pred_idx]), 4) if pred_idx < len(proba) else 0.0

    is_attack = attack_type != "Normal"

    multiclass_info = {
        "attack_type":        attack_type,
        "attack_confidence":  attack_confidence,
        "class_probabilities": class_probs,
    }

    return attack_prob, is_attack, features_dict, multiclass_info


# ── Flask App ───────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)

@app.route("/detect", methods=["POST"])
def detect():
    """RF detection endpoint."""
    body = request.get_json()
    if not body:
        return jsonify({"error": "No JSON body"}), 400

    src = str(body.get("src", "global"))
    attack_prob, is_attack, features, mc_info = score_rf(body)
    rf_zone_val = adaptive.rf_zone(attack_prob)
    final, reason, esc = engine.decide(
        src, None, None, attack_prob, is_attack, adaptive.threshold
    )
    metrics.record(None, final, adaptive.threshold)

    with state.lock:
        state.total_samples += 1

    # Determine attack_type from multi-class info or state
    attack_type = mc_info.get("attack_type") if mc_info else ("ATTACK" if is_attack else "Normal")

    # Store in recent events ring buffer for frontend polling
    event = {
        "state":              final,
        "attack_prob":        attack_prob,
        "rf_zone":            rf_zone_val,
        "is_attack":          is_attack,
        "attack_type":        attack_type,
        "reason":             reason,
        "src_ip":             str(body.get("src", "")),
        "dst_ip":             str(body.get("dst", "")),
        "protocol":           str(body.get("Protocol", "")),
        "switch":             str(body.get("switch", "")),
        "pktcount":           body.get("pktcount", 0),
        "bytecount":          body.get("bytecount", 0),
        "pktrate":            body.get("pktrate", 0),
    }
    if mc_info:
        event["attack_confidence"]   = mc_info.get("attack_confidence")
        event["class_probabilities"] = mc_info.get("class_probabilities")
    recent_events.add(event)

    result = {
        "mode":           "OFFLINE_RF",
        "phase":          "DETECTION",
        "src":            src,
        "state":          final,
        "attack_prob":    attack_prob,
        "rf_zone":        rf_zone_val,
        "is_attack":      is_attack,
        "attack_type":    attack_type,
        "reason":         reason,
        "escalation":     esc,
        "features":       features,
        "total_samples":  state.total_samples,
    }

    # Add multi-class info if available
    if mc_info:
        result["attack_confidence"]   = mc_info["attack_confidence"]
        result["class_probabilities"] = mc_info["class_probabilities"]
        result["label_mode"]          = "multiclass"
    else:
        result["label_mode"]          = "binary"

    return jsonify(result)

@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    result = {
        "mode":            "OFFLINE_RF",
        "phase":           state.phase,
        "model_loaded":    state.clf_model is not None,
        "label_mode":      state.clf_label_mode,
        "total_samples":   state.total_samples,
        "adaptive":        adaptive.stats(),
    }
    if state.clf_label_mode == "multiclass":
        result["class_names"] = state.clf_class_names
        result["n_classes"]   = len(state.clf_class_names)
    return jsonify(result)

@app.route("/metrics", methods=["GET"])
def get_metrics():
    """Get metrics."""
    return jsonify(metrics.stats())

@app.route("/metrics/label", methods=["POST"])
def label_metric():
    """Label a metric (stub)."""
    return jsonify({"status": "ok", "message": "Label recorded"})

@app.route("/metrics/reset", methods=["POST"])
def reset_metrics():
    """Reset metrics."""
    metrics.counts = {"NORMAL": 0, "SUSPICIOUS": 0, "ATTACK": 0}
    return jsonify({"status": "ok", "message": "Metrics reset"})

@app.route("/thresholds", methods=["GET"])
def get_thresholds():
    """Get thresholds."""
    return jsonify(adaptive.stats())

@app.route("/thresholds", methods=["POST"])
def update_thresholds():
    """Update thresholds."""
    data = request.get_json() or {}
    
    if "threshold" in data:
        adaptive.threshold = float(data["threshold"])
    if "rf_benign_max" in data:
        adaptive.RF_BENIGN_MAX = float(data["rf_benign_max"])
    if "rf_attack_min" in data:
        adaptive.RF_ATTACK_MIN = float(data["rf_attack_min"])
    if "rf_high_conf" in data:
        adaptive.RF_HIGH_CONF = float(data["rf_high_conf"])
    
    return jsonify({"adaptive": adaptive.stats(), "message": "Updated."})

@app.route("/recent", methods=["GET"])
def get_recent():
    """Get recent detection events for frontend real-time feed."""
    after_id = request.args.get("since", 0, type=int)
    limit = request.args.get("limit", 100, type=int)
    if after_id > 0:
        events = recent_events.since(after_id, limit)
    else:
        events = recent_events.all(limit)
    return jsonify({"events": events, "count": len(events)})

@app.route("/stats", methods=["GET"])
def get_stats():
    """Get aggregated stats for frontend dashboard."""
    stats = recent_events.stats()
    # Add attack type breakdown if available
    events = recent_events.all(limit=500)
    by_attack_type = {}
    for e in events:
        at = e.get("attack_type")
        if at:
            by_attack_type[at] = by_attack_type.get(at, 0) + 1
    stats["by_attack_type"] = by_attack_type
    stats["label_mode"] = state.clf_label_mode
    if state.clf_label_mode == "multiclass":
        stats["class_names"] = state.clf_class_names
    return jsonify(stats)

@app.route("/recent/clear", methods=["POST"])
def clear_recent():
    """Clear recent events buffer."""
    recent_events.clear()
    return jsonify({"status": "ok", "message": "Recent events cleared"})

# ── Startup ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    load_rf()
    print("=" * 60)
    print("  Offline RF Detector — port 5002")
    print("  Model:      %s" % ("ready" if state.clf_model else "NOT LOADED"))
    print("  Label mode: %s" % state.clf_label_mode)
    if state.clf_label_mode == "multiclass":
        print("  Classes:    %s" % state.clf_class_names)
    print("=" * 60)
    app.run(host="0.0.0.0", port=5002, debug=False)