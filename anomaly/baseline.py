# MODULE 3 — BASELINE
# Per-switch baseline collection and validation.

import numpy as np
from enum import Enum, auto
from config import CFG
from features import FeatureVector


class BaselineState(Enum):
    COLLECTING  = auto()
    CLEAN       = auto()
    CONTAMINATED = auto()
    DEGRADED    = auto()


class Baseline:
    """
    Collects baseline samples and validates drift between first/last halves.

    States:
      COLLECTING  — accumulating samples (up to baseline_samples)
      CLEAN       — drift ≤ threshold, ready for model training
      CONTAMINATED — drift > threshold, will retry up to max_baseline_attempts
      DEGRADED    — exceeded max attempts, training with contamination=0.15
    """

    def __init__(self):
        self._samples:  list        = []
        self._state:    BaselineState = BaselineState.COLLECTING
        self._attempts: int         = 0

    # ── Public API ────────────────────────────────────────────────────────────

    @property
    def state(self) -> BaselineState:
        return self._state

    @property
    def count(self) -> int:
        return len(self._samples)

    @property
    def is_ready(self) -> bool:
        return self._state in (BaselineState.CLEAN, BaselineState.DEGRADED)

    def collect(self, fv: FeatureVector) -> bool:
        """
        Add one feature vector. Returns True when baseline is full.
        Ignores samples once the baseline is full (caller should stop sending).
        """
        if self._state != BaselineState.COLLECTING:
            return self.is_ready

        self._samples.append(fv.values.copy())

        if len(self._samples) >= CFG.baseline_samples:
            return True   # signal: ready to validate

        return False

    def validate(self) -> BaselineState:
        """
        Split baseline into first/last 50, compute L2 drift between means.
        Features are normalized to zero-mean unit-variance before drift
        computation so that high-magnitude features (bytes_per_second) do
        not dominate the distance calculation.
        Transitions state accordingly.
        """
        if len(self._samples) < CFG.baseline_samples:
            return self._state   # not enough data yet

        matrix = np.array(self._samples)   # shape (100, 5)

        # Normalize per-feature to zero mean, unit variance — drift check only
        mean = matrix.mean(axis=0)
        std  = matrix.std(axis=0)
        std[std < 1e-6] = 1.0              # keep constant features (asymmetry) safe
        normalized = (matrix - mean) / std

        half   = CFG.baseline_samples // 2
        first  = normalized[:half]
        last   = normalized[half:]

        drift = float(np.linalg.norm(first.mean(axis=0) - last.mean(axis=0)))

        self._attempts += 1
        print("[BASELINE] attempt=%d drift=%.4f threshold=%.4f"
              % (self._attempts, drift, CFG.baseline_drift_threshold))

        if drift <= CFG.baseline_drift_threshold:
            self._state = BaselineState.CLEAN
        elif self._attempts >= CFG.max_baseline_attempts:
            self._state = BaselineState.DEGRADED
            print("[BASELINE] DEGRADED after %d attempts — using contamination=%.2f"
                  % (self._attempts, CFG.contamination_degraded))
        else:
            self._state = BaselineState.CONTAMINATED
            print("[BASELINE] CONTAMINATED — clearing and restarting (attempt %d/%d)"
                  % (self._attempts, CFG.max_baseline_attempts))
            self._samples.clear()
            self._state = BaselineState.COLLECTING   # restart

        return self._state

    def commit(self) -> tuple:
        """
        Returns (matrix, baseline_state).
        matrix shape: (baseline_samples, n_features)
        """
        return np.array(self._samples), self._state

    def reset(self):
        self._samples  = []
        self._state    = BaselineState.COLLECTING
        self._attempts = 0
