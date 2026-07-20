import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getNodes } from "../../api/api-controller";

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const SERVER_URLS = {
  ONLINE:  "http://localhost:5001",
  OFFLINE: "http://localhost:5002",
};

const POLL_MS_ONLINE  = 15_000;
const POLL_MS_OFFLINE = 2_000;

const THREAT_CONFIG = {
  NONE:     { color: "#22c55e", bg: "rgba(34,197,94,0.08)",  border: "rgba(34,197,94,0.25)",  glow: "0 0 40px rgba(34,197,94,0.15)",  icon: "✓", label: "All Clear" },
  LOW:      { color: "#eab308", bg: "rgba(234,179,8,0.08)",  border: "rgba(234,179,8,0.25)",  glow: "0 0 40px rgba(234,179,8,0.12)",  icon: "◆", label: "Low" },
  MEDIUM:   { color: "#f97316", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.30)", glow: "0 0 50px rgba(249,115,22,0.15)", icon: "⚠", label: "Medium" },
  HIGH:     { color: "#ef4444", bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.35)",  glow: "0 0 60px rgba(239,68,68,0.20)",  icon: "⬥", label: "High" },
  CRITICAL: { color: "#dc2626", bg: "rgba(220,38,38,0.14)",  border: "rgba(220,38,38,0.50)",  glow: "0 0 80px rgba(220,38,38,0.30)",  icon: "✕", label: "Critical" },
};

const STATE_BADGE = {
  ATTACK:     { bg: "#ef4444", text: "#fff" },
  SUSPICIOUS: { bg: "#f59e0b", text: "#000" },
  NORMAL:     { bg: "#22c55e", text: "#000" },
};

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES (all inline — no external CSS dependency)
   ═══════════════════════════════════════════════════════════════════════════ */

const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 40%, #16213e 100%)",
    color: "#e2e8f0",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    padding: "24px 32px 48px",
  },
  container: { maxWidth: 1280, margin: "0 auto" },
  glass: {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
  },
  glassInner: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 12,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   MINI SVG CHART
   ═══════════════════════════════════════════════════════════════════════════ */

function ProbabilityChart({ data }) {
  const W = 720, H = 140, PAD = 28;
  if (!data || data.length === 0) {
    return (
      <div style={{ ...S.glassInner, padding: "32px 0", textAlign: "center" }}>
        <p style={{ color: "#64748b", fontSize: 13 }}>No detection data yet — run an attack simulation</p>
      </div>
    );
  }

  const points = data.slice(-60);
  const n = points.length;
  const xStep = (W - PAD * 2) / Math.max(n - 1, 1);

  const toY = (prob) => H - PAD - (prob * (H - PAD * 2));

  // Zone backgrounds
  const zoneY_attack = toY(0.70);
  const zoneY_suspicious = toY(0.40);

  // Build polyline
  const linePts = points.map((p, i) => `${PAD + i * xStep},${toY(p.prob)}`).join(" ");

  // Gradient area
  const areaPath = `M${PAD},${toY(0)} ` +
    points.map((p, i) => `L${PAD + i * xStep},${toY(p.prob)}`).join(" ") +
    ` L${PAD + (n - 1) * xStep},${toY(0)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 160, display: "block" }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Zone backgrounds */}
      <rect x={PAD} y={PAD} width={W - PAD * 2} height={zoneY_suspicious - PAD}
        fill="rgba(239,68,68,0.06)" rx="4" />
      <rect x={PAD} y={zoneY_suspicious} width={W - PAD * 2} height={zoneY_attack - zoneY_suspicious}
        fill="rgba(245,158,11,0.04)" rx="0" />

      {/* Threshold lines */}
      <line x1={PAD} y1={zoneY_attack} x2={W - PAD} y2={zoneY_attack}
        stroke="rgba(239,68,68,0.3)" strokeWidth="1" strokeDasharray="4,4" />
      <line x1={PAD} y1={zoneY_suspicious} x2={W - PAD} y2={zoneY_suspicious}
        stroke="rgba(245,158,11,0.25)" strokeWidth="1" strokeDasharray="4,4" />

      {/* Labels */}
      <text x={PAD - 2} y={zoneY_attack + 4} fill="#ef4444" fontSize="9" textAnchor="end" opacity="0.7">0.70</text>
      <text x={PAD - 2} y={zoneY_suspicious + 4} fill="#f59e0b" fontSize="9" textAnchor="end" opacity="0.7">0.40</text>
      <text x={PAD - 2} y={toY(1) + 4} fill="#64748b" fontSize="9" textAnchor="end" opacity="0.5">1.0</text>
      <text x={PAD - 2} y={toY(0) + 4} fill="#64748b" fontSize="9" textAnchor="end" opacity="0.5">0.0</text>

      {/* Area fill */}
      <path d={areaPath} fill="url(#areaGrad)" />

      {/* Main line */}
      <polyline points={linePts} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round" />

      {/* Dots for attacks */}
      {points.map((p, i) => p.state === "ATTACK" ? (
        <circle key={i} cx={PAD + i * xStep} cy={toY(p.prob)} r="4"
          fill="#ef4444" stroke="#fff" strokeWidth="1" opacity="0.9" />
      ) : p.state === "SUSPICIOUS" ? (
        <circle key={i} cx={PAD + i * xStep} cy={toY(p.prob)} r="3"
          fill="#f59e0b" opacity="0.7" />
      ) : null)}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STAT CARD
   ═══════════════════════════════════════════════════════════════════════════ */

function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div style={{
      ...S.glassInner, padding: "18px 20px",
      display: "flex", alignItems: "center", gap: 14,
      transition: "transform 0.15s, box-shadow 0.15s",
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.3)` }}
    onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "" }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: accent ? `${accent}18` : "rgba(139,92,246,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 26, fontWeight: 700, margin: "2px 0 0", color: accent || "#e2e8f0", lineHeight: 1 }}>{value}</p>
        {sub && <p style={{ fontSize: 11, color: "#64748b", margin: "3px 0 0" }}>{sub}</p>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROTOCOL BAR
   ═══════════════════════════════════════════════════════════════════════════ */

function ProtocolBar({ byProtocol }) {
  const entries = Object.entries(byProtocol || {});
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v.total, 0);
  const colors = { TCP: "#8b5cf6", UDP: "#06b6d4", ICMP: "#f59e0b" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map(([proto, v]) => {
        const pct = total > 0 ? (v.total / total * 100) : 0;
        const attackPct = v.total > 0 ? (v.attacks / v.total * 100) : 0;
        const c = colors[proto] || "#64748b";
        return (
          <div key={proto} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 40, fontSize: 11, fontWeight: 600, color: c, textAlign: "right" }}>{proto}</span>
            <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
              <div style={{
                height: "100%", borderRadius: 4, width: `${pct}%`,
                background: `linear-gradient(90deg, ${c}88, ${c})`,
                transition: "width 0.5s ease",
              }} />
              {attackPct > 0 && (
                <div style={{
                  position: "absolute", top: 0, left: 0, height: "100%",
                  width: `${attackPct / 100 * pct}%`,
                  background: "rgba(239,68,68,0.6)", borderRadius: 4,
                  transition: "width 0.5s ease",
                }} />
              )}
            </div>
            <span style={{ width: 36, fontSize: 11, color: "#94a3b8", textAlign: "right" }}>{v.total}</span>
            {v.attacks > 0 && (
              <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 600, width: 52, textAlign: "right" }}>
                {v.attacks} atk
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROB BAR (inline within table rows)
   ═══════════════════════════════════════════════════════════════════════════ */

function ProbBar({ value }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const color = pct >= 70 ? "#ef4444" : pct >= 40 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600, minWidth: 38 }}>{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function AnomalyDetector() {
  const [mode, setMode] = useState("OFFLINE");

  // ── Offline RF state (polls /recent from detector) ─────────────────────
  const [rfEvents,   setRfEvents]   = useState([]);
  const [rfStats,    setRfStats]    = useState(null);
  const [rfHealth,   setRfHealth]   = useState(null);
  const [rfRunning,  setRfRunning]  = useState(false);
  const [lastRfId,   setLastRfId]   = useState(0);
  const rfIntervalRef = useRef(null);
  const rfStatsIntervalRef = useRef(null);

  // ── Online IF state (legacy ODL polling) ───────────────────────────────
  const [ifResults,      setIfResults]      = useState({});
  const [ifLastFeatures, setIfLastFeatures] = useState(null);
  const [ifLog,          setIfLog]          = useState([]);
  const [ifConnected,    setIfConnected]    = useState(null);
  const [ifRunning,      setIfRunning]      = useState(false);
  const ifIntervalRef = useRef(null);
  const prevFlowStatsRef = useRef({});

  // ── Check RF health ────────────────────────────────────────────────────
  const checkRfHealth = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URLS.OFFLINE}/health`);
      if (res.ok) setRfHealth(await res.json());
      else setRfHealth(null);
    } catch { setRfHealth(null); }
  }, []);

  // ── Check IF health ────────────────────────────────────────────────────
  const checkIfHealth = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URLS.ONLINE}/health`);
      setIfConnected(res.ok);
    } catch { setIfConnected(false); }
  }, []);

  useEffect(() => { checkRfHealth(); checkIfHealth(); }, [checkRfHealth, checkIfHealth]);

  /* ─────────────────────────────────────────────────────────────────────────
     OFFLINE RF: Poll /recent and /stats
     ───────────────────────────────────────────────────────────────────────── */

  const pollRfRecent = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URLS.OFFLINE}/recent?since=${lastRfId}&limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.events && data.events.length > 0) {
        setRfEvents(prev => {
          const merged = [...prev, ...data.events];
          return merged.slice(-200); // keep last 200
        });
        setLastRfId(data.events[data.events.length - 1].id);
      }
    } catch (e) { console.error("[RF poll]", e); }
  }, [lastRfId]);

  const pollRfStats = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URLS.OFFLINE}/stats`);
      if (res.ok) setRfStats(await res.json());
    } catch {}
  }, []);

  const startRfPolling = useCallback(() => {
    if (rfIntervalRef.current) return;
    setRfRunning(true);
    pollRfRecent();
    pollRfStats();
    rfIntervalRef.current = setInterval(pollRfRecent, POLL_MS_OFFLINE);
    rfStatsIntervalRef.current = setInterval(pollRfStats, 3000);
  }, [pollRfRecent, pollRfStats]);

  const stopRfPolling = useCallback(() => {
    clearInterval(rfIntervalRef.current);
    clearInterval(rfStatsIntervalRef.current);
    rfIntervalRef.current = null;
    rfStatsIntervalRef.current = null;
    setRfRunning(false);
  }, []);

  // Auto-start RF polling in Offline mode
  useEffect(() => {
    if (mode === "OFFLINE") {
      startRfPolling();
      return () => stopRfPolling();
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => () => {
    clearInterval(rfIntervalRef.current);
    clearInterval(rfStatsIntervalRef.current);
    clearInterval(ifIntervalRef.current);
  }, []);

  /* ─────────────────────────────────────────────────────────────────────────
     ONLINE IF: Legacy ODL polling (preserved)
     ───────────────────────────────────────────────────────────────────────── */

  const sendOnline = useCallback(async () => {
    let rawOdl;
    try { rawOdl = await getNodes(); }
    catch (err) { console.error("sendOnline error:", err); setIfConnected(false); return; }

    const nodes = rawOdl?.["opendaylight-inventory:nodes"]?.node ?? [];
    const ids = nodes
      .map(n => n.id)
      .filter(id => id && !id.startsWith("host:") && !id.includes(":LOCAL") && !/openflow:\d+:\d+$/.test(id));
    const targets = ids.length > 0 ? ids : ["global"];
    const ts = new Date().toLocaleTimeString();

    for (const sid of targets) {
      try {
        const res = await fetch(`${SERVER_URLS.ONLINE}/detect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ switch_id: sid, raw_odl: rawOdl }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        setIfResults(prev => ({ ...prev, [sid]: data }));
        setIfLastFeatures(data.features ?? null);
        setIfLog(prev => [{ ...data, _ts: ts, switch_id: sid }, ...prev.slice(0, 99)]);
        setIfConnected(true);
      } catch (err) { console.error("IF poll error:", err); }
    }
  }, []);

  const startIfPolling = useCallback(() => {
    if (ifIntervalRef.current) return;
    setIfRunning(true);
    sendOnline();
    ifIntervalRef.current = setInterval(sendOnline, POLL_MS_ONLINE);
  }, [sendOnline]);

  const stopIfPolling = useCallback(() => {
    clearInterval(ifIntervalRef.current);
    ifIntervalRef.current = null;
    setIfRunning(false);
  }, []);

  /* ─────────────────────────────────────────────────────────────────────────
     MODE SWITCH
     ───────────────────────────────────────────────────────────────────────── */

  const switchMode = (m) => {
    if (m === mode) return;
    if (mode === "OFFLINE") stopRfPolling();
    if (mode === "ONLINE") stopIfPolling();
    setMode(m);
  };

  /* ─────────────────────────────────────────────────────────────────────────
     RESET
     ───────────────────────────────────────────────────────────────────────── */

  const handleReset = async () => {
    if (mode === "OFFLINE") {
      stopRfPolling();
      try { await fetch(`${SERVER_URLS.OFFLINE}/recent/clear`, { method: "POST" }); } catch {}
      try { await fetch(`${SERVER_URLS.OFFLINE}/metrics/reset`, { method: "POST" }); } catch {}
      setRfEvents([]);
      setRfStats(null);
      setLastRfId(0);
      checkRfHealth();
    } else {
      stopIfPolling();
      try { await fetch(`${SERVER_URLS.ONLINE}/reset`, { method: "POST", headers: {"Content-Type":"application/json"}, body: "{}" }); } catch {}
      setIfResults({});
      setIfLastFeatures(null);
      setIfLog([]);
      prevFlowStatsRef.current = {};
      checkIfHealth();
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     DERIVED STATE
     ───────────────────────────────────────────────────────────────────────── */

  const threat = rfStats?.threat_level || "NONE";
  const tc = THREAT_CONFIG[threat] || THREAT_CONFIG.NONE;

  // IF derived
  const allIFResults = Object.values(ifResults);
  const worstIF = allIFResults.length > 0
    ? allIFResults.reduce((w, c) => {
        const ws = w?.state === "ATTACK" ? 3 : w?.state === "SUSPICIOUS" ? 2 : 1;
        const cs = c?.state === "ATTACK" ? 3 : c?.state === "SUSPICIOUS" ? 2 : 1;
        return cs > ws ? c : w;
      })
    : null;
  const isIFAttack = allIFResults.some(r => r.state === "ATTACK");
  const isIFSuspicious = allIFResults.some(r => r.state === "SUSPICIOUS") && !isIFAttack;
  const ifThreat = isIFAttack ? "HIGH" : isIFSuspicious ? "MEDIUM" : "NONE";
  const ifTc = THREAT_CONFIG[ifThreat] || THREAT_CONFIG.NONE;

  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
     ───────────────────────────────────────────────────────────────────────── */

  return (
    <div style={S.page}>
      <div style={S.container}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 18 }}>
              ◈
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>Anomaly Detection</h1>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Real-time SDN threat monitoring</p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Mode toggle */}
            <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
              {[
                { key: "OFFLINE", label: "RF Detector", color: "#8b5cf6" },
                { key: "ONLINE",  label: "Online IF",   color: "#6366f1" },
              ].map(m => (
                <button key={m.key}
                  onClick={() => switchMode(m.key)}
                  style={{
                    padding: "7px 16px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                    background: mode === m.key ? m.color : "rgba(255,255,255,0.04)",
                    color: mode === m.key ? "#fff" : "#94a3b8",
                    transition: "all 0.2s",
                  }}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Status dot */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: mode === "OFFLINE"
                  ? (rfHealth ? "#22c55e" : "#ef4444")
                  : (ifConnected ? "#22c55e" : ifConnected === false ? "#ef4444" : "#f59e0b"),
                boxShadow: mode === "OFFLINE"
                  ? (rfHealth ? "0 0 8px #22c55e" : "0 0 8px #ef4444")
                  : (ifConnected ? "0 0 8px #22c55e" : "0 0 8px #ef4444"),
              }} />
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {mode === "OFFLINE"
                  ? (rfHealth ? "Detector Online" : "Detector Offline")
                  : (ifConnected ? "IF Online" : ifConnected === false ? "IF Offline" : "Checking…")}
              </span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════
           OFFLINE RF MODE
           ════════════════════════════════════════════════════════════════ */}
        {mode === "OFFLINE" && (
          <>
            {/* Threat Banner */}
            <div style={{
              ...S.glass,
              background: tc.bg,
              border: `2px solid ${tc.border}`,
              boxShadow: tc.glow,
              padding: "24px 28px",
              marginBottom: 20,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              transition: "all 0.5s ease",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16,
                  background: `${tc.color}22`,
                  border: `2px solid ${tc.color}55`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 26, color: tc.color, fontWeight: 700,
                  animation: threat === "CRITICAL" ? "pulse 1.5s ease-in-out infinite" : "none",
                }}>
                  {tc.icon}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: tc.color }}>
                    Threat Level: {tc.label}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>
                    {rfStats?.total > 0
                      ? `${rfStats.total} samples analyzed · ${rfStats.attacks} attacks detected · ${rfStats.attack_rate}% attack rate`
                      : "Waiting for detection data — start an attack simulation"}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={rfRunning ? stopRfPolling : startRfPolling}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 600,
                    background: rfRunning ? "#ef4444" : "#8b5cf6",
                    color: "#fff",
                    transition: "all 0.2s",
                  }}>
                  {rfRunning ? "⏸ Pause" : "▶ Monitor"}
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    padding: "8px 18px", borderRadius: 10, cursor: "pointer",
                    fontSize: 13, fontWeight: 600,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "#94a3b8",
                    transition: "all 0.2s",
                  }}>
                  ↺ Reset
                </button>
              </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
              <StatCard label="Total Samples" value={rfStats?.total ?? 0} icon="📊" />
              <StatCard label="Attacks" value={rfStats?.attacks ?? 0} accent="#ef4444" icon="🔴" sub={rfStats?.attacks > 0 ? `${rfStats.attack_rate}% of total` : undefined} />
              <StatCard label="Suspicious" value={rfStats?.suspicious ?? 0} accent="#f59e0b" icon="🟡" />
              <StatCard label="Normal" value={rfStats?.normal ?? 0} accent="#22c55e" icon="🟢" />
            </div>

            {/* Chart + Protocol breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14, marginBottom: 20 }}>
              <div style={{ ...S.glass, padding: "20px 24px" }}>
                <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Attack Probability Timeline</p>
                <ProbabilityChart data={rfStats?.recent_window} />
              </div>
              <div style={{ ...S.glass, padding: "20px 24px" }}>
                <p style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Protocol Breakdown</p>
                <ProtocolBar byProtocol={rfStats?.by_protocol} />
                {(!rfStats?.by_protocol || Object.keys(rfStats.by_protocol).length === 0) && (
                  <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>No data yet</p>
                )}
              </div>
            </div>

            {/* Live Detection Feed */}
            <div style={{ ...S.glass, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: rfRunning ? "#22c55e" : "#64748b",
                    boxShadow: rfRunning ? "0 0 8px #22c55e" : "none",
                    animation: rfRunning ? "pulse 2s ease-in-out infinite" : "none",
                  }} />
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Live Detection Feed</p>
                  <span style={{ fontSize: 11, color: "#64748b", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 6 }}>
                    {rfEvents.length} events
                  </span>
                </div>
                <button onClick={() => { setRfEvents([]); setLastRfId(0); }}
                  style={{ fontSize: 11, color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>
                  Clear
                </button>
              </div>

              <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                      {["#", "State", "Probability", "Zone", "Protocol", "Source", "Destination", "Switch"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rfEvents.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ padding: "40px 14px", textAlign: "center", color: "#475569" }}>
                          No detection events yet. Run: <code style={{ background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: 4 }}>uv run python simulate_attack.py --attack tcp_syn</code>
                        </td>
                      </tr>
                    )}
                    {[...rfEvents].reverse().map((e, i) => {
                      const badge = STATE_BADGE[e.state] || STATE_BADGE.NORMAL;
                      return (
                        <tr key={e.id}
                          style={{
                            borderTop: "1px solid rgba(255,255,255,0.04)",
                            background: e.state === "ATTACK" ? "rgba(239,68,68,0.06)" : e.state === "SUSPICIOUS" ? "rgba(245,158,11,0.04)" : "transparent",
                            transition: "background 0.3s",
                          }}
                          onMouseEnter={ev => ev.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                          onMouseLeave={ev => ev.currentTarget.style.background = e.state === "ATTACK" ? "rgba(239,68,68,0.06)" : e.state === "SUSPICIOUS" ? "rgba(245,158,11,0.04)" : "transparent"}
                        >
                          <td style={{ padding: "10px 14px", color: "#64748b", fontFamily: "monospace" }}>{e.id}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{
                              display: "inline-block", padding: "3px 10px", borderRadius: 6,
                              background: badge.bg, color: badge.text,
                              fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
                            }}>
                              {e.state}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <ProbBar value={e.attack_prob} />
                          </td>
                          <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{e.rf_zone}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                              background: e.protocol === "TCP" ? "rgba(139,92,246,0.15)" : e.protocol === "UDP" ? "rgba(6,182,212,0.15)" : "rgba(245,158,11,0.15)",
                              color: e.protocol === "TCP" ? "#a78bfa" : e.protocol === "UDP" ? "#22d3ee" : "#fbbf24",
                            }}>
                              {e.protocol || "—"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#cbd5e1" }}>{e.src_ip || "—"}</td>
                          <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#cbd5e1" }}>{e.dst_ip || "—"}</td>
                          <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>{e.switch || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
           ONLINE IF MODE
           ════════════════════════════════════════════════════════════════ */}
        {mode === "ONLINE" && (
          <>
            {/* Threat Banner */}
            <div style={{
              ...S.glass,
              background: ifTc.bg,
              border: `2px solid ${ifTc.border}`,
              boxShadow: ifTc.glow,
              padding: "24px 28px",
              marginBottom: 20,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              transition: "all 0.5s ease",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16,
                  background: `${ifTc.color}22`, border: `2px solid ${ifTc.color}55`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 26, color: ifTc.color, fontWeight: 700,
                }}>
                  {ifTc.icon}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: ifTc.color }}>
                    Online IF: {isIFAttack ? "Attack Detected" : isIFSuspicious ? "Suspicious" : "Normal"}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#94a3b8" }}>
                    {worstIF
                      ? `Phase: ${worstIF.phase} · Switch: ${worstIF.switch_id} · Score: ${worstIF.raw_score?.toFixed(4) ?? "—"}`
                      : "Waiting for ODL data — click Start Polling"}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={ifRunning ? stopIfPolling : startIfPolling}
                  disabled={ifConnected === false}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 600,
                    background: ifRunning ? "#ef4444" : "#6366f1",
                    color: "#fff", opacity: ifConnected === false ? 0.4 : 1,
                    transition: "all 0.2s",
                  }}>
                  {ifRunning ? "⏸ Stop" : "▶ Start Polling"}
                </button>
                <button onClick={sendOnline} disabled={ifConnected === false}
                  style={{
                    padding: "8px 18px", borderRadius: 10, cursor: "pointer",
                    fontSize: 13, fontWeight: 600,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "#94a3b8", opacity: ifConnected === false ? 0.4 : 1,
                    transition: "all 0.2s",
                  }}>
                  Send Once
                </button>
                <button onClick={handleReset}
                  style={{
                    padding: "8px 18px", borderRadius: 10, cursor: "pointer",
                    fontSize: 13, fontWeight: 600,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "#94a3b8", transition: "all 0.2s",
                  }}>
                  ↺ Reset
                </button>
              </div>
            </div>

            {/* IF baseline progress */}
            {worstIF?.phase === "BASELINE" && (
              <div style={{ ...S.glass, padding: "16px 24px", marginBottom: 20 }}>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#60a5fa" }}>
                  Collecting baseline… {worstIF.collected ?? 0} / {(worstIF.collected ?? 0) + (worstIF.remaining ?? 100)} samples
                </p>
                <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3, background: "#3b82f6",
                    width: `${Math.min(100, (worstIF.collected ?? 0) / ((worstIF.collected ?? 0) + (worstIF.remaining ?? 100)) * 100)}%`,
                    transition: "width 0.5s",
                  }} />
                </div>
              </div>
            )}

            {/* IF feature cards */}
            {ifLastFeatures && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
                {[
                  { key: "avg_packet_size",   label: "Avg Pkt Size", icon: "📦" },
                  { key: "bytes_per_second",  label: "Bytes / Sec",  icon: "📈" },
                  { key: "packet_count",      label: "Packet Count", icon: "📊" },
                  { key: "active_flow_count", label: "Active Flows", icon: "🔀" },
                  { key: "asymmetry",         label: "Asymmetry",    icon: "⚖️" },
                ].map(f => (
                  <div key={f.key} style={{ ...S.glassInner, padding: "14px 16px" }}>
                    <p style={{ margin: 0, fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>{f.icon} {f.label}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700, color: "#e2e8f0" }}>
                      {ifLastFeatures[f.key] != null ? parseFloat(Number(ifLastFeatures[f.key]).toFixed(2)).toLocaleString() : "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* IF event log */}
            {ifLog.length > 0 && (
              <div style={{ ...S.glass, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>Event Log</p>
                  <button onClick={() => setIfLog([])}
                    style={{ fontSize: 11, color: "#64748b", background: "none", border: "none", cursor: "pointer" }}>Clear</button>
                </div>
                <div style={{ maxHeight: 360, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                        {["Time", "Switch", "State", "Score", "Phase"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ifLog.map((e, i) => {
                        const badge = STATE_BADGE[e.state] || { bg: "#475569", text: "#fff" };
                        return (
                          <tr key={i} style={{
                            borderTop: "1px solid rgba(255,255,255,0.04)",
                            background: e.state === "ATTACK" ? "rgba(239,68,68,0.06)" : "transparent",
                          }}>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontFamily: "monospace" }}>{e._ts}</td>
                            <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "#cbd5e1" }}>{e.switch_id ?? "—"}</td>
                            <td style={{ padding: "10px 14px" }}>
                              <span style={{
                                padding: "3px 10px", borderRadius: 6,
                                background: badge.bg, color: badge.text,
                                fontSize: 11, fontWeight: 700,
                              }}>{e.state || e.phase || "—"}</span>
                            </td>
                            <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "#94a3b8" }}>
                              {e.raw_score?.toFixed(4) ?? "—"}
                            </td>
                            <td style={{ padding: "10px 14px", color: "#64748b" }}>{e.phase ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

      </div>

      {/* Pulse animation for critical threat */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}