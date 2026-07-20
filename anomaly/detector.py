# MODULE 8 — DETECTOR
# Main pipeline. One Detector instance per switch (or "global").
# Thread-safe: one lock per switch_id, polling serialized per switch.
#
# Run:
#   pip install flask scikit-learn numpy flask-cors
#   python detector.py
#
# Endpoints:
#   POST /detect        { "switch_id": "openflow:1", "raw_odl": { ...ODL node response... } }
#   GET  /health
#   GET  /status
#   POST /reset

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import threading
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

from config import CFG
from features import FeatureVector, FLOW_TABLE_FEATURES, FlowTableExtractor, PortConnectorExtractor
from baseline import Baseline, BaselineState
from model import AnomalyModel
from state_machine import StateMachine, DetectionState
from coordinator import Coordinator
from evaluator import Evaluator, AttackType
from mitigation import block_switch, rollback_session, get_session_rules

app  = Flask(__name__)
CORS(app)


# ── Per-switch detector ───────────────────────────────────────────────────────

class SwitchDetector:
    """
    Full pipeline for a single switch_id (or "global").

    Poll flow:
      1. Receive raw ODL inventory response, extract features for this switch only
      2. Inject attack if evaluation_mode
      3. If baseline not ready → collect
      4. If baseline just completed → validate → train model
      5. If model trained → score → state machine → coordinator update
      6. Log eval metrics if evaluation_mode
      7. Return decision dict
    """

    def __init__(self, switch_id: str):
        self.switch_id       = switch_id
        self._lock           = threading.Lock()
        self._baseline       = Baseline()
        self._model          = AnomalyModel()
        self._sm             = StateMachine(switch_id)
        self._poll           = 0
        self._is_first       = True   # skip first poll (delta stabilization)
        self.extractor       = FlowTableExtractor(poll_interval=CFG.poll_interval_seconds)
        self.rf_extractor    = PortConnectorExtractor(poll_interval=CFG.poll_interval_seconds)

    def process(self, raw_odl: dict,
                evaluator: Evaluator | None,
                coordinator: Coordinator) -> dict:
        with self._lock:
            self._poll += 1

            # Extract features for this switch only — extractor owns snapshot state
            fv = self.extractor.extract(raw_odl, self.switch_id)
            if fv is None:
                return self._resp_no_fv("SKIP", self.switch_id,
                                        reason="Node not found or empty ODL response — snapshot preserved.")

            # Skip first poll — delta not yet meaningful
            if self._is_first:
                self._is_first = False
                return self._resp_with_rf("SKIP", fv, raw_odl,
                                  reason="First poll skipped (delta stabilization).")

            # Evaluation injection
            if evaluator is not None:
                fv = evaluator.inject(fv)

            # ── Baseline phase ────────────────────────────────────────────────
            if not self._model.is_trained:
                full = self._baseline.collect(fv)

                if not full:
                    return self._resp_with_rf("BASELINE", fv, raw_odl,
                                      collected=self._baseline.count,
                                      remaining=CFG.baseline_samples - self._baseline.count)

                # Baseline full → validate
                bl_state = self._baseline.validate()

                if bl_state == BaselineState.COLLECTING:
                    # CONTAMINATED — reset and keep collecting
                    return self._resp_with_rf("BASELINE", fv, raw_odl,
                                      collected=0,
                                      remaining=CFG.baseline_samples,
                                      reason="Contaminated baseline — restarting.")

                # CLEAN or DEGRADED → train
                matrix, bl_state = self._baseline.commit()
                self._model.train(matrix, bl_state)
                self._sm.state = (
                    DetectionState.DEGRADED
                    if bl_state == BaselineState.DEGRADED
                    else DetectionState.TRAINED
                )
                coordinator.get_or_create(self.switch_id)
                return self._resp_with_rf("TRAINED", fv, raw_odl,
                                  baseline_state=bl_state.name,
                                  reason="Model trained. Detection active.")

            # ── Detection phase ───────────────────────────────────────────────
            scoring = self._model.score(fv.values)
            new_state = coordinator.update(
                self.switch_id,
                soft_anomaly=scoring["soft_anomaly"],
                hard_anomaly=scoring["hard_anomaly"],
            )

            is_attack = new_state == DetectionState.ATTACK
            if evaluator is not None:
                evaluator.record(fv, predicted_attack=is_attack)

            # Build result using helper method
            result = self._resp_with_rf("DETECTION", fv, raw_odl,
                state=new_state.name,
                raw_score=scoring["raw_score"],
                soft_anomaly=scoring["soft_anomaly"],
                hard_anomaly=scoring["hard_anomaly"],
                percentile=scoring["percentile"],
                soft_threshold=scoring["soft_threshold"],
                hard_threshold=scoring["hard_threshold"],
                baseline_state=scoring["baseline_state"],
                is_injected=fv.is_injected,
                true_label=fv.true_label,
                poll=self._poll,
            )
                
            return result

    def reset(self):
        with self._lock:
            self._baseline  = Baseline()
            self._model     = AnomalyModel()
            self._sm        = StateMachine(self.switch_id)
            self._poll      = 0
            self._is_first  = True
            self.extractor.reset()   # clear stored snapshot

    def _resp_with_rf(self, phase: str, fv: FeatureVector, raw_odl: dict, **kwargs) -> dict:
        """Create response with RF features extracted automatically."""
        result = {
            "phase":     phase,
            "switch_id": fv.switch_id,
            "poll":      kwargs.pop("poll", None),
            "features":  dict(zip(FLOW_TABLE_FEATURES, fv.values.tolist())),
            **kwargs,
        }
        
        # Extract RF features if available
        try:
            rf_fv = self.rf_extractor.extract(raw_odl, self.switch_id)
            if rf_fv is not None:
                # Map to RF feature names (5 features, no tx_rx_byte_asymmetry)
                rf_feature_names = ["avg_pkt_size", "total_duration_sec", "bytes_per_sec", "pktcount", "tx_bytes"]
                result["rf_features"] = dict(zip(rf_feature_names, rf_fv.values.tolist()))
        except Exception as e:
            print(f"[WARN] Failed to extract RF features for {phase}: {e}")
            # Don't fail if RF extraction fails
        
        return result
    
    @staticmethod
    def _resp_no_fv(phase: str, switch_id: str, **kwargs) -> dict:
        return {
            "phase":     phase,
            "switch_id": switch_id,
            "poll":      kwargs.pop("poll", None),
            **kwargs,
        }


# ── Global registry ───────────────────────────────────────────────────────────

_registry_lock = threading.Lock()
_detectors:    dict        = {}   # switch_id → SwitchDetector
_coordinator   = Coordinator()
_evaluator     = Evaluator() if CFG.evaluation_mode else None


def _get_detector(switch_id: str) -> SwitchDetector:
    with _registry_lock:
        if switch_id not in _detectors:
            _detectors[switch_id] = SwitchDetector(switch_id)
        return _detectors[switch_id]


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/detect", methods=["POST"])
def detect():
    body = request.get_json()
    if not body:
        return jsonify({"error": "No JSON body"}), 400

    switch_id = str(body.get("switch_id", "global"))
    raw_odl   = body.get("raw_odl")
    if not raw_odl:
        return jsonify({"error": "Missing 'raw_odl' in request body"}), 400

    det     = _get_detector(switch_id)
    result  = det.process(raw_odl, _evaluator, _coordinator)
    summary = _coordinator.summary()
    result["network_severity"] = summary["severity"]
    return jsonify(result)


@app.route("/health", methods=["GET"])
def health():
    summary = _coordinator.summary()
    return jsonify({
        "status":          "ok",
        "evaluation_mode": CFG.evaluation_mode,
        "switches":        list(_detectors.keys()),
        "coordinator":     summary,
        "features":        FLOW_TABLE_FEATURES,
        "config": {
            "baseline_samples":      CFG.baseline_samples,
            "fast_attack_polls":     CFG.fast_attack_polls,
            "slow_attack_polls":     CFG.slow_attack_polls,
            "attack_recovery_polls": CFG.attack_recovery_polls,
            "soft_threshold_pct":    CFG.soft_threshold_percentile,
            "hard_threshold_pct":    CFG.hard_threshold_percentile,
        },
    })


@app.route("/status", methods=["GET"])
def status():
    out = {}
    for sid, det in _detectors.items():
        out[sid] = {
            "state":        det._sm.state.name,
            "model_trained": det._model.is_trained,
            "baseline_count": det._baseline.count,
            "polls":         det._poll,
        }
    return jsonify({"switches": out, "coordinator": _coordinator.summary()})


@app.route("/reset", methods=["POST"])
def reset():
    body      = request.get_json() or {}
    switch_id = body.get("switch_id")
    if switch_id:
        det = _detectors.get(switch_id)
        if det:
            det.reset()
            _coordinator.reset(switch_id)
        return jsonify({"reset": switch_id})
    else:
        for det in _detectors.values():
            det.reset()
        _coordinator.reset()
        if _evaluator:
            _evaluator.reset()
        return jsonify({"reset": "all"})


@app.route("/eval/start", methods=["POST"])
def eval_start():
    if not CFG.evaluation_mode:
        return jsonify({"error": "evaluation_mode is False in config.py"}), 400
    body     = request.get_json() or {}
    atype    = body.get("attack_type", "VOLUMETRIC_FLOOD").upper()
    duration = int(body.get("duration_polls", 5))
    try:
        _evaluator.start_attack(AttackType[atype], duration)
    except KeyError:
        return jsonify({"error": "Unknown attack_type. Choose: %s"
                        % [a.name for a in AttackType]}), 400
    return jsonify({"started": atype, "duration_polls": duration})


@app.route("/eval/metrics", methods=["GET"])
def eval_metrics():
    if not CFG.evaluation_mode or _evaluator is None:
        return jsonify({"error": "evaluation_mode is False"}), 400
    return jsonify(_evaluator.get_metrics())


@app.route("/eval/reset", methods=["POST"])
def eval_reset():
    if _evaluator:
        _evaluator.reset()
    return jsonify({"status": "eval metrics reset"})


# ── Mitigation routes ─────────────────────────────────────────────────────────

@app.route("/mitigation/block", methods=["POST"])
def mitigation_block():
    body = request.get_json()
    if not body:
        return jsonify({"error": "No JSON body"}), 400
    
    switch_id = body.get("switch_id")
    if not switch_id:
        return jsonify({"error": "Missing 'switch_id' in request body"}), 400
    
    result = block_switch(switch_id)
    if result.get("success"):
        return jsonify(result), 200
    else:
        return jsonify(result), 500


@app.route("/mitigation/rollback", methods=["POST"])
def mitigation_rollback():
    result = rollback_session()
    return jsonify(result)


@app.route("/mitigation/status", methods=["GET"])
def mitigation_status():
    rules = get_session_rules()
    return jsonify({
        "active_blocks": rules,
        "count": len(rules)
    })


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  SDN Anomaly Detection — Modular Pipeline")
    print("=" * 60)
    print("  Features        : %s" % FLOW_TABLE_FEATURES)
    print("  Baseline samples: %d"  % CFG.baseline_samples)
    print("  Fast attack path: %d hard anomalies" % CFG.fast_attack_polls)
    print("  Slow attack path: %d soft anomalies" % CFG.slow_attack_polls)
    print("  Recovery polls  : %d" % CFG.attack_recovery_polls)
    print("  Evaluation mode : %s" % CFG.evaluation_mode)
    print("=" * 60)
    print("  POST /detect        — submit feature dict")
    print("  GET  /health        — config + coordinator summary")
    print("  GET  /status        — per-switch state + model info")
    print("  POST /reset         — reset one switch or all")
    print("  POST /eval/start    — inject synthetic attack")
    print("  GET  /eval/metrics  — TP/TN/FP/FN + F1 + latency")
    print("  POST /eval/reset    — clear eval metrics")
    print("  POST /mitigation/block — install switch-wide drop rule")
    print("  POST /mitigation/rollback — remove all installed blocks")
    print("  GET  /mitigation/status — list active blocks")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5001, debug=False)
