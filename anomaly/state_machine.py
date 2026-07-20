# MODULE 5 — STATE MACHINE
# Per-switch detection state machine.

from enum import Enum, auto
from config import CFG


class DetectionState(Enum):
    BASELINE         = auto()   # collecting baseline samples
    TRAINED          = auto()   # model trained, not yet receiving live samples
    NORMAL           = auto()   # scoring, no anomaly
    SUSPICIOUS       = auto()   # soft anomaly detected
    FAST_SUSPICIOUS  = auto()   # hard anomaly detected (on fast ATTACK path)
    ATTACK           = auto()   # threshold crossed
    DEGRADED         = auto()   # baseline degraded, still detecting


class StateMachine:
    """
    Per-switch state machine.

    ATTACK entry:
      Fast path: CFG.fast_attack_polls  consecutive hard anomalies
      Slow path: CFG.slow_attack_polls  consecutive soft anomalies

    ATTACK recovery:
      CFG.attack_recovery_polls consecutive normal polls required.
      Any anomaly during recovery resets the counter.

    Transitions:
      BASELINE/TRAINED → NORMAL/DEGRADED   (after first live score)
      NORMAL          → SUSPICIOUS         (soft anomaly)
      NORMAL          → FAST_SUSPICIOUS    (hard anomaly)
      SUSPICIOUS      → NORMAL             (normal poll)
      SUSPICIOUS      → ATTACK             (slow counter reached)
      FAST_SUSPICIOUS → NORMAL             (normal poll)
      FAST_SUSPICIOUS → ATTACK             (fast counter reached)
      ATTACK          → NORMAL             (recovery counter reached)
    """

    def __init__(self, switch_id: str = "global"):
        self.switch_id        = switch_id
        self.state            = DetectionState.BASELINE
        self._slow_counter    = 0   # soft anomaly streak
        self._fast_counter    = 0   # hard anomaly streak
        self._recovery_counter = 0  # consecutive normals in ATTACK

    def transition(self, soft_anomaly: bool, hard_anomaly: bool) -> DetectionState:
        """
        Feed one poll result. Returns the new state.
        """
        s = self.state

        # ── In ATTACK: count recovery polls ──────────────────────────────────
        if s == DetectionState.ATTACK:
            if soft_anomaly or hard_anomaly:
                self._recovery_counter = 0
            else:
                self._recovery_counter += 1
                if self._recovery_counter >= CFG.attack_recovery_polls:
                    self._reset_counters()
                    self.state = DetectionState.NORMAL
            return self.state

        # ── Pre-live states transition to active on first score ───────────────
        if s in (DetectionState.BASELINE, DetectionState.TRAINED):
            self.state = DetectionState.NORMAL
            s = DetectionState.NORMAL

        # ── Normal scoring logic ──────────────────────────────────────────────
        if not soft_anomaly and not hard_anomaly:
            self._reset_counters()
            self.state = DetectionState.NORMAL
            return self.state

        if hard_anomaly:
            self._fast_counter += 1
            self._slow_counter  = 0
            if self._fast_counter >= CFG.fast_attack_polls:
                self._reset_counters()
                self.state = DetectionState.ATTACK
            else:
                self.state = DetectionState.FAST_SUSPICIOUS
            return self.state

        # soft anomaly only
        self._slow_counter += 1
        self._fast_counter  = 0
        if self._slow_counter >= CFG.slow_attack_polls:
            self._reset_counters()
            self.state = DetectionState.ATTACK
        else:
            self.state = DetectionState.SUSPICIOUS
        return self.state

    def force_baseline(self):
        self.state = DetectionState.BASELINE
        self._reset_counters()

    def force_degraded(self):
        self.state = DetectionState.DEGRADED
        self._reset_counters()

    def reset(self):
        self.state = DetectionState.BASELINE
        self._reset_counters()

    def _reset_counters(self):
        self._slow_counter     = 0
        self._fast_counter     = 0
        self._recovery_counter = 0
