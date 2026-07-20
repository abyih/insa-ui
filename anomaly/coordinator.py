# MODULE 6 — COORDINATOR
# Aggregates per-switch states into a network-wide severity level.

from enum import Enum, auto
from state_machine import DetectionState


class NetworkSeverity(Enum):
    NORMAL   = auto()   # 0 switches in ATTACK
    TARGETED = auto()   # exactly 1 switch in ATTACK
    ELEVATED = auto()   # 2 to minority in ATTACK
    CRITICAL = auto()   # majority of switches in ATTACK


class Coordinator:
    """
    Holds one StateMachine per switch and computes network severity.

    Severity rules:
      NORMAL   — 0 attacking switches
      TARGETED — 1 attacking switch
      ELEVATED — 2 to majority (exclusive)
      CRITICAL — majority or more
    """

    def __init__(self):
        # switch_id → StateMachine
        self._machines: dict = {}

    def get_or_create(self, switch_id: str):
        from state_machine import StateMachine
        if switch_id not in self._machines:
            self._machines[switch_id] = StateMachine(switch_id)
        return self._machines[switch_id]

    def update(self, switch_id: str,
               soft_anomaly: bool, hard_anomaly: bool) -> DetectionState:
        """Drive one switch's state machine and return its new state."""
        sm = self.get_or_create(switch_id)
        return sm.transition(soft_anomaly, hard_anomaly)

    def summary(self) -> dict:
        """
        Returns:
          switch_states  — { switch_id: state_name }
          attack_list    — [ switch_ids currently in ATTACK ]
          severity       — NetworkSeverity name
          degraded_flag  — True if any switch is DEGRADED
        """
        states = {sid: sm.state for sid, sm in self._machines.items()}
        attack_list = [
            sid for sid, state in states.items()
            if state == DetectionState.ATTACK
        ]
        degraded_flag = any(
            s == DetectionState.DEGRADED for s in states.values()
        )
        severity = self._compute_severity(len(attack_list), len(self._machines))

        return {
            "switch_states":  {sid: s.name for sid, s in states.items()},
            "attack_list":    attack_list,
            "severity":       severity.name,
            "degraded_flag":  degraded_flag,
        }

    def reset(self, switch_id: str = None):
        if switch_id:
            if switch_id in self._machines:
                self._machines[switch_id].reset()
        else:
            for sm in self._machines.values():
                sm.reset()

    # ── Severity logic ────────────────────────────────────────────────────────
    @staticmethod
    def _compute_severity(n_attack: int, n_total: int) -> NetworkSeverity:
        if n_attack == 0:
            return NetworkSeverity.NORMAL
        if n_attack == 1:
            return NetworkSeverity.TARGETED
        majority = n_total // 2 + 1
        if n_attack >= majority:
            return NetworkSeverity.CRITICAL
        return NetworkSeverity.ELEVATED
