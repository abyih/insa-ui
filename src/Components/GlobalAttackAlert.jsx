import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./ui/card";

const DETECTOR_URL = "http://localhost:5002";
const POLL_INTERVAL = 1500; // 1.5 seconds for near-instant detection

// Helper to find the latest attack event timestamp from the recent_window
const getLatestAttackTs = (data) => {
  if (!data?.recent_window) return 0;
  for (let i = data.recent_window.length - 1; i >= 0; i--) {
    const event = data.recent_window[i];
    if (["ATTACK", "SUSPICIOUS"].includes(event.state)) {
      return event.ts;
    }
  }
  return 0;
};

/**
 * Global attack alert overlay — polls the RF detector every 1.5s.
 * When an attack is detected, immediately shows a full-screen overlay
 * with flashing urgency on ANY page. Cannot be missed.
 */
export default function GlobalAttackAlert() {
  const [threat, setThreat]       = useState("NONE");
  const [stats, setStats]         = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    return !!localStorage.getItem("dismissed_threat_ts");
  });
  const [show, setShow]           = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${DETECTOR_URL}/stats`);
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
      const level = data.threat_level || "NONE";
      setThreat(level);

      const isAttackLevel = ["MEDIUM", "HIGH", "CRITICAL"].includes(level);

      if (isAttackLevel) {
        // Re-show alert if there is a new attack event since the dismissal
        const latestAttackTs = getLatestAttackTs(data);
        const dismissedTs = parseFloat(localStorage.getItem("dismissed_threat_ts") || "0");

        if (latestAttackTs > dismissedTs) {
          localStorage.removeItem("dismissed_threat_ts");
          setDismissed(false);
        }
      } else {
        // Clear dismissal timestamp if threat level drops, to be ready for the next one
        localStorage.removeItem("dismissed_threat_ts");
        setDismissed(false);
      }
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

  // Handle dismiss — record the latest attack timestamp to only show again for newer attacks
  const handleDismiss = useCallback(() => {
    setDismissed(true);
    const latestAttackTs = getLatestAttackTs(stats);
    if (latestAttackTs > 0) {
      localStorage.setItem("dismissed_threat_ts", latestAttackTs.toString());
    } else {
      localStorage.setItem("dismissed_threat_ts", (Date.now() / 1000).toString());
    }
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
    MEDIUM:   { icon: "⚠️",  label: "Suspicious Activity Detected" },
    HIGH:     { icon: "🚨", label: "Attack Detected" },
    CRITICAL: { icon: "🔴", label: "CRITICAL — Active Attack" },
  };
  const c = config[threat] || config.MEDIUM;

  return (
    <>
      {/* Full-screen backdrop */}
      <div
        className={`fixed inset-0 z-[99998] bg-black/60 backdrop-blur-md ${
          isCritical ? "animate-[backdropFlash_2s_ease-in-out_infinite]" : ""
        }`}
        onClick={handleDismiss}
      />

      {/* Center alert card */}
      <Card className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[99999] w-[480px] max-w-[calc(100vw-40px)] animate-[alertSlideIn_0.4s_cubic-bezier(0.22,1,0.36,1)]">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-bold flex items-center justify-center gap-2">
            <span>{c.icon}</span>
            <span>{c.label}</span>
          </CardTitle>
          <CardDescription>
            The anomaly detection system has identified malicious network traffic.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Stats boxes */}
          {stats && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: "Attacks", value: stats.attacks, color: "text-red-500" },
                { label: "Attack Rate", value: `${stats.attack_rate}%`, color: "text-orange-500" },
                { label: "Total Samples", value: stats.total, color: "text-purple-400" },
              ].map((s, i) => (
                <div
                  key={i}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-2 text-center"
                >
                  <p className={`text-2xl font-bold ${s.color}`}>
                    {s.value}
                  </p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mt-1">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Protocol breakdown */}
          {stats?.by_protocol && Object.keys(stats.by_protocol).length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {Object.entries(stats.by_protocol).map(([proto, v]) => {
                const colors = {
                  TCP: "bg-purple-500/10 text-purple-400 border-purple-500/30",
                  UDP: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
                  ICMP: "bg-amber-500/10 text-amber-400 border-amber-500/30",
                };
                const colorClass = colors[proto] || "bg-zinc-500/10 text-zinc-400 border-zinc-500/30";
                return (
                  <span
                    key={proto}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border ${colorClass}`}
                  >
                    {proto}: {v.attacks} atk / {v.total}
                  </span>
                );
              })}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex gap-3">
          <button
            onClick={() => {
              handleDismiss();
              navigate("/anomaly");
            }}
            className="shadcn-btn shadcn-btn-primary flex-1"
          >
            View Live Dashboard →
          </button>
          <button
            onClick={handleDismiss}
            className="shadcn-btn shadcn-btn-secondary"
          >
            Dismiss
          </button>
        </CardFooter>
      </Card>

      {/* Custom Keyframe Animations */}
      <style>{`
        @keyframes alertSlideIn {
          from { opacity: 0; transform: translate(-50%, -45%) scale(0.95); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes backdropFlash {
          0%, 100% { background: rgba(0,0,0,0.6); }
          50% { background: rgba(139,0,0,0.4); }
        }
      `}</style>
    </>
  );
}
