# MODULE 4 — MODEL
# Isolation Forest scoring only. Training happens once per baseline commit.

import numpy as np
from sklearn.ensemble import IsolationForest
from baseline import BaselineState
from config import CFG


class AnomalyModel:
    """
    Wraps Isolation Forest. Computes thresholds from baseline scores.

    Thresholds (percentile-based, lower = more anomalous in IF score space):
      soft_threshold — CFG.soft_threshold_percentile  (1st percentile)
      hard_threshold — CFG.hard_threshold_percentile  (0.1 percentile)

    Scoring output:
      raw_score     — IF decision_function value (higher = more normal)
      soft_anomaly  — score < soft_threshold
      hard_anomaly  — score < hard_threshold
      percentile    — rank of this score in baseline score distribution
      baseline_state
    """

    def __init__(self):
        self._model:           IsolationForest | None = None
        self._baseline_scores: np.ndarray | None      = None
        self._soft_threshold:  float                  = -0.5
        self._hard_threshold:  float                  = -0.8
        self._baseline_state:  BaselineState          = BaselineState.COLLECTING

    # ── Public API ────────────────────────────────────────────────────────────

    @property
    def is_trained(self) -> bool:
        return self._model is not None

    @property
    def soft_threshold(self) -> float:
        return self._soft_threshold

    @property
    def hard_threshold(self) -> float:
        return self._hard_threshold

    def train(self, matrix: np.ndarray, baseline_state: BaselineState):
        """
        Fit IF on baseline matrix and compute percentile thresholds.
        Uses contamination=0.15 if DEGRADED, else 0.1.
        """
        contamination = (
            CFG.contamination_degraded
            if baseline_state == BaselineState.DEGRADED
            else CFG.contamination
        )
        self._baseline_state = baseline_state

        self._model = IsolationForest(
            n_estimators=CFG.n_estimators,
            contamination=contamination,
            random_state=CFG.random_state,
        )
        self._model.fit(matrix)

        self._baseline_scores = self._model.decision_function(matrix)

        self._soft_threshold = float(
            np.percentile(self._baseline_scores, CFG.soft_threshold_percentile)
        )
        self._hard_threshold = float(
            np.percentile(self._baseline_scores, CFG.hard_threshold_percentile)
        )

        print("[MODEL] trained n=%d contamination=%.2f soft_th=%.4f hard_th=%.4f"
              % (len(matrix), contamination,
                 self._soft_threshold, self._hard_threshold))

    def score(self, vector: np.ndarray) -> dict:
        """
        Score one sample. Returns dict with raw_score, flags, percentile, state.
        Raises RuntimeError if model not trained.
        """
        if self._model is None:
            raise RuntimeError("Model not trained yet.")

        raw = float(self._model.decision_function(vector.reshape(1, -1))[0])
        raw = round(raw, 6)

        soft_anomaly = raw < self._soft_threshold
        hard_anomaly = raw < self._hard_threshold

        # Percentile rank within baseline scores (0 = most anomalous)
        if self._baseline_scores is not None:
            pct = float(np.mean(self._baseline_scores <= raw)) * 100
        else:
            pct = 50.0

        return {
            "raw_score":      raw,
            "soft_anomaly":   soft_anomaly,
            "hard_anomaly":   hard_anomaly,
            "percentile":     round(pct, 2),
            "soft_threshold": round(self._soft_threshold, 4),
            "hard_threshold": round(self._hard_threshold, 4),
            "baseline_state": self._baseline_state.name,
        }
