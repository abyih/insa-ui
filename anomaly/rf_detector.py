"""
Random Forest detector for offline supervised classification.

Features:
- Uses the 6-feature Kaggle dataset format
- Loads pretrained RF model from pretrained_clf.pkl
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
import threading
import numpy as np
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

PKL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pretrained_clf.pkl")

# ── RF State ────────────────────────────────────────────────────────────────

class DetectorState:
    """Thread-safe RF model state."""
    def __init__(self):
        self.mode              = "OFFLINE_RF"
        self.phase             = "DETECTION"
        self.clf_model         = None
        self.clf_scaler        = None
        self.clf_log_features  = []
        self.clf_attack_index  = 1
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
    if not os.path.exists(PKL_PATH):
        print(f"[RF] ERROR: PKL file not found: {PKL_PATH}")
        return False

    try:
        data = joblib.load(PKL_PATH)  # ← outside lock
        
        # Extract components (matches train_classifier.py format)
        model = data.get("model")
        scaler = data.get("scaler")
        log_features = data.get("log_features", LOG_FEATURES_DEFAULT)
        
        # Determine attack class index
        attack_index = 1  # default
        if model is not None:
            classes_list = list(model.classes_)
            attack_class = data.get("attack_class", 1)  # ← numeric default
            if attack_class in classes_list:
                attack_index = classes_list.index(attack_class)  # ← list.index()
            else:
                # Default to index 1 if attack class not found
                attack_index = 1 if len(classes_list) > 1 else 0
            
            # Validate scaler
            if scaler is not None and not hasattr(scaler, "transform"):
                print("[RF] WARN: scaler missing transform method, using None")
                scaler = None
        
        with state.lock:  # ← assign inside lock only
            state.clf_model = model
            state.clf_scaler = scaler
            state.clf_log_features = log_features
            state.clf_attack_index = attack_index
        
        print(f"[RF] Model: {'ready' if model else 'missing'}")
        print(f"[RF] log_features={log_features}")
        print(f"[RF] attack_class index = {attack_index}")
        return True
        
    except Exception as e:
        print(f"[RF] ERROR loading PKL: {e}")
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

def score_rf(vector):
    """
    RF scoring pipeline.
    
    Steps:
    1. Flood override check (bypass model for obvious floods)
    2. Log1p transform on specified features
    3. RobustScaler transformation
    4. predict_proba → attack probability
    """
    # Ensure vector has 6 features
    if len(vector) != 6:
        vector = vector[:6] if len(vector) > 6 else vector + [0.0] * (6 - len(vector))
    
    # Build feature index map
    feat_idx = {f: i for i, f in enumerate(FEATURE_KEYS)}
    
    # Flood override check
    bps_idx = feat_idx["bytes_per_sec"]
    pkt_idx = feat_idx["pktcount"]
    
    bps = float(vector[bps_idx])
    pkt = float(vector[pkt_idx])
    
    if bps > FLOOD_BPS_THRESHOLD or pkt > FLOOD_PKT_THRESHOLD:
        # Compute flood probability
        prob = min(0.50 + (bps / 2_000_000) + (pkt / 400_000), 0.99)
        prob = round(prob, 4)
        is_attack = prob >= adaptive.RF_ATTACK_MIN
        return prob, is_attack
    
    # Model pipeline
    X = np.array([vector], dtype=float)
    
    # Apply log1p transform
    for fname in state.clf_log_features:
        if fname in feat_idx:
            idx = feat_idx[fname]
            X[0, idx] = np.log1p(max(X[0, idx], 0.0))
    
    # Apply scaler
    if state.clf_scaler is not None:
        X = state.clf_scaler.transform(X)
    
    # Predict probability
    try:
        proba = state.clf_model.predict_proba(X)[0]
        prob = round(float(proba[state.clf_attack_index]), 4)
    except Exception as e:
        # Fallback if model fails
        print(f"[RF] Model prediction error: {e}")
        prob = 0.05
        prob = round(prob, 4)
    
    is_attack = prob >= adaptive.RF_ATTACK_MIN
    return prob, is_attack

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
    vector = to_vector(body)

    attack_prob, is_attack = score_rf(vector)
    rf_zone_val = adaptive.rf_zone(attack_prob)
    final, reason, esc = engine.decide(
        src, None, None, attack_prob, is_attack, adaptive.threshold
    )
    metrics.record(None, final, adaptive.threshold)

    with state.lock:
        state.total_samples += 1

    return jsonify({
        "mode":           "OFFLINE_RF",
        "phase":          "DETECTION",
        "src":            src,
        "state":          final,
        "attack_prob":    attack_prob,
        "rf_zone":        rf_zone_val,
        "is_attack":      is_attack,
        "reason":         reason,
        "escalation":     esc,
        "features":       dict(zip(FEATURE_KEYS, vector)),
        "total_samples":  state.total_samples,
    })

@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "mode":            "OFFLINE_RF",
        "phase":           state.phase,
        "model_loaded":    state.clf_model is not None,
        "total_samples":   state.total_samples,
        "adaptive":        adaptive.stats(),
    })

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

# ── Startup ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    load_rf()
    print("=" * 60)
    print("  Offline RF Detector — port 5002")
    print("  Model: %s" % ("ready" if state.clf_model else "NOT LOADED"))
    print("=" * 60)
    app.run(host="0.0.0.0", port=5002, debug=False)