# MODULE 1 — CONFIGURATION
# Single immutable configuration object for the SDN anomaly detection system.

from types import SimpleNamespace

CFG = SimpleNamespace(
    # ── Core ──────────────────────────────────────────────────────────────────
    baseline_samples   = 100,
    poll_interval_seconds = 15,

    # ── Attack detection counters ─────────────────────────────────────────────
    fast_attack_polls     = 3,   # consecutive hard anomalies → ATTACK
    slow_attack_polls     = 10,  # consecutive soft anomalies → ATTACK
    attack_recovery_polls = 4,   # consecutive normal polls to leave ATTACK

    # ── Thresholding ──────────────────────────────────────────────────────────
    soft_threshold_percentile = 1.0,   # 1st percentile of baseline scores
    hard_threshold_percentile = 0.1,   # 0.1 percentile of baseline scores
    variance_floor            = 1e-6,

    # ── Baseline validation ───────────────────────────────────────────────────
    baseline_drift_threshold = 1.0,   # normalized L2 drift between first/last 50 samples
    max_baseline_attempts    = 3,

    # ── Model ─────────────────────────────────────────────────────────────────
    contamination            = 0.1,
    contamination_degraded   = 0.15,
    n_estimators             = 100,
    random_state             = 42,

    # ── System ────────────────────────────────────────────────────────────────
    feature_source   = "flow_table",
    evaluation_mode  = False,
)
