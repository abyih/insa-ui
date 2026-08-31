import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Zap,
  Send,
  Radio,
  Globe,
  Box,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Settings,
  History,
  Info,
  Shield,
  Monitor,
  ChevronDown,
  ChevronUp,
  Cpu,
  CornerDownLeft,
  X,
} from "lucide-react";
import {
  compileIntent,
  getAiSettings,
  getAiIntentHistory,
  clearAiIntentHistory,
} from "../../api/aiIntentService";
import AiSettingsModal from "./AiSettingsModal";

// ─── Preset Intent Suggestions ───────────────────────────────────────────────
const PRESET_INTENTS = [
  {
    icon: "🚗",
    label: "URLLC Autonomous Vehicles",
    prompt: "Create an ultra-reliable low latency URLLC slice for autonomous vehicle telemetry between host 10.0.0.1 and 10.0.0.2 with 20 MB/s bandwidth",
    type: "urllc",
    color: "#ef4444",
  },
  {
    icon: "📹",
    label: "4K Video Streaming eMBB",
    prompt: "Deploy an eMBB broadband slice for 4K video streaming with 50 MB/s bandwidth limit for all available hosts",
    type: "embb",
    color: "#6366f1",
  },
  {
    icon: "🌡️",
    label: "Smart City IoT mMTC",
    prompt: "Set up a massive IoT sensor telemetry slice (mMTC) with 1500 KB/s rate limit for low-power smart meters",
    type: "mmtc",
    color: "#22c55e",
  },
  {
    icon: "🏥",
    label: "Telemedicine & Robotic Surgery",
    prompt: "Establish a mission-critical zero packet-loss slice for remote hospital robotic surgery with maximum priority and 15 MB/s bandwidth",
    type: "urllc",
    color: "#ef4444",
  },
];

function formatRate(kbps) {
  if (kbps >= 1000000) return (kbps / 1000000).toFixed(1) + " GB/s";
  if (kbps >= 1000) return (kbps / 1000).toFixed(1) + " MB/s";
  return kbps + " KB/s";
}

export default function AiIntentPanel({
  onosHosts = [],
  existingSlices = [],
  totalCapacity = 100000,
  remainingCapacity = 100000,
  onDeploySlice,
  onPrefillManualForm,
  loading = false,
}) {
  const [prompt, setPrompt] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [compilationStep, setCompilationStep] = useState(0);
  const [compiledResult, setCompiledResult] = useState(null);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showActionsList, setShowActionsList] = useState(false);
  const [history, setHistory] = useState([]);
  const [aiSettings, setAiSettings] = useState(getAiSettings());

  useEffect(() => {
    setHistory(getAiIntentHistory());
  }, []);

  const handleSettingsUpdated = (newSettings) => {
    setAiSettings(newSettings);
  };

  const handleCompile = async (overridePrompt = null) => {
    const textToCompile = overridePrompt || prompt;
    if (!textToCompile || !textToCompile.trim()) return;

    setCompiling(true);
    setError(null);
    setCompiledResult(null);
    setCompilationStep(1);

    // Progressive step animation for rich user feedback
    const stepTimer1 = setTimeout(() => setCompilationStep(2), 350);
    const stepTimer2 = setTimeout(() => setCompilationStep(3), 700);
    const stepTimer3 = setTimeout(() => setCompilationStep(4), 1050);

    try {
      const result = await compileIntent(
        textToCompile,
        {
          onosHosts,
          existingSlices,
          totalCapacity,
          remainingCapacity,
        },
        aiSettings
      );

      setCompiledResult(result);
      setHistory(getAiIntentHistory());
    } catch (err) {
      setError(err.message || "Failed to compile network intent.");
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);
      setCompiling(false);
      setCompilationStep(0);
    }
  };

  const handleDeploy = () => {
    if (!compiledResult) return;
    if (onDeploySlice) {
      onDeploySlice({
        name: compiledResult.sliceName,
        description: compiledResult.description,
        bandwidth: compiledResult.bandwidth,
        burstSize: compiledResult.burstSize,
        unit: compiledResult.unit || "KB_PER_SEC",
        color: compiledResult.color || "#6366f1",
        vlanId: compiledResult.vlanId || null,
        selectedHosts: compiledResult.matchedHosts || [],
      });
    }
  };

  const handlePrefillManual = () => {
    if (!compiledResult) return;
    if (onPrefillManualForm) {
      onPrefillManualForm({
        name: compiledResult.sliceName,
        description: compiledResult.description,
        bandwidth: compiledResult.bandwidth,
        burstSize: compiledResult.burstSize,
        unit: compiledResult.unit || "KB_PER_SEC",
        color: compiledResult.color || "#6366f1",
        vlanId: compiledResult.vlanId || "",
        selectedHostIds: (compiledResult.matchedHosts || []).map(
          (h) => h.id || `${h.mac}/None`
        ),
      });
    }
  };

  const providerBadge = useMemo(() => {
    const modelName = aiSettings.model || "";
    if (aiSettings.provider === "gemini") {
      const displayModel = modelName
        ? modelName.replace("gemini-", "").replace(/-/g, " ")
        : "1.5 Flash";
      return {
        label: "Google Gemini",
        sub: displayModel,
        color: "#818cf8",
        bg: "rgba(99,102,241,0.15)",
        border: "rgba(99,102,241,0.3)",
      };
    }
    if (aiSettings.provider === "groq") {
      const displayModel = modelName
        ? modelName.replace("llama-", "Llama ").replace("deepseek-", "DeepSeek ").split("-")[0]
        : "Llama 3.3";
      return {
        label: "Groq Cloud",
        sub: displayModel,
        color: "#fbbf24",
        bg: "rgba(245,158,11,0.15)",
        border: "rgba(245,158,11,0.3)",
      };
    }
    if (aiSettings.provider === "openrouter") {
      return {
        label: "OpenRouter",
        sub: modelName.split("/")[1] || modelName || "Multi-Model",
        color: "#60a5fa",
        bg: "rgba(59,130,246,0.15)",
        border: "rgba(59,130,246,0.3)",
      };
    }
    return {
      label: "Offline Heuristic",
      sub: "Rule Engine",
      color: "#4ade80",
      bg: "rgba(34,197,94,0.15)",
      border: "rgba(34,197,94,0.3)",
    };
  }, [aiSettings]);

  return (
    <div
      style={{
        background: "linear-gradient(145deg, rgba(24,24,27,0.95), rgba(15,15,18,0.98))",
        border: "1px solid rgba(99,102,241,0.25)",
        borderRadius: 20,
        padding: "22px 24px",
        marginBottom: 24,
        boxShadow: "0 10px 30px -10px rgba(0,0,0,0.5), 0 0 35px rgba(99,102,241,0.06)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative top ambient glow line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: "linear-gradient(90deg, transparent, #6366f1, #a855f7, #ec4899, transparent)",
        }}
      />

      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.3))",
              border: "1px solid rgba(99,102,241,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 15px rgba(99,102,241,0.25)",
            }}
          >
            <Sparkles size={20} color="#818cf8" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: "var(--color-zinc-50, #f4f4f5)",
                  margin: 0,
                  letterSpacing: -0.3,
                }}
              >
                AI Intent-Based Slicing Engine
              </h2>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 20,
                  background: providerBadge.bg,
                  border: `1px solid ${providerBadge.border}`,
                  color: providerBadge.color,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {providerBadge.label} • {providerBadge.sub}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--theme-text-muted, #a1a1aa)", margin: "2px 0 0 0" }}>
              Declare your network slicing goal in natural language — AI compiles SLA parameters, grounds against ONOS topology, and synthesizes OpenFlow policies.
            </p>
          </div>
        </div>

        {/* Right utility buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            title="View Intent History"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)",
              background: showHistory ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
              color: showHistory ? "#818cf8" : "var(--theme-text-muted, #a1a1aa)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <History size={13} />
            <span>History ({history.length})</span>
          </button>

          <button
            onClick={() => setShowSettings(true)}
            title="AI Model & API Key Settings"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 10,
              border: "1px solid rgba(99,102,241,0.3)",
              background: "rgba(99,102,241,0.12)",
              color: "#c7d2fe",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <Settings size={13} color="#818cf8" />
            <span>AI Settings</span>
          </button>
        </div>
      </div>

      {/* Preset Intent Suggestion Pills */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--theme-text-muted, #a1a1aa)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Quick Intent Templates:
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PRESET_INTENTS.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setPrompt(item.prompt);
                handleCompile(item.prompt);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
                color: "var(--color-zinc-50, #f4f4f5)",
                fontSize: 12,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)";
                e.currentTarget.style.background = "rgba(99,102,241,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }}
            >
              <span>{item.icon}</span>
              <span style={{ fontWeight: 500 }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Input Form */}
      <div
        style={{
          position: "relative",
          borderRadius: 14,
          border: "1px solid rgba(99,102,241,0.35)",
          background: "rgba(0,0,0,0.35)",
          padding: "10px 14px",
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleCompile();
            }
          }}
          placeholder="e.g. 'Deploy an ultra-reliable low latency slice for medical telemetry between host 10.0.0.1 and 10.0.0.2 with 15 MB/s bandwidth'..."
          rows={2}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--color-zinc-50, #f4f4f5)",
            fontSize: 14,
            lineHeight: 1.5,
            resize: "none",
            fontFamily: "inherit",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--theme-text-muted, #a1a1aa)" }}>
            <span>
              💡 <strong>Tip:</strong> Mention target hosts (e.g. 10.0.0.1, all hosts) and QoS/bandwidth (e.g. 50 Mbps).
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {prompt && (
              <button
                type="button"
                onClick={() => {
                  setPrompt("");
                  setCompiledResult(null);
                  setError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--theme-text-muted, #a1a1aa)",
                  fontSize: 12,
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => handleCompile()}
              disabled={compiling || !prompt.trim()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 18px",
                borderRadius: 10,
                border: "none",
                background: compiling ? "#4f46e5" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: compiling || !prompt.trim() ? "not-allowed" : "pointer",
                opacity: !prompt.trim() && !compiling ? 0.5 : 1,
                boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
                transition: "all 0.15s",
              }}
            >
              {compiling ? (
                <>
                  <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                  <span>Compiling Intent...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Compile Intent</span>
                  <CornerDownLeft size={11} style={{ opacity: 0.7 }} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Progressive Step Animation while compiling */}
      {compiling && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: 14,
            padding: "12px 16px",
            borderRadius: 12,
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <RefreshCw size={18} color="#818cf8" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: "#c7d2fe", lineHeight: 1.4 }}>
            {compilationStep === 1 && "🔍 Step 1/4: Decomposing Intent & SLA Parameters..."}
            {compilationStep === 2 && "🌐 Step 2/4: Grounding Hosts against Live ONOS Topology..."}
            {compilationStep === 3 && "⚡ Step 3/4: Verifying Capacity Pool & Admission Control..."}
            {compilationStep === 4 && "🛡️ Step 4/4: Synthesizing OpenFlow Policies & Isolation Rules..."}
          </div>
        </motion.div>
      )}

      {/* Error Alert */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: 14,
            padding: "12px 16px",
            borderRadius: 12,
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#f87171",
            fontSize: 12,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>{error}</div>
          <button
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer" }}
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* Compiled Result Plan Card */}
      <AnimatePresence>
        {compiledResult && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            style={{
              marginTop: 18,
              borderRadius: 16,
              background: "rgba(0,0,0,0.45)",
              border: `1px solid ${compiledResult.color || "#6366f1"}50`,
              overflow: "hidden",
              boxShadow: `0 10px 25px -5px ${compiledResult.color || "#6366f1"}20`,
            }}
          >
            {/* Plan Header */}
            <div
              style={{
                padding: "14px 18px",
                background: `linear-gradient(90deg, ${compiledResult.color || "#6366f1"}20, transparent)`,
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `${compiledResult.color || "#6366f1"}30`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Layers size={16} color={compiledResult.color || "#6366f1"} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-zinc-50, #f4f4f5)" }}>
                      {compiledResult.sliceName}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: `${compiledResult.color || "#6366f1"}25`,
                        color: compiledResult.color || "#6366f1",
                        textTransform: "uppercase",
                      }}
                    >
                      {compiledResult.sliceType}
                    </span>
                    {compiledResult.confidence && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background: "rgba(34,197,94,0.15)",
                          color: "#4ade80",
                        }}
                      >
                        {Math.round(compiledResult.confidence * 100)}% Confidence
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted, #a1a1aa)", marginTop: 2 }}>
                    {compiledResult.description}
                  </div>
                </div>
              </div>

              {/* Admission Status Badge */}
              <div>
                {compiledResult.admissionStatus === "APPROVED" ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 20,
                      background: "rgba(34,197,94,0.15)",
                      border: "1px solid rgba(34,197,94,0.3)",
                      color: "#4ade80",
                    }}
                  >
                    <CheckCircle2 size={12} /> Admission Approved
                  </span>
                ) : (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 20,
                      background: "rgba(239,68,68,0.15)",
                      border: "1px solid rgba(239,68,68,0.3)",
                      color: "#f87171",
                    }}
                  >
                    <AlertTriangle size={12} /> Capacity Exceeded
                  </span>
                )}
              </div>
            </div>

            {/* Plan Body */}
            <div style={{ padding: "16px 18px" }}>
              {/* Key SLA Specs Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                {[
                  {
                    label: "Bandwidth Cap",
                    value: formatRate(compiledResult.bandwidth),
                    sub: "Guaranteed SLA",
                  },
                  {
                    label: "Burst Allowance",
                    value: `${compiledResult.burstSize} KB`,
                    sub: "Spike buffer",
                  },
                  {
                    label: "VLAN Tag",
                    value: compiledResult.vlanId ? `VLAN ${compiledResult.vlanId}` : "Auto-allocate",
                    sub: "L2 Isolation",
                  },
                  {
                    label: "Hosts Assigned",
                    value: `${(compiledResult.matchedHosts || []).length} host(s)`,
                    sub: "Grounded in topology",
                  },
                ].map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div style={{ fontSize: 10, color: "var(--theme-text-muted, #a1a1aa)", fontWeight: 600, textTransform: "uppercase" }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-zinc-50, #f4f4f5)", marginTop: 2 }}>
                      {s.value}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--theme-text-muted, #a1a1aa)", marginTop: 1 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Reasoning */}
              {compiledResult.reasoning && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "rgba(99,102,241,0.06)",
                    border: "1px solid rgba(99,102,241,0.15)",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <Info size={15} color="#818cf8" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: 12, color: "#c7d2fe", lineHeight: 1.5 }}>
                    <strong style={{ color: "#fff" }}>AI Rationale: </strong>
                    {compiledResult.reasoning}
                  </div>
                </div>
              )}

              {/* Matched Hosts */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted, #a1a1aa)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
                  Target Discovered Hosts:
                </div>
                {(compiledResult.matchedHosts || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: "#f59e0b" }}>
                    ⚠️ No specific live hosts discovered in ONOS match the prompt. The slice will be created ready for host assignment.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {compiledResult.matchedHosts.map((h, i) => {
                      const ips = h.ipAddresses || [];
                      const ip = ips.find((ip) => !ip.includes(":")) || ips[0] || h.mac;
                      const loc = h.locations?.[0] || h.location || {};
                      return (
                        <div
                          key={i}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 12px",
                            borderRadius: 10,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            fontSize: 12,
                          }}
                        >
                          <Monitor size={13} color={compiledResult.color || "#6366f1"} />
                          <span style={{ fontWeight: 700, color: "#fff" }}>{ip}</span>
                          <span style={{ fontSize: 10, color: "var(--theme-text-muted, #a1a1aa)", fontFamily: "monospace" }}>
                            {h.mac}
                          </span>
                          {loc.elementId && (
                            <span style={{ fontSize: 10, color: "#a5b4fc" }}>
                              ({loc.elementId}:{loc.port})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Collapsible OpenFlow Actions */}
              {compiledResult.openFlowActions && compiledResult.openFlowActions.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <button
                    type="button"
                    onClick={() => setShowActionsList(!showActionsList)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--theme-text-muted, #a1a1aa)",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: 0,
                    }}
                  >
                    <Shield size={12} color="#818cf8" />
                    <span>View Synthesized OpenFlow Action Rules ({compiledResult.openFlowActions.length})</span>
                    {showActionsList ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {showActionsList && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: "#a1a1aa",
                        lineHeight: 1.6,
                      }}
                    >
                      {compiledResult.openFlowActions.map((action, i) => (
                        <div key={i} style={{ display: "flex", gap: 6 }}>
                          <span style={{ color: "#818cf8" }}>▸</span>
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 12,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 11, color: "var(--theme-text-muted, #a1a1aa)" }}>
                  Provider: <strong>{compiledResult.provider}</strong>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={handlePrefillManual}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(255,255,255,0.04)",
                      color: "var(--color-zinc-50, #f4f4f5)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Sliders size={13} />
                    <span>Edit in Form</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeploy}
                    disabled={loading || compiledResult.admissionStatus === "REJECTED_CAPACITY"}
                    style={{
                      padding: "8px 22px",
                      borderRadius: 10,
                      border: "none",
                      background:
                        compiledResult.admissionStatus === "REJECTED_CAPACITY"
                          ? "rgba(239,68,68,0.3)"
                          : "linear-gradient(135deg, #22c55e, #16a34a)",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor:
                        compiledResult.admissionStatus === "REJECTED_CAPACITY" || loading
                          ? "not-allowed"
                          : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: "0 4px 14px rgba(34,197,94,0.3)",
                      transition: "all 0.15s",
                    }}
                  >
                    {loading ? (
                      <>
                        <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                        <span>Deploying to ONOS...</span>
                      </>
                    ) : (
                      <>
                        <Zap size={14} />
                        <span>Enforce & Deploy Slice</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Drawer */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              marginTop: 16,
              borderRadius: 14,
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "14px 18px",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-zinc-50, #f4f4f5)" }}>
                Recent Operator Intent History
              </span>
              <button
                onClick={() => {
                  clearAiIntentHistory();
                  setHistory([]);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#f87171",
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Clear History
              </button>
            </div>

            {history.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--theme-text-muted, #a1a1aa)", padding: "8px 0" }}>
                No intent history yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflow: "auto" }}>
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setPrompt(item.prompt);
                      handleCompile(item.prompt);
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      fontSize: 12,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                  >
                    <div style={{ minWidth: 0, flex: 1, paddingRight: 10 }}>
                      <div style={{ fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        "{item.prompt}"
                      </div>
                      <div style={{ fontSize: 10, color: "var(--theme-text-muted, #a1a1aa)", marginTop: 2 }}>
                        {item.sliceName} • {formatRate(item.bandwidth)} • {item.hostCount} hosts • {item.provider}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: "#818cf8", fontWeight: 700 }}>Re-run ↗</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AiSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSettingsUpdated={handleSettingsUpdated}
      />
    </div>
  );
}
