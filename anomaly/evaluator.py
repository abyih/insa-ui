# MODULE 7 — EVALUATOR
# Active only when CFG.evaluation_mode = True.
# Injects synthetic attacks into live feature vectors and tracks metrics.

import time
import numpy as np
from enum import Enum, auto
from dataclasses import dataclass, field
from features import FeatureVector
from config import CFG


class AttackType(Enum):
    VOLUMETRIC_FLOOD  = auto()   # inflate bytes_per_second
    PACKET_FLOOD      = auto()   # inflate packet_count
    FLOW_EXHAUSTION   = auto()   # inflate active_flow_count
    SLOW_DRIP         = auto()   # small global increase + noise


# Indices into FeatureVector.values matching FLOW_TABLE_FEATURES order:
#   0 avg_packet_size
#   1 bytes_per_second
#   2 packet_count
#   3 active_flow_count
#   4 asymmetry (constant)
_IDX = {
    "avg_packet_size":   0,
    "bytes_per_second":  1,
    "packet_count":      2,
    "active_flow_count": 3,
}


@dataclass
class EvalMetrics:
    tp: int = 0
    tn: int = 0
    fp: int = 0
    fn: int = 0
    detection_polls: list = field(default_factory=list)   # poll index at each ATTACK decision
    injection_polls: list = field(default_factory=list)   # poll index at each injection
    per_switch: dict = field(default_factory=dict)        # switch_id → {tp,tn,fp,fn}

    def record(self, true_attack: bool, predicted_attack: bool,
               switch_id: str = None, poll: int = 0):
        if true_attack and predicted_attack:
            self.tp += 1
            if predicted_attack:
                self.detection_polls.append(poll)
        elif true_attack and not predicted_attack:
            self.fn += 1
        elif not true_attack and predicted_attack:
            self.fp += 1
        else:
            self.tn += 1

        if switch_id:
            sw = self.per_switch.setdefault(switch_id, {"tp":0,"tn":0,"fp":0,"fn":0})
            key = ("tp" if (true_attack and predicted_attack) else
                   "fn" if true_attack else
                   "fp" if predicted_attack else "tn")
            sw[key] += 1

    def compute(self) -> dict:
        total = self.tp + self.tn + self.fp + self.fn
        if total == 0:
            return {"total": 0}

        acc  = (self.tp + self.tn) / total
        prec = self.tp / (self.tp + self.fp) if (self.tp + self.fp) else 0.0
        rec  = self.tp / (self.tp + self.fn) if (self.tp + self.fn) else 0.0
        f1   = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        fpr  = self.fp / (self.fp + self.tn) if (self.fp + self.tn) else 0.0

        latency = None
        if self.injection_polls and self.detection_polls:
            first_injection = self.injection_polls[0]
            first_detection = next(
                (p for p in self.detection_polls if p >= first_injection), None
            )
            if first_detection is not None:
                latency = first_detection - first_injection

        return {
            "total":     total,
            "tp": self.tp, "tn": self.tn,
            "fp": self.fp, "fn": self.fn,
            "accuracy":  round(acc,  4),
            "precision": round(prec, 4),
            "recall":    round(rec,  4),
            "f1":        round(f1,   4),
            "fpr":       round(fpr,  4),
            "detection_latency_polls": latency,
            "per_switch": self.per_switch,
        }


class Evaluator:
    """
    Modifies live feature vectors in-place to simulate attacks.
    Never replaces vectors — always adds on top of real traffic.
    """

    def __init__(self):
        self.metrics    = EvalMetrics()
        self._poll      = 0
        self._rng       = np.random.default_rng(42)
        self._active_attack: AttackType | None = None
        self._attack_remaining: int = 0

    # ── Injection API ─────────────────────────────────────────────────────────

    def start_attack(self, attack_type: AttackType, duration_polls: int = 5):
        self._active_attack   = attack_type
        self._attack_remaining = duration_polls
        print("[EVAL] Starting %s for %d polls" % (attack_type.name, duration_polls))

    def inject(self, fv: FeatureVector) -> FeatureVector:
        """
        Modify fv.values in-place if an attack is active. Marks fv as injected.
        Returns the (possibly modified) FeatureVector.
        """
        self._poll += 1
        is_attack = self._active_attack is not None and self._attack_remaining > 0

        if is_attack:
            self.metrics.injection_polls.append(self._poll)
            v = fv.values.copy()
            v = self._apply(v, self._active_attack)
            self._attack_remaining -= 1
            if self._attack_remaining <= 0:
                self._active_attack = None
            fv = FeatureVector(
                values=v,
                timestamp=fv.timestamp,
                switch_id=fv.switch_id,
                source=fv.source,
                is_injected=True,
                true_label="attack",
            )
        else:
            fv.true_label = "normal"

        return fv

    # ── Metrics API ───────────────────────────────────────────────────────────

    def record(self, fv: FeatureVector, predicted_attack: bool):
        true_attack = fv.true_label == "attack"
        self.metrics.record(true_attack, predicted_attack,
                            switch_id=fv.switch_id, poll=self._poll)

    def get_metrics(self) -> dict:
        return self.metrics.compute()

    def reset(self):
        self.metrics            = EvalMetrics()
        self._poll              = 0
        self._active_attack     = None
        self._attack_remaining  = 0

    # ── Private ───────────────────────────────────────────────────────────────

    def _apply(self, v: np.ndarray, attack: AttackType) -> np.ndarray:
        noise = lambda: float(self._rng.normal(0, 0.05))

        if attack == AttackType.VOLUMETRIC_FLOOD:
            v[_IDX["bytes_per_second"]] *= (10.0 + noise())

        elif attack == AttackType.PACKET_FLOOD:
            v[_IDX["packet_count"]] *= (8.0 + noise())

        elif attack == AttackType.FLOW_EXHAUSTION:
            v[_IDX["active_flow_count"]] *= (5.0 + noise())

        elif attack == AttackType.SLOW_DRIP:
            # Small uniform increase across all numeric features + noise
            for key in ("bytes_per_second", "packet_count", "active_flow_count"):
                v[_IDX[key]] *= (1.3 + noise())

        return v
