import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const DETECTOR_URL = "http://localhost:5002";
const POLL_INTERVAL = 1500; // 1.5 seconds for near-instant detection

/**
 * Global attack alert overlay — polls the RF detector every 1.5s.
 * When an attack is detected, immediately shows a full-screen overlay
 * with flashing urgency on ANY page. Cannot be missed.
 */
export default function GlobalAttackAlert() {
  const [threat, setThreat]       = useState("NONE");
  const [stats, setStats]         = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow]           = useState(false);
  const prevThreat = useRef("NONE");
  const audioRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Track attack count at time of dismissal
  const dismissedAtCount = useRef(-1);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${DETECTOR_URL}/stats`);
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
      const level = data.threat_level || "NONE";
      setThreat(level);

      const isAttackLevel = ["MEDIUM", "HIGH", "CRITICAL"].includes(level);

      // Re-show alert when NEW attacks arrive after dismissal
      if (isAttackLevel && data.attacks > dismissedAtCount.current) {
        setDismissed(false);
      }

      prevThreat.current = level;
    } catch {
      /* detector not running */
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [poll]);

  // Don't show overlay on the anomaly page itself (it has its own display)
  const isAnomalyPage = location.pathname === "/anomaly";

  // Handle dismiss — record current attack count so we only re-show for NEW attacks
  const handleDismiss = useCallback(() => {
    setDismissed(true);
    dismissedAtCount.current = stats?.attacks ?? 0;
  }, [stats]);

  // Determine visibility
  useEffect(() => {
    const shouldShow =
      !dismissed &&
      !isAnomalyPage &&
      ["MEDIUM", "HIGH", "CRITICAL"].includes(threat);
    setShow(shouldShow);
  }, [threat, dismissed, isAnomalyPage]);

  if (!show) return null;

  const isCritical = threat === "CRITICAL";
  const isHigh = threat === "HIGH";

  const config = {
    MEDIUM:   { gradient: "linear-gradient(135deg, #f97316, #ea580c)", icon: "⚠️",  label: "Suspicious Activity Detected", borderColor: "#fb923c", pulseColor: "rgba(249,115,22,0.15)" },
    HIGH:     { gradient: "linear-gradient(135deg, #ef4444, #dc2626)", icon: "🚨", label: "Attack Detected",             borderColor: "#f87171", pulseColor: "rgba(239,68,68,0.2)" },
    CRITICAL: { gradient: "linear-gradient(135deg, #dc2626, #7f1d1d)", icon: "🔴", label: "CRITICAL — Active Attack",     borderColor: "#fca5a5", pulseColor: "rgba(220,38,38,0.25)" },
  };
  const c = config[threat] || config.MEDIUM;

  return (
    <>
      {/* Full-screen backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99998,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          animation: isCritical ? "backdropFlash 2s ease-in-out infinite" : "none",
        }}
        onClick={handleDismiss}
      />

      {/* Center alert card */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 99999,
          width: 480,
          maxWidth: "calc(100vw - 40px)",
          animation: "alertSlideIn 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          style={{
            background: "#1a1a2e",
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 60px ${c.pulseColor}`,
            border: `2px solid ${c.borderColor}44`,
          }}
        >
          {/* Top accent bar */}
          <div style={{
            height: 4,
            background: c.gradient,
            animation: isCritical ? "accentPulse 1.5s ease-in-out infinite" : "none",
          }} />

          {/* Content */}
          <div style={{ padding: "32px 32px 28px" }}>
            {/* Icon + title */}
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                background: `${c.borderColor}18`,
                border: `3px solid ${c.borderColor}55`,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 36,
                animation: isCritical ? "iconPulse 1s ease-in-out infinite" : isHigh ? "iconPulse 2s ease-in-out infinite" : "none",
              }}>
                {c.icon}
              </div>
              <h2 style={{
                margin: 0, fontSize: 22, fontWeight: 700,
                background: c.gradient,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                fontFamily: "'Inter', system-ui, sans-serif",
              }}>
                {c.label}
              </h2>
              <p style={{
                margin: "8px 0 0", fontSize: 13, color: "#94a3b8",
                fontFamily: "'Inter', system-ui, sans-serif",
              }}>
                The anomaly detection system has identified malicious network traffic
              </p>
            </div>

            {/* Stats boxes */}
            {stats && (
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10,
                marginBottom: 24,
              }}>
                {[
                  { label: "Attacks", value: stats.attacks, color: "#ef4444" },
                  { label: "Attack Rate", value: `${stats.attack_rate}%`, color: "#f97316" },
                  { label: "Total Samples", value: stats.total, color: "#8b5cf6" },
                ].map((s, i) => (
                  <div key={i} style={{
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 12,
                    padding: "14px 12px",
                    textAlign: "center",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <p style={{
                      margin: 0, fontSize: 24, fontWeight: 700, color: s.color,
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}>
                      {s.value}
                    </p>
                    <p style={{
                      margin: "4px 0 0", fontSize: 10, color: "#64748b",
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}>
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Protocol breakdown (compact) */}
            {stats?.by_protocol && Object.keys(stats.by_protocol).length > 0 && (
              <div style={{
                display: "flex", gap: 8, justifyContent: "center", marginBottom: 24,
              }}>
                {Object.entries(stats.by_protocol).map(([proto, v]) => {
                  const colors = { TCP: "#a78bfa", UDP: "#22d3ee", ICMP: "#fbbf24" };
                  return (
                    <span key={proto} style={{
                      padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                      background: `${colors[proto] || "#64748b"}18`,
                      color: colors[proto] || "#94a3b8",
                      border: `1px solid ${colors[proto] || "#64748b"}33`,
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}>
                      {proto}: {v.attacks} atk / {v.total}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { handleDismiss(); navigate("/anomaly"); }}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                  background: c.gradient,
                  color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  boxShadow: `0 4px 20px ${c.pulseColor}`,
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 8px 30px ${c.pulseColor}`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = `0 4px 20px ${c.pulseColor}`; }}
              >
                View Live Dashboard →
              </button>
              <button
                onClick={handleDismiss}
                style={{
                  padding: "13px 24px", borderRadius: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#94a3b8", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes alertSlideIn {
          from { opacity: 0; transform: translate(-50%, -45%) scale(0.95); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes iconPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
        @keyframes backdropFlash {
          0%, 100% { background: rgba(0,0,0,0.6); }
          50% { background: rgba(139,0,0,0.45); }
        }
        @keyframes accentPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
