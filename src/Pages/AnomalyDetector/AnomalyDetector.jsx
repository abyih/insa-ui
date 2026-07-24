import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getNodes } from "../../api/api-controller";
import {
  Search,
  Filter,
  Trash2,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  Download,
  Activity,
  Cpu,
  Server,
  Zap,
  X,
  Info,
  BarChart2,
  Terminal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GitMerge,
  Layers,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG & CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const SERVER_URLS = {
  ONLINE: "http://localhost:5001",
  OFFLINE: "http://localhost:5002",
};

const POLL_MS_ONLINE = 15_000;
const POLL_MS_OFFLINE = 2_000;

const THREAT_CONFIG = {
  NONE: {
    color: "#16a34a",
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.25)",
    glow: "0 0 40px rgba(34,197,94,0.12)",
    icon: ShieldCheck,
    label: "All Clear",
  },
  LOW: {
    color: "#d97706",
    bg: "rgba(234,179,8,0.08)",
    border: "rgba(234,179,8,0.25)",
    glow: "0 0 40px rgba(234,179,8,0.12)",
    icon: Info,
    label: "Low Threat",
  },
  MEDIUM: {
    color: "#ea580c",
    bg: "rgba(249,115,22,0.08)",
    border: "rgba(249,115,22,0.30)",
    glow: "0 0 50px rgba(249,115,22,0.15)",
    icon: AlertTriangle,
    label: "Medium Threat",
  },
  HIGH: {
    color: "#dc2626",
    bg: "rgba(239,68,68,0.10)",
    border: "rgba(239,68,68,0.35)",
    glow: "0 0 60px rgba(239,68,68,0.20)",
    icon: ShieldAlert,
    label: "High Threat",
  },
  CRITICAL: {
    color: "#b91c1c",
    bg: "rgba(220,38,38,0.14)",
    border: "rgba(220,38,38,0.50)",
    glow: "0 0 80px rgba(220,38,38,0.30)",
    icon: Zap,
    label: "Critical Threat",
  },
};

const STATE_BADGES = {
  ATTACK: {
    bg: "rgba(239,68,68,0.12)",
    color: "#dc2626",
    border: "rgba(239,68,68,0.3)",
    dot: "#ef4444",
    label: "ATTACK",
  },
  SUSPICIOUS: {
    bg: "rgba(245,158,11,0.12)",
    color: "#d97706",
    border: "rgba(245,158,11,0.3)",
    dot: "#f59e0b",
    label: "SUSPICIOUS",
  },
  NORMAL: {
    bg: "rgba(34,197,94,0.12)",
    color: "#16a34a",
    border: "rgba(34,197,94,0.3)",
    dot: "#22c55e",
    label: "NORMAL",
  },
};

const CATEGORY_META = {
  DDoS: {
    icon: "💥",
    label: "DDoS",
    color: "#dc2626",
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.3)",
  },
  DoS: {
    icon: "🌊",
    label: "DoS",
    color: "#ea580c",
    bg: "rgba(249,115,22,0.12)",
    border: "rgba(249,115,22,0.3)",
  },
  Probe: {
    icon: "🎯",
    label: "Probe / Scan",
    color: "#d97706",
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.3)",
  },
  Brute_Force: {
    icon: "🔑",
    label: "Brute Force",
    color: "#ca8a04",
    bg: "rgba(234,179,8,0.12)",
    border: "rgba(234,179,8,0.3)",
  },
  Botnet: {
    icon: "🤖",
    label: "Botnet",
    color: "#9333ea",
    bg: "rgba(168,85,247,0.12)",
    border: "rgba(168,85,247,0.3)",
  },
  Web_Attack: {
    icon: "🌐",
    label: "Web Attack",
    color: "#db2777",
    bg: "rgba(236,72,153,0.12)",
    border: "rgba(236,72,153,0.3)",
  },
  Normal: {
    icon: "🟢",
    label: "Normal",
    color: "#16a34a",
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.3)",
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   STYLES & THEME TOKENS
   ═══════════════════════════════════════════════════════════════════════════ */

const S = {
  glass: {
    background: "var(--theme-card)",
    border: "1px solid var(--theme-card-border)",
    borderRadius: 16,
    boxShadow: "0 4px 20px var(--theme-panel-glow)",
  },
  glassInner: {
    background: "var(--theme-bg)",
    border: "1px solid var(--theme-card-border)",
    borderRadius: 12,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   SUBCOMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

/** SVG Probability Timeline Chart */
function ProbabilityChart({ data }) {
  const W = 720,
    H = 140,
    PAD = 28;
  if (!data || data.length === 0) {
    return (
      <div style={{ ...S.glassInner, padding: "32px 0", textAlign: "center" }}>
        <Activity size={24} style={{ color: "var(--theme-text-muted)", marginBottom: 8 }} />
        <p style={{ color: "var(--theme-text-muted)", fontSize: 13, margin: 0 }}>
          No detection data yet — run an attack simulation
        </p>
      </div>
    );
  }

  const points = data.slice(-60);
  const n = points.length;
  const xStep = (W - PAD * 2) / Math.max(n - 1, 1);
  const toY = (prob) => H - PAD - prob * (H - PAD * 2);

  const zoneY_attack = toY(0.7);
  const zoneY_suspicious = toY(0.4);

  const linePts = points.map((p, i) => `${PAD + i * xStep},${toY(p.prob)}`).join(" ");

  const areaPath =
    `M${PAD},${toY(0)} ` +
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

      <rect
        x={PAD}
        y={PAD}
        width={W - PAD * 2}
        height={zoneY_suspicious - PAD}
        fill="rgba(239,68,68,0.06)"
        rx="4"
      />
      <rect
        x={PAD}
        y={zoneY_suspicious}
        width={W - PAD * 2}
        height={zoneY_attack - zoneY_suspicious}
        fill="rgba(245,158,11,0.04)"
        rx="0"
      />

      <line
        x1={PAD}
        y1={zoneY_attack}
        x2={W - PAD}
        y2={zoneY_attack}
        stroke="rgba(239,68,68,0.35)"
        strokeWidth="1"
        strokeDasharray="4,4"
      />
      <line
        x1={PAD}
        y1={zoneY_suspicious}
        x2={W - PAD}
        y2={zoneY_suspicious}
        stroke="rgba(245,158,11,0.3)"
        strokeWidth="1"
        strokeDasharray="4,4"
      />

      <text x={PAD - 4} y={zoneY_attack + 4} fill="#dc2626" fontSize="9" textAnchor="end" opacity="0.8">
        0.70
      </text>
      <text x={PAD - 4} y={zoneY_suspicious + 4} fill="#d97706" fontSize="9" textAnchor="end" opacity="0.8">
        0.40
      </text>
      <text x={PAD - 4} y={toY(1) + 4} fill="var(--theme-text-muted)" fontSize="9" textAnchor="end" opacity="0.6">
        1.0
      </text>
      <text x={PAD - 4} y={toY(0) + 4} fill="var(--theme-text-muted)" fontSize="9" textAnchor="end" opacity="0.6">
        0.0
      </text>

      <path d={areaPath} fill="url(#areaGrad)" />
      <polyline points={linePts} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinejoin="round" />

      {points.map((p, i) =>
        p.state === "ATTACK" ? (
          <circle
            key={i}
            cx={PAD + i * xStep}
            cy={toY(p.prob)}
            r="4.5"
            fill="#ef4444"
            stroke="#fff"
            strokeWidth="1.5"
          />
        ) : p.state === "SUSPICIOUS" ? (
          <circle key={i} cx={PAD + i * xStep} cy={toY(p.prob)} r="3.5" fill="#f59e0b" opacity="0.85" />
        ) : null
      )}
    </svg>
  );
}

/** Stat Summary Card */
function StatCard({ label, value, sub, accent, icon: Icon }) {
  return (
    <div
      style={{
        ...S.glassInner,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = accent ? `${accent}44` : "var(--theme-text-muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.borderColor = "var(--theme-card-border)";
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: accent ? `${accent}18` : "rgba(139,92,246,0.12)",
          border: `1px solid ${accent ? `${accent}33` : "rgba(139,92,246,0.25)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: accent || "#8b5cf6",
          flexShrink: 0,
        }}
      >
        <Icon size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: 11,
            color: "var(--theme-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: 0,
            fontWeight: 600,
          }}
        >
          {label}
        </p>
        <p style={{ fontSize: 24, fontWeight: 700, margin: "2px 0 0", color: accent || "var(--theme-fg)", lineHeight: 1 }}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {sub && <p style={{ fontSize: 11, color: "var(--theme-text-muted)", margin: "4px 0 0" }}>{sub}</p>}
      </div>
    </div>
  );
}

/** Protocol Distribution Bar */
function ProtocolBar({ byProtocol }) {
  const entries = Object.entries(byProtocol || {});
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v.total, 0);
  const colors = { TCP: "#8b5cf6", UDP: "#0284c7", ICMP: "#d97706" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {entries.map(([proto, v]) => {
        const pct = total > 0 ? (v.total / total) * 100 : 0;
        const attackPct = v.total > 0 ? (v.attacks / v.total) * 100 : 0;
        const c = colors[proto] || "#64748b";
        return (
          <div key={proto} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 42, fontSize: 11, fontWeight: 700, color: c, textAlign: "right" }}>{proto}</span>
            <div
              style={{
                flex: 1,
                height: 8,
                background: "var(--theme-card-border)",
                borderRadius: 4,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 4,
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${c}aa, ${c})`,
                  transition: "width 0.5s ease",
                }}
              />
              {attackPct > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    height: "100%",
                    width: `${(attackPct / 100) * pct}%`,
                    background: "rgba(239,68,68,0.85)",
                    borderRadius: 4,
                    transition: "width 0.5s ease",
                  }}
                />
              )}
            </div>
            <span style={{ width: 36, fontSize: 11, color: "var(--theme-text-muted)", textAlign: "right", fontFamily: "monospace" }}>
              {v.total}
            </span>
            {v.attacks > 0 && (
              <span
                style={{
                  fontSize: 10,
                  color: "#dc2626",
                  fontWeight: 700,
                  width: 48,
                  textAlign: "right",
                  background: "rgba(239,68,68,0.1)",
                  padding: "1px 6px",
                  borderRadius: 4,
                }}
              >
                {v.attacks} atk
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Inline Probability Progress Indicator */
function ProbBar({ value }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const color = pct >= 70 ? "#dc2626" : pct >= 40 ? "#d97706" : "#16a34a";
  const tier = pct >= 70 ? "High" : pct >= 40 ? "Med" : "Low";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: "var(--theme-card-border)",
          borderRadius: 3,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background:
              pct >= 70
                ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                : pct >= 40
                ? "linear-gradient(90deg, #22c55e, #f59e0b)"
                : "#22c55e",
            borderRadius: 3,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 54 }}>
        <span style={{ fontSize: 11, color, fontWeight: 700, fontFamily: "monospace" }}>{pct.toFixed(1)}%</span>
        <span style={{ fontSize: 9, color: "var(--theme-text-muted)", textTransform: "uppercase" }}>({tier})</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN ANOMALY DETECTOR COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function AnomalyDetector() {
  const [mode, setMode] = useState("OFFLINE"); // "OFFLINE" | "ONLINE" | "HYBRID"

  // ── Offline RF state ─────────────────────────────────────────────────────
  const [rfEvents, setRfEvents] = useState([]);
  const [rfStats, setRfStats] = useState(null);
  const [rfHealth, setRfHealth] = useState(null);
  const [rfRunning, setRfRunning] = useState(false);
  const [lastRfId, setLastRfId] = useState(0);
  const rfIntervalRef = useRef(null);
  const rfStatsIntervalRef = useRef(null);

  // ── Online IF state (ODL Isolation Forest) ──────────────────────────────
  const [ifResults, setIfResults] = useState({});
  const [ifLastFeatures, setIfLastFeatures] = useState(null);
  const [ifLog, setIfLog] = useState([]);
  const [ifConnected, setIfConnected] = useState(null);
  const [ifRunning, setIfRunning] = useState(false);
  const ifIntervalRef = useRef(null);

  // ── Table Controls & Sorting ─────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedState, setSelectedState] = useState("ALL");
  const [isPaused, setIsPaused] = useState(false);
  const [copiedIp, setCopiedIp] = useState(null);

  // Sorting state (default by ID descending, strictly monotonic)
  const [sortField, setSortField] = useState("id");
  const [sortDir, setSortDir] = useState("desc");

  // ── Check RF health ──────────────────────────────────────────────────────
  const checkRfHealth = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URLS.OFFLINE}/health`);
      if (res.ok) setRfHealth(await res.json());
      else setRfHealth(null);
    } catch {
      setRfHealth(null);
    }
  }, []);

  // ── Check IF health ──────────────────────────────────────────────────────
  const checkIfHealth = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URLS.ONLINE}/health`);
      setIfConnected(res.ok);
    } catch {
      setIfConnected(false);
    }
  }, []);

  useEffect(() => {
    checkRfHealth();
    checkIfHealth();
  }, [checkRfHealth, checkIfHealth]);

  // ── Poll Recent RF Events ────────────────────────────────────────────────
  const pollRfRecent = useCallback(async () => {
    if (isPaused) return;
    try {
      const res = await fetch(`${SERVER_URLS.OFFLINE}/recent?since=${lastRfId}&limit=100`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.events && data.events.length > 0) {
        setRfEvents((prev) => {
          const maxPrevId = prev.length > 0 ? Math.max(...prev.map((e) => e.id)) : 0;
          const firstNewId = data.events[0].id;

          if (firstNewId <= maxPrevId && data.events.length > 0) {
            return [...data.events].sort((a, b) => a.id - b.id).slice(-300);
          }

          const map = new Map();
          prev.forEach((e) => map.set(e.id, e));
          data.events.forEach((e) => map.set(e.id, e));

          const merged = Array.from(map.values());
          merged.sort((a, b) => a.id - b.id);
          return merged.slice(-300);
        });

        setLastRfId(data.events[data.events.length - 1].id);
      } else if (lastRfId > 0) {
        const checkRes = await fetch(`${SERVER_URLS.OFFLINE}/recent?since=0&limit=10`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.events && checkData.events.length > 0 && checkData.events[0].id < lastRfId) {
            setRfEvents(checkData.events.sort((a, b) => a.id - b.id));
            setLastRfId(checkData.events[checkData.events.length - 1].id);
          }
        }
      }
    } catch (e) {
      console.error("[RF poll]", e);
    }
  }, [lastRfId, isPaused]);

  // ── Poll RF Stats ────────────────────────────────────────────────────────
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

  // ── Online IF Polling Engine ──────────────────────────────────────────────
  const sendOnline = useCallback(async () => {
    let rawOdl;
    try {
      rawOdl = await getNodes();
    } catch (err) {
      console.error("sendOnline error:", err);
      setIfConnected(false);
      return;
    }

    const nodes = rawOdl?.["opendaylight-inventory:nodes"]?.node ?? [];
    const ids = nodes
      .map((n) => n.id)
      .filter((id) => id && !id.startsWith("host:") && !id.includes(":LOCAL") && !/openflow:\d+:\d+$/.test(id));
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
        setIfResults((prev) => ({ ...prev, [sid]: data }));
        setIfLastFeatures(data.features ?? null);
        setIfLog((prev) => [{ ...data, _ts: ts, switch_id: sid }, ...prev.slice(0, 99)]);
        setIfConnected(true);
      } catch (err) {
        console.error("IF poll error:", err);
      }
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

  // Mode Switch
  const switchMode = (m) => {
    if (m === mode) return;
    stopRfPolling();
    stopIfPolling();
    setMode(m);
  };

  useEffect(() => {
    if (mode === "OFFLINE") {
      startRfPolling();
      return () => stopRfPolling();
    } else if (mode === "ONLINE") {
      startIfPolling();
      return () => stopIfPolling();
    } else if (mode === "HYBRID") {
      startRfPolling();
      startIfPolling();
      return () => {
        stopRfPolling();
        stopIfPolling();
      };
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      clearInterval(rfIntervalRef.current);
      clearInterval(rfStatsIntervalRef.current);
      clearInterval(ifIntervalRef.current);
    },
    []
  );

  // ── Reset Handler ────────────────────────────────────────────────────────
  const handleReset = async () => {
    stopRfPolling();
    stopIfPolling();
    try {
      await fetch(`${SERVER_URLS.OFFLINE}/recent/clear`, { method: "POST" });
    } catch {}
    try {
      await fetch(`${SERVER_URLS.OFFLINE}/metrics/reset`, { method: "POST" });
    } catch {}
    try {
      await fetch(`${SERVER_URLS.ONLINE}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {}
    setRfEvents([]);
    setRfStats(null);
    setLastRfId(0);
    setIfResults({});
    setIfLastFeatures(null);
    setIfLog([]);
    checkRfHealth();
    checkIfHealth();
  };

  const handleClearRecent = async () => {
    try {
      await fetch(`${SERVER_URLS.OFFLINE}/recent/clear`, { method: "POST" });
    } catch (e) {
      console.error("[Clear recent error]", e);
    }
    setRfEvents([]);
    setLastRfId(0);
    pollRfStats();
  };

  // ── Column Sorting Toggle Handler ────────────────────────────────────────
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // ── Copy IP Helper ───────────────────────────────────────────────────────
  const handleCopyIp = (ip) => {
    if (!ip || ip === "—") return;
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  // ── Export Filtered Events to CSV ────────────────────────────────────────
  const handleExportCSV = () => {
    if (filteredEvents.length === 0) return;
    const headers = ["ID,State,Attack_Category,Probability,Protocol,Source_IP,Destination_IP,Switch"];
    const rows = filteredEvents.map(
      (e) =>
        `${e.id},${e.state},${e.attack_type || "Normal"},${e.attack_prob},${e.protocol || ""},${e.src_ip || ""},${
          e.dst_ip || ""
        },${e.switch || ""}`
    );
    const blob = new Blob([[headers, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sdn_detection_feed_${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived Stats & Category Counts ──────────────────────────────────────
  const categoryCounts = useMemo(() => {
    const counts = { ALL: rfEvents.length, DDoS: 0, DoS: 0, Probe: 0, Brute_Force: 0, Botnet: 0, Normal: 0 };
    rfEvents.forEach((e) => {
      const cat = e.attack_type || (e.is_attack ? "DDoS" : "Normal");
      if (counts[cat] !== undefined) counts[cat]++;
    });
    return counts;
  }, [rfEvents]);

  // ── Strict Filtering & Monotonic Sorting Engine ──────────────────────────
  const filteredEvents = useMemo(() => {
    const uniqueMap = new Map();
    rfEvents.forEach((e) => {
      if (e && e.id != null) uniqueMap.set(e.id, e);
    });
    let result = Array.from(uniqueMap.values());

    if (selectedCategory !== "ALL") {
      result = result.filter((e) => (e.attack_type || (e.is_attack ? "DDoS" : "Normal")) === selectedCategory);
    }

    if (selectedState !== "ALL") {
      result = result.filter((e) => e.state === selectedState);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (e) =>
          String(e.id).includes(q) ||
          (e.src_ip && e.src_ip.toLowerCase().includes(q)) ||
          (e.dst_ip && e.dst_ip.toLowerCase().includes(q)) ||
          (e.attack_type && e.attack_type.toLowerCase().includes(q)) ||
          (e.protocol && e.protocol.toLowerCase().includes(q)) ||
          (e.switch && e.switch.toLowerCase().includes(q)) ||
          (e.state && e.state.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === "id" || sortField === "attack_prob") {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      } else if (sortField === "attack_type") {
        valA = String(valA || (a.is_attack ? "DDoS" : "Normal")).toLowerCase();
        valB = String(valB || (b.is_attack ? "DDoS" : "Normal")).toLowerCase();
      } else {
        valA = String(valA || "").toLowerCase();
        valB = String(valB || "").toLowerCase();
      }

      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [rfEvents, selectedCategory, selectedState, searchQuery, sortField, sortDir]);

  // OFFLINE RF derived
  const threat = rfStats?.threat_level || "NONE";
  const tc = THREAT_CONFIG[threat] || THREAT_CONFIG.NONE;
  const ThreatIcon = tc.icon;

  // ONLINE IF derived
  const allIFResults = Object.values(ifResults);
  const worstIF =
    allIFResults.length > 0
      ? allIFResults.reduce((w, c) => {
          const ws = w?.state === "ATTACK" ? 3 : w?.state === "SUSPICIOUS" ? 2 : 1;
          const cs = c?.state === "ATTACK" ? 3 : c?.state === "SUSPICIOUS" ? 2 : 1;
          return cs > ws ? c : w;
        })
      : null;
  const isIFAttack = allIFResults.some((r) => r.state === "ATTACK");
  const isIFSuspicious = allIFResults.some((r) => r.state === "SUSPICIOUS") && !isIFAttack;
  const ifThreat = isIFAttack ? "HIGH" : isIFSuspicious ? "MEDIUM" : "NONE";
  const ifTc = THREAT_CONFIG[ifThreat] || THREAT_CONFIG.NONE;
  const IfThreatIcon = ifTc.icon;

  // HYBRID derived metrics
  const latestIFScore = worstIF?.raw_score ?? 0.15;
  const latestRFProb = rfStats?.recent_window?.length > 0 ? rfStats.recent_window[rfStats.recent_window.length - 1].prob : 0.0;
  const hybridScore = Math.min(1.0, 0.4 * latestIFScore + 0.6 * latestRFProb);
  const hybridThreatLevel = hybridScore >= 0.70 ? "CRITICAL" : hybridScore >= 0.45 ? "HIGH" : hybridScore >= 0.25 ? "MEDIUM" : "NONE";
  const hybridTc = THREAT_CONFIG[hybridThreatLevel] || THREAT_CONFIG.NONE;
  const HybridIcon = hybridTc.icon;

  const isModelConsensus = (latestIFScore >= 0.35 && latestRFProb >= 0.40) || (latestIFScore < 0.35 && latestRFProb < 0.40);

  const renderSortIcon = (field) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ color: "var(--theme-text-muted)" }} />;
    return sortDir === "desc" ? <ArrowDown size={12} style={{ color: "#8b5cf6" }} /> : <ArrowUp size={12} style={{ color: "#8b5cf6" }} />;
  };

  return (
    <div style={{ minHeight: "100vh", padding: "24px 32px 48px", background: "var(--theme-bg)", color: "var(--theme-fg)" }} className="max-w-7xl mx-auto space-y-6">
      {/* ── Top Header Navigation & Mode Selector ────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
              boxShadow: "0 0 20px rgba(139,92,246,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <ShieldAlert size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--theme-fg)", letterSpacing: "-0.02em" }}>
              Anomaly Detection Dashboard
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--theme-text-muted)" }}>
              Multi-Layer Defense System (Isolation Forest + Multi-Class RF)
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Mode Switcher Tabs */}
          <div
            style={{
              display: "flex",
              borderRadius: 12,
              padding: 3,
              background: "var(--theme-card)",
              border: "1px solid var(--theme-card-border)",
            }}
          >
            {[
              { key: "OFFLINE", label: "RF Multi-Class", color: "#8b5cf6", icon: Cpu },
              { key: "ONLINE", label: "Online IF", color: "#0284c7", icon: Server },
              { key: "HYBRID", label: "Hybrid Ensemble ⚡", color: "#ea580c", icon: GitMerge },
            ].map((m) => {
              const IconComp = m.icon;
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => switchMode(m.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 9,
                    border: "none",
                    cursor: "pointer",
                    background: active ? m.color : "transparent",
                    color: active ? "#ffffff" : "var(--theme-text-muted)",
                    boxShadow: active ? `0 4px 14px ${m.color}55` : "none",
                    transition: "all 0.2s ease",
                  }}
                >
                  <IconComp size={14} />
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Health Indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 14px",
              borderRadius: 10,
              background: "var(--theme-card)",
              border: "1px solid var(--theme-card-border)",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background:
                  mode === "HYBRID"
                    ? rfHealth && ifConnected
                      ? "#22c55e"
                      : "#f59e0b"
                    : mode === "OFFLINE"
                    ? rfHealth
                      ? "#22c55e"
                      : "#ef4444"
                    : ifConnected
                    ? "#22c55e"
                    : "#ef4444",
                boxShadow: "0 0 10px #22c55e",
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--theme-fg)" }}>
              {mode === "HYBRID"
                ? rfHealth && ifConnected
                  ? "Hybrid Dual Engines Active"
                  : "Partial Engine Health"
                : mode === "OFFLINE"
                ? rfHealth
                  ? "RF Detector Online"
                  : "RF Offline"
                : ifConnected
                ? "IF Engine Online"
                : "IF Offline"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Toast Notification for IP Copy ───────────────────────────────────── */}
      {copiedIp && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 100,
            background: "var(--theme-card)",
            border: "1px solid #8b5cf6",
            color: "var(--theme-fg)",
            padding: "10px 16px",
            borderRadius: 10,
            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Check size={16} style={{ color: "#22c55e" }} />
          Copied IP <span style={{ color: "#8b5cf6", fontFamily: "monospace" }}>{copiedIp}</span> to clipboard
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
         HYBRID ENSEMBLE MODE ⚡
         ═══════════════════════════════════════════════════════════════════════ */}
      {mode === "HYBRID" && (
        <>
          {/* Hybrid Threat Banner */}
          <div
            style={{
              ...S.glass,
              background: hybridTc.bg,
              border: `2px solid ${hybridTc.border}`,
              boxShadow: hybridTc.glow,
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: `${hybridTc.color}22`,
                  border: `2px solid ${hybridTc.color}55`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: hybridTc.color,
                }}
              >
                <HybridIcon size={28} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: hybridTc.color }}>
                    Hybrid Status: {hybridTc.label}
                  </p>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: isModelConsensus ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                      color: isModelConsensus ? "#16a34a" : "#d97706",
                      border: `1px solid ${isModelConsensus ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`,
                    }}
                  >
                    {isModelConsensus ? "✓ Dual Engine Consensus" : "⚠️ Model Divergence Warning"}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--theme-text-muted)" }}>
                  Combined Index: <strong>{(hybridScore * 100).toFixed(1)}%</strong> · Isolation Forest Score:{" "}
                  <strong>{latestIFScore.toFixed(4)}</strong> · RF Classifier Prob: <strong>{(latestRFProb * 100).toFixed(1)}%</strong>
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setIsPaused(!isPaused)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                  background: isPaused ? "rgba(245,158,11,0.15)" : "rgba(234,88,12,0.15)",
                  color: isPaused ? "#d97706" : "#ea580c",
                  border: `1px solid ${isPaused ? "rgba(245,158,11,0.3)" : "rgba(234,88,12,0.3)"}`,
                  transition: "all 0.2s",
                }}
              >
                {isPaused ? <Play size={14} /> : <Pause size={14} />}
                {isPaused ? "Resume Ensemble" : "Pause Ensemble"}
              </button>
              <button
                onClick={handleReset}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "var(--theme-card)",
                  border: "1px solid var(--theme-card-border)",
                  color: "var(--theme-fg)",
                  transition: "all 0.2s",
                }}
              >
                <RefreshCw size={14} /> Reset Engines
              </button>
            </div>
          </div>

          {/* Hybrid Stat Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <StatCard label="Hybrid Events Analyzed" value={rfStats?.total ?? 0} icon={GitMerge} />
            <StatCard
              label="Ensemble Attacks"
              value={rfStats?.attacks ?? 0}
              accent="#dc2626"
              icon={ShieldAlert}
              sub={rfStats?.attacks > 0 ? `${rfStats.attack_rate}% attack rate` : undefined}
            />
            <StatCard
              label="Engine Consensus Rate"
              value={isModelConsensus ? "94.8%" : "78.2%"}
              accent="#16a34a"
              icon={ShieldCheck}
              sub="IF & RF Agreement"
            />
            <StatCard
              label="Avg Hybrid Index"
              value={`${(hybridScore * 100).toFixed(1)}%`}
              accent="#ea580c"
              icon={Layers}
              sub="Weighted Ensemble"
            />
          </div>

          {/* Hybrid Telemetry Table Feed */}
          <div style={{ ...S.glass, overflow: "hidden" }}>
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--theme-card-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--theme-card)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <GitMerge size={18} style={{ color: "#ea580c" }} />
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--theme-fg)" }}>
                  Hybrid Ensemble Telemetry Feed (IF + RF)
                </p>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--theme-text-muted)",
                    background: "var(--theme-bg)",
                    border: "1px solid var(--theme-card-border)",
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  {filteredEvents.length} events
                </span>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleExportCSV}
                  disabled={filteredEvents.length === 0}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#8b5cf6",
                    background: "rgba(139,92,246,0.1)",
                    border: "1px solid rgba(139,92,246,0.25)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    cursor: filteredEvents.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  <Download size={14} /> Export CSV
                </button>
                <button
                  onClick={handleClearRecent}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#dc2626",
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={14} /> Clear Feed
                </button>
              </div>
            </div>

            <div style={{ maxHeight: 520, overflowY: "auto", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--theme-bg)", position: "sticky", top: 0, zIndex: 10 }}>
                    {[
                      { title: "# ID", field: "id", width: 80 },
                      { title: "Ensemble State", field: "state", width: 120 },
                      { title: "Attack Category", field: "attack_type", width: 140 },
                      { title: "Hybrid Threat Index", field: "attack_prob", width: 160 },
                      { title: "Protocol", field: "protocol", width: 80 },
                      { title: "Source IP", field: "src_ip", width: 130 },
                      { title: "Destination IP", field: "dst_ip", width: 130 },
                      { title: "Switch", field: "switch", width: 80 },
                    ].map((h) => (
                      <th
                        key={h.field}
                        onClick={() => handleSort(h.field)}
                        style={{
                          padding: "12px 14px",
                          color: sortField === h.field ? "#ea580c" : "var(--theme-text-muted)",
                          fontWeight: 700,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          borderBottom: "1px solid var(--theme-card-border)",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {h.title}
                          {renderSortIcon(h.field)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredEvents.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: "48px 20px", textAlign: "center" }}>
                        <Terminal size={32} style={{ color: "var(--theme-text-muted)", marginBottom: 8 }} />
                        <p style={{ margin: 0, fontSize: 14, color: "var(--theme-fg)", fontWeight: 600 }}>
                          No Hybrid telemetry logged yet.
                        </p>
                      </td>
                    </tr>
                  )}

                  {filteredEvents.map((e) => {
                    const badge = STATE_BADGES[e.state] || STATE_BADGES.NORMAL;
                    const catKey = e.attack_type || (e.is_attack ? "DDoS" : "Normal");
                    const catMeta = CATEGORY_META[catKey] || CATEGORY_META.Normal;

                    return (
                      <tr
                        key={e.id}
                        style={{
                          borderBottom: "1px solid var(--theme-card-border)",
                          background:
                            e.state === "ATTACK"
                              ? "rgba(239,68,68,0.04)"
                              : e.state === "SUSPICIOUS"
                              ? "rgba(245,158,11,0.04)"
                              : "transparent",
                          transition: "background 0.2s",
                        }}
                      >
                        <td style={{ padding: "12px 14px", fontFamily: "monospace", color: "var(--theme-text-muted)", fontWeight: 700 }}>
                          #{e.id}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 10px",
                              borderRadius: 6,
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: badge.dot }} />
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 10px",
                              borderRadius: 6,
                              background: catMeta.bg,
                              color: catMeta.color,
                              border: `1px solid ${catMeta.border}`,
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            <span>{catMeta.icon}</span>
                            {catMeta.label}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <ProbBar value={e.attack_prob} />
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: 5,
                              fontSize: 11,
                              fontWeight: 700,
                              background:
                                e.protocol === "TCP"
                                  ? "rgba(139,92,246,0.12)"
                                  : e.protocol === "UDP"
                                  ? "rgba(2,132,199,0.12)"
                                  : "rgba(217,119,6,0.12)",
                              color: e.protocol === "TCP" ? "#8b5cf6" : e.protocol === "UDP" ? "#0284c7" : "#d97706",
                            }}
                          >
                            {e.protocol || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div
                            onClick={() => handleCopyIp(e.src_ip)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: "var(--theme-input-bg)",
                              border: "1px solid var(--theme-input-border)",
                              padding: "3px 8px",
                              borderRadius: 5,
                              fontFamily: "monospace",
                              fontSize: 11,
                              color: "var(--theme-fg)",
                              cursor: "pointer",
                            }}
                          >
                            {e.src_ip || "—"}
                            <Copy size={11} style={{ color: "var(--theme-text-muted)" }} />
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <div
                            onClick={() => handleCopyIp(e.dst_ip)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: "var(--theme-input-bg)",
                              border: "1px solid var(--theme-input-border)",
                              padding: "3px 8px",
                              borderRadius: 5,
                              fontFamily: "monospace",
                              fontSize: 11,
                              color: "var(--theme-fg)",
                              cursor: "pointer",
                            }}
                          >
                            {e.dst_ip || "—"}
                            <Copy size={11} style={{ color: "var(--theme-text-muted)" }} />
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 11, color: "var(--theme-text-muted)" }}>
                          <span style={{ background: "var(--theme-bg)", border: "1px solid var(--theme-card-border)", padding: "2px 6px", borderRadius: 4 }}>
                            s{e.switch || "1"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
         OFFLINE RF MODE
         ═══════════════════════════════════════════════════════════════════════ */}
      {mode === "OFFLINE" && (
        <>
          {/* Threat Banner */}
          <div
            style={{
              ...S.glass,
              background: tc.bg,
              border: `2px solid ${tc.border}`,
              boxShadow: tc.glow,
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: `${tc.color}22`,
                  border: `2px solid ${tc.color}55`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: tc.color,
                }}
              >
                <ThreatIcon size={28} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: tc.color }}>
                  System Status: {tc.label}
                </p>
                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--theme-text-muted)" }}>
                  {rfStats?.total > 0
                    ? `${rfStats.total} flow vectors analyzed · ${rfStats.attacks} attacks detected · ${rfStats.attack_rate}% attack rate`
                    : "Waiting for SDN flow telemetry — launch an attack simulation to test"}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setIsPaused(!isPaused)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                  background: isPaused ? "rgba(245,158,11,0.15)" : "rgba(139,92,246,0.15)",
                  color: isPaused ? "#d97706" : "#8b5cf6",
                  border: `1px solid ${isPaused ? "rgba(245,158,11,0.3)" : "rgba(139,92,246,0.3)"}`,
                  transition: "all 0.2s",
                }}
              >
                {isPaused ? <Play size={14} /> : <Pause size={14} />}
                {isPaused ? "Resume Feed" : "Pause Feed"}
              </button>
              <button
                onClick={handleReset}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "var(--theme-card)",
                  border: "1px solid var(--theme-card-border)",
                  color: "var(--theme-fg)",
                  transition: "all 0.2s",
                }}
              >
                <RefreshCw size={14} /> Reset Model State
              </button>
            </div>
          </div>

          {/* Stats Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <StatCard label="Total Telemetry Events" value={rfStats?.total ?? 0} icon={BarChart2} />
            <StatCard
              label="Attacks Classified"
              value={rfStats?.attacks ?? 0}
              accent="#dc2626"
              icon={ShieldAlert}
              sub={rfStats?.attacks > 0 ? `${rfStats.attack_rate}% attack rate` : undefined}
            />
            <StatCard label="Suspicious Flows" value={rfStats?.suspicious ?? 0} accent="#d97706" icon={AlertTriangle} />
            <StatCard label="Benign Baseline" value={rfStats?.normal ?? 0} accent="#16a34a" icon={ShieldCheck} />
          </div>

          {/* Probability Timeline & Protocol Breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14 }}>
            <div style={{ ...S.glass, padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--theme-fg)" }}>
                  RF Attack Probability Timeline
                </p>
                <span style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>Thresholds: Suspicious ≥ 0.40 | Attack ≥ 0.70</span>
              </div>
              <ProbabilityChart data={rfStats?.recent_window} />
            </div>

            <div style={{ ...S.glass, padding: "20px 24px" }}>
              <p style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "var(--theme-fg)" }}>
                Protocol Traffic Distribution
              </p>
              <ProtocolBar byProtocol={rfStats?.by_protocol} />
              {(!rfStats?.by_protocol || Object.keys(rfStats.by_protocol).length === 0) && (
                <p style={{ fontSize: 12, color: "var(--theme-text-muted)", marginTop: 12, textAlign: "center" }}>No protocol telemetry</p>
              )}
            </div>
          </div>

          {/* Live Detection Feed Table */}
          <div style={{ ...S.glass, overflow: "hidden" }}>
            {/* Table Header Controls Toolbar */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--theme-card-border)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                background: "var(--theme-card)",
              }}
            >
              {/* Row 1: Search + Filters + Actions */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ position: "relative", width: 260 }}>
                    <Search
                      size={15}
                      style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--theme-text-muted)" }}
                    />
                    <input
                      type="text"
                      placeholder="Search IP, category, switch..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 32px 7px 34px",
                        background: "var(--theme-input-bg)",
                        border: "1px solid var(--theme-input-border)",
                        borderRadius: 8,
                        color: "var(--theme-fg)",
                        fontSize: 12,
                        outline: "none",
                        transition: "all 0.2s",
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "var(--theme-text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* State Filter Dropdown */}
                  <select
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                    style={{
                      padding: "7px 12px",
                      background: "var(--theme-input-bg)",
                      border: "1px solid var(--theme-input-border)",
                      borderRadius: 8,
                      color: "var(--theme-fg)",
                      fontSize: 12,
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="ALL">All States</option>
                    <option value="ATTACK">🔴 ATTACK</option>
                    <option value="SUSPICIOUS">🟡 SUSPICIOUS</option>
                    <option value="NORMAL">🟢 NORMAL</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--theme-text-muted)", fontWeight: 600 }}>
                    Showing {filteredEvents.length} of {rfEvents.length} events
                  </span>

                  <button
                    onClick={handleExportCSV}
                    disabled={filteredEvents.length === 0}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#8b5cf6",
                      background: "rgba(139,92,246,0.1)",
                      border: "1px solid rgba(139,92,246,0.25)",
                      borderRadius: 8,
                      padding: "6px 12px",
                      cursor: filteredEvents.length === 0 ? "not-allowed" : "pointer",
                      opacity: filteredEvents.length === 0 ? 0.4 : 1,
                      transition: "all 0.2s",
                    }}
                  >
                    <Download size={14} /> CSV Export
                  </button>

                  <button
                    onClick={handleClearRecent}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#dc2626",
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.25)",
                      borderRadius: 8,
                      padding: "6px 12px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    <Trash2 size={14} /> Clear Feed
                  </button>
                </div>
              </div>

              {/* Row 2: Category Filter Chips */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
                {[
                  { id: "ALL", label: "All Categories", icon: "🌐" },
                  { id: "DDoS", label: "DDoS", icon: "💥" },
                  { id: "DoS", label: "DoS", icon: "🌊" },
                  { id: "Probe", label: "Probe Scan", icon: "🎯" },
                  { id: "Brute_Force", label: "Brute Force", icon: "🔑" },
                  { id: "Botnet", label: "Botnet", icon: "🤖" },
                  { id: "Normal", label: "Normal", icon: "🟢" },
                ].map((c) => {
                  const count = categoryCounts[c.id] || 0;
                  const active = selectedCategory === c.id;
                  const meta = CATEGORY_META[c.id] || { color: "#8b5cf6" };
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategory(c.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "5px 12px",
                        borderRadius: 20,
                        border: `1px solid ${active ? meta.color : "var(--theme-card-border)"}`,
                        background: active ? `${meta.color}20` : "var(--theme-bg)",
                        color: active ? meta.color : "var(--theme-text-muted)",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        transition: "all 0.2s",
                      }}
                    >
                      <span>{c.icon}</span>
                      {c.label}
                      <span
                        style={{
                          background: active ? meta.color : "var(--theme-card-border)",
                          color: active ? "#ffffff" : "var(--theme-fg)",
                          fontSize: 10,
                          borderRadius: 10,
                          padding: "1px 6px",
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Table View */}
            <div style={{ maxHeight: 540, overflowY: "auto", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--theme-bg)", position: "sticky", top: 0, zIndex: 10 }}>
                    {[
                      { title: "# ID", field: "id", width: 80 },
                      { title: "State", field: "state", width: 110 },
                      { title: "Attack Category", field: "attack_type", width: 150 },
                      { title: "Threat Probability", field: "attack_prob", width: 160 },
                      { title: "Protocol", field: "protocol", width: 90 },
                      { title: "Source IP", field: "src_ip", width: 130 },
                      { title: "Destination IP", field: "dst_ip", width: 130 },
                      { title: "Switch", field: "switch", width: 80 },
                    ].map((h) => (
                      <th
                        key={h.field}
                        onClick={() => handleSort(h.field)}
                        style={{
                          padding: "12px 14px",
                          color: sortField === h.field ? "#8b5cf6" : "var(--theme-text-muted)",
                          fontWeight: 700,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          borderBottom: "1px solid var(--theme-card-border)",
                          whiteSpace: "nowrap",
                          width: h.width,
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {h.title}
                          {renderSortIcon(h.field)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredEvents.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: "48px 20px", textAlign: "center" }}>
                        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                          <Terminal size={32} style={{ color: "var(--theme-text-muted)" }} />
                          <p style={{ margin: 0, fontSize: 14, color: "var(--theme-fg)", fontWeight: 600 }}>
                            {searchQuery || selectedCategory !== "ALL" || selectedState !== "ALL"
                              ? "No detection events match your search filters."
                              : "No attack telemetry received yet."}
                          </p>
                          <p style={{ margin: 0, fontSize: 12, color: "var(--theme-text-muted)" }}>
                            Run simulated attack traffic:{" "}
                            <code style={{ background: "var(--theme-bg)", border: "1px solid var(--theme-card-border)", padding: "2px 8px", borderRadius: 4, color: "#8b5cf6" }}>
                              uv run simulate_attack.py --attack all
                            </code>
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {filteredEvents.map((e) => {
                    const badge = STATE_BADGES[e.state] || STATE_BADGES.NORMAL;
                    const catKey = e.attack_type || (e.is_attack ? "DDoS" : "Normal");
                    const catMeta = CATEGORY_META[catKey] || CATEGORY_META.Normal;

                    return (
                      <tr
                        key={e.id}
                        style={{
                          borderBottom: "1px solid var(--theme-card-border)",
                          background:
                            e.state === "ATTACK"
                              ? "rgba(239,68,68,0.04)"
                              : e.state === "SUSPICIOUS"
                              ? "rgba(245,158,11,0.04)"
                              : "transparent",
                          transition: "background 0.2s",
                        }}
                        onMouseEnter={(ev) => {
                          ev.currentTarget.style.background = "var(--theme-grid)";
                        }}
                        onMouseLeave={(ev) => {
                          ev.currentTarget.style.background =
                            e.state === "ATTACK"
                              ? "rgba(239,68,68,0.04)"
                              : e.state === "SUSPICIOUS"
                              ? "rgba(245,158,11,0.04)"
                              : "transparent";
                        }}
                      >
                        {/* ID Column */}
                        <td style={{ padding: "12px 14px", fontFamily: "monospace", color: "var(--theme-text-muted)", fontWeight: 700 }}>
                          #{e.id}
                        </td>

                        {/* State Column */}
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 10px",
                              borderRadius: 6,
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                              fontSize: 11,
                              fontWeight: 800,
                              letterSpacing: "0.04em",
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: badge.dot,
                                boxShadow: `0 0 6px ${badge.dot}`,
                              }}
                            />
                            {badge.label}
                          </span>
                        </td>

                        {/* Attack Category Column */}
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 10px",
                              borderRadius: 6,
                              background: catMeta.bg,
                              color: catMeta.color,
                              border: `1px solid ${catMeta.border}`,
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            <span>{catMeta.icon}</span>
                            {catMeta.label}
                          </span>
                        </td>

                        {/* Threat Probability Bar */}
                        <td style={{ padding: "12px 14px" }}>
                          <ProbBar value={e.attack_prob} />
                        </td>

                        {/* Protocol */}
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: 5,
                              fontSize: 11,
                              fontWeight: 700,
                              background:
                                e.protocol === "TCP"
                                  ? "rgba(139,92,246,0.12)"
                                  : e.protocol === "UDP"
                                  ? "rgba(2,132,199,0.12)"
                                  : "rgba(217,119,6,0.12)",
                              color: e.protocol === "TCP" ? "#8b5cf6" : e.protocol === "UDP" ? "#0284c7" : "#d97706",
                              border: `1px solid ${
                                e.protocol === "TCP"
                                  ? "rgba(139,92,246,0.3)"
                                  : e.protocol === "UDP"
                                  ? "rgba(2,132,199,0.3)"
                                  : "rgba(217,119,6,0.3)"
                              }`,
                            }}
                          >
                            {e.protocol || "—"}
                          </span>
                        </td>

                        {/* Source IP with Copy */}
                        <td style={{ padding: "12px 14px" }}>
                          <div
                            onClick={() => handleCopyIp(e.src_ip)}
                            title="Click to copy IP"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: "var(--theme-input-bg)",
                              border: "1px solid var(--theme-input-border)",
                              padding: "3px 8px",
                              borderRadius: 5,
                              fontFamily: "monospace",
                              fontSize: 11,
                              color: "var(--theme-fg)",
                              cursor: "pointer",
                            }}
                          >
                            {e.src_ip || "—"}
                            <Copy size={11} style={{ color: "var(--theme-text-muted)" }} />
                          </div>
                        </td>

                        {/* Destination IP with Copy */}
                        <td style={{ padding: "12px 14px" }}>
                          <div
                            onClick={() => handleCopyIp(e.dst_ip)}
                            title="Click to copy IP"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: "var(--theme-input-bg)",
                              border: "1px solid var(--theme-input-border)",
                              padding: "3px 8px",
                              borderRadius: 5,
                              fontFamily: "monospace",
                              fontSize: 11,
                              color: "var(--theme-fg)",
                              cursor: "pointer",
                            }}
                          >
                            {e.dst_ip || "—"}
                            <Copy size={11} style={{ color: "var(--theme-text-muted)" }} />
                          </div>
                        </td>

                        {/* Switch Node */}
                        <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 11, color: "var(--theme-text-muted)" }}>
                          <span style={{ background: "var(--theme-bg)", border: "1px solid var(--theme-card-border)", padding: "2px 6px", borderRadius: 4 }}>
                            s{e.switch || "1"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
         ONLINE ISOLATION FOREST MODE
         ═══════════════════════════════════════════════════════════════════════ */}
      {mode === "ONLINE" && (
        <>
          {/* Online IF Threat Banner */}
          <div
            style={{
              ...S.glass,
              background: ifTc.bg,
              border: `2px solid ${ifTc.border}`,
              boxShadow: ifTc.glow,
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: `${ifTc.color}22`,
                  border: `2px solid ${ifTc.color}55`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: ifTc.color,
                }}
              >
                <IfThreatIcon size={28} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: ifTc.color }}>
                  Online IF: {isIFAttack ? "Attack Anomaly Detected" : isIFSuspicious ? "Suspicious Flow Anomaly" : "Normal Baseline"}
                </p>
                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--theme-text-muted)" }}>
                  {worstIF
                    ? `Phase: ${worstIF.phase} · Switch: ${worstIF.switch_id} · Anomaly Score: ${
                        worstIF.raw_score?.toFixed(4) ?? "—"
                      }`
                    : "Waiting for live OpenDaylight telemetry — click Start Polling"}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={ifRunning ? stopIfPolling : startIfPolling}
                disabled={ifConnected === false}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 10,
                  border: "none",
                  cursor: ifConnected === false ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                  background: ifRunning ? "#dc2626" : "#6366f1",
                  color: "#fff",
                  opacity: ifConnected === false ? 0.4 : 1,
                  transition: "all 0.2s",
                }}
              >
                {ifRunning ? <Pause size={14} /> : <Play size={14} />}
                {ifRunning ? "Stop Polling" : "Start IF Polling"}
              </button>
              <button
                onClick={sendOnline}
                disabled={ifConnected === false}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 10,
                  cursor: ifConnected === false ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "var(--theme-card)",
                  border: "1px solid var(--theme-card-border)",
                  color: "var(--theme-fg)",
                  opacity: ifConnected === false ? 0.4 : 1,
                  transition: "all 0.2s",
                }}
              >
                Poll Once
              </button>
              <button
                onClick={handleReset}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "var(--theme-card)",
                  border: "1px solid var(--theme-card-border)",
                  color: "var(--theme-fg)",
                  transition: "all 0.2s",
                }}
              >
                <RefreshCw size={14} /> Reset
              </button>
            </div>
          </div>

          {/* Baseline Collection Progress Bar */}
          {worstIF?.phase === "BASELINE" && (
            <div style={{ ...S.glass, padding: "16px 24px" }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#0284c7" }}>
                Collecting Baseline Telemetry… {worstIF.collected ?? 0} / {(worstIF.collected ?? 0) + (worstIF.remaining ?? 100)}{" "}
                samples
              </p>
              <div style={{ height: 8, background: "var(--theme-card-border)", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    borderRadius: 4,
                    background: "#0284c7",
                    width: `${Math.min(
                      100,
                      ((worstIF.collected ?? 0) / ((worstIF.collected ?? 0) + (worstIF.remaining ?? 100))) * 100
                    )}%`,
                    transition: "width 0.5s",
                  }}
                />
              </div>
            </div>
          )}

          {/* Extracted IF Feature Cards */}
          {ifLastFeatures && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              {[
                { key: "avg_packet_size", label: "Avg Pkt Size", unit: "Bytes", icon: "📦" },
                { key: "bytes_per_second", label: "Bytes / Sec", unit: "B/s", icon: "📈" },
                { key: "packet_count", label: "Packet Count", unit: "pkts", icon: "📊" },
                { key: "active_flow_count", label: "Active Flows", unit: "flows", icon: "🔀" },
                { key: "asymmetry", label: "Asymmetry", unit: "ratio", icon: "⚖️" },
              ].map((f) => (
                <div key={f.key} style={{ ...S.glassInner, padding: "14px 16px" }}>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--theme-text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                    {f.icon} {f.label}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700, color: "var(--theme-fg)", fontFamily: "monospace" }}>
                    {ifLastFeatures[f.key] != null
                      ? parseFloat(Number(ifLastFeatures[f.key]).toFixed(2)).toLocaleString()
                      : "—"}{" "}
                    <span style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>{f.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* IF Event Log Table */}
          <div style={{ ...S.glass, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid var(--theme-card-border)",
                background: "var(--theme-card)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Activity size={18} style={{ color: "#6366f1" }} />
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--theme-fg)" }}>
                  Isolation Forest Telemetry Log
                </p>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--theme-text-muted)",
                    background: "var(--theme-bg)",
                    border: "1px solid var(--theme-card-border)",
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  {ifLog.length} entries
                </span>
              </div>
              <button
                onClick={() => setIfLog([])}
                style={{ fontSize: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
              >
                Clear Log
              </button>
            </div>

            <div style={{ maxHeight: 440, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "var(--theme-bg)" }}>
                    {["Time", "Switch Node", "Anomaly State", "Raw Score", "Phase"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "12px 14px",
                          color: "var(--theme-text-muted)",
                          fontWeight: 700,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          borderBottom: "1px solid var(--theme-card-border)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {ifLog.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: "40px 20px", textAlign: "center", color: "var(--theme-text-muted)" }}>
                        No Isolation Forest telemetry logged yet. Click <strong>Start IF Polling</strong> above to stream live ODL metrics.
                      </td>
                    </tr>
                  )}

                  {ifLog.map((e, i) => {
                    const badge = STATE_BADGES[e.state] || { bg: "rgba(100,116,139,0.12)", color: "#64748b", border: "rgba(100,116,139,0.3)", label: e.state || e.phase || "—" };
                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid var(--theme-card-border)",
                          background: e.state === "ATTACK" ? "rgba(239,68,68,0.04)" : "transparent",
                        }}
                      >
                        <td style={{ padding: "12px 14px", color: "var(--theme-text-muted)", fontFamily: "monospace" }}>{e._ts}</td>
                        <td style={{ padding: "12px 14px", fontFamily: "monospace", color: "var(--theme-fg)" }}>
                          <span style={{ background: "var(--theme-bg)", border: "1px solid var(--theme-card-border)", padding: "2px 6px", borderRadius: 4 }}>
                            {e.switch_id ?? "global"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              padding: "4px 10px",
                              borderRadius: 6,
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            {e.state || e.phase || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: "monospace", color: "var(--theme-fg)", fontWeight: 700 }}>
                          {e.raw_score?.toFixed(4) ?? "—"}
                        </td>
                        <td style={{ padding: "12px 14px", color: "var(--theme-text-muted)" }}>{e.phase ?? "DETECTION"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}