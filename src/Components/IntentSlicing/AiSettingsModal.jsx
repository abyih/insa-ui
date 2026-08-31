import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Key,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Shield,
  Eye,
  EyeOff,
  Zap,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  getAiSettings,
  saveAiSettings,
  testAiConnection,
  PROVIDER_MODELS,
} from "../../api/aiIntentService";

export default function AiSettingsModal({ isOpen, onClose, onSettingsUpdated }) {
  const [settings, setSettings] = useState(getAiSettings());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const current = getAiSettings();
      setSettings(current);
      setTestResult(null);
      setSavedSuccess(false);
      const isKnown = (PROVIDER_MODELS[current.provider] || []).some((m) => m.id === current.model);
      setIsCustomModel(!isKnown && current.provider !== "heuristic");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProviderChange = (provider) => {
    const defaultModel = PROVIDER_MODELS[provider]?.[0]?.id || "";
    setSettings((prev) => ({
      ...prev,
      provider,
      model: defaultModel,
    }));
    setIsCustomModel(false);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAiConnection(settings.provider, settings.apiKey, settings.model);
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, latency: 0, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    saveAiSettings(settings);
    setSavedSuccess(true);
    if (onSettingsUpdated) onSettingsUpdated(settings);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid var(--theme-input-border, rgba(255,255,255,0.15))",
    background: "var(--theme-input-bg, rgba(0,0,0,0.3))",
    color: "var(--color-zinc-50, #f4f4f5)",
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--theme-text-muted, #a1a1aa)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--theme-card, #18181b)",
          border: "1px solid var(--theme-card-border, rgba(255,255,255,0.1))",
          borderRadius: 20,
          width: "100%",
          maxWidth: 580,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 30px rgba(99,102,241,0.15)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--theme-card-border, rgba(255,255,255,0.1))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.25))",
                border: "1px solid rgba(99,102,241,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={20} color="#818cf8" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-zinc-50, #f4f4f5)" }}>
                AI Intent Engine Settings
              </div>
              <div style={{ fontSize: 12, color: "var(--theme-text-muted, #a1a1aa)" }}>
                Configure your free AI service provider or use the offline heuristic engine
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--theme-text-muted, #a1a1aa)",
              cursor: "pointer",
              fontSize: 20,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {/* Provider Selection Tabs */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>AI Service Provider</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                {
                  id: "gemini",
                  name: "Google Gemini",
                  desc: "Recommended • Generous Free Tier",
                  icon: Sparkles,
                  color: "#6366f1",
                },
                {
                  id: "groq",
                  name: "Groq Cloud",
                  desc: "Ultra-Fast Llama 3.3 • Free",
                  icon: Zap,
                  color: "#f59e0b",
                },
                {
                  id: "openrouter",
                  name: "OpenRouter",
                  desc: "Multi-Model Aggregator",
                  icon: Cpu,
                  color: "#3b82f6",
                },
                {
                  id: "heuristic",
                  name: "Offline Heuristic",
                  desc: "Built-in Rule Engine • No Key",
                  icon: Shield,
                  color: "#22c55e",
                },
              ].map((p) => {
                const IconComponent = p.icon;
                const isSelected = settings.provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProviderChange(p.id)}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      cursor: "pointer",
                      textAlign: "left",
                      border: `1px solid ${isSelected ? p.color : "rgba(255,255,255,0.08)"}`,
                      background: isSelected ? `${p.color}18` : "rgba(255,255,255,0.02)",
                      color: "var(--color-zinc-50, #f4f4f5)",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <IconComponent size={15} color={p.color} />
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--theme-text-muted, #a1a1aa)" }}>{p.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Guide & Link to get key */}
          {settings.provider !== "heuristic" && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.2)",
                marginBottom: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "#c7d2fe", lineHeight: 1.4 }}>
                {settings.provider === "gemini" && (
                  <>
                    Get your <strong>free Google Gemini API key</strong> at Google AI Studio (takes 30 seconds, no credit card required).
                  </>
                )}
                {settings.provider === "groq" && (
                  <>
                    Get your <strong>free Groq API key</strong> at Groq Console for ultra-fast Llama 3.3 inference.
                  </>
                )}
                {settings.provider === "openrouter" && (
                  <>
                    Get your free or standard API key at <strong>OpenRouter.ai</strong>.
                  </>
                )}
              </div>
              <a
                href={
                  settings.provider === "gemini"
                    ? "https://aistudio.google.com/app/apikey"
                    : settings.provider === "groq"
                    ? "https://console.groq.com/keys"
                    : "https://openrouter.ai/keys"
                }
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 12px",
                  borderRadius: 8,
                  background: "#6366f1",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  textDecoration: "none",
                  flexShrink: 0,
                }}
              >
                Get Key <ExternalLink size={11} />
              </a>
            </div>
          )}

          {/* API Key Input */}
          {settings.provider !== "heuristic" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={labelStyle}>API Key *</label>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--theme-text-muted, #a1a1aa)",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 6,
                  }}
                >
                  {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={showKey ? "text" : "password"}
                  value={settings.apiKey}
                  onChange={(e) => {
                    setSettings({ ...settings, apiKey: e.target.value });
                    setTestResult(null);
                  }}
                  placeholder={
                    settings.provider === "gemini"
                      ? "AIzaSy..."
                      : settings.provider === "groq"
                      ? "gsk_..."
                      : "sk-or-..."
                  }
                  style={{ ...inputStyle, paddingRight: 40 }}
                />
                <Key
                  size={15}
                  color="var(--theme-text-muted, #a1a1aa)"
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}
                />
              </div>
            </div>
          )}

          {/* Model Selector */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Model Engine</label>
              {settings.provider !== "heuristic" && (
                <button
                  type="button"
                  onClick={() => setIsCustomModel(!isCustomModel)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#818cf8",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {isCustomModel ? "← Choose Preset" : "Enter Custom Model"}
                </button>
              )}
            </div>

            {isCustomModel && settings.provider !== "heuristic" ? (
              <div>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => {
                    setSettings({ ...settings, model: e.target.value });
                    setTestResult(null);
                  }}
                  placeholder="e.g. gemini-1.5-flash, llama-3.3-70b-versatile, etc."
                  style={inputStyle}
                />
                <div style={{ fontSize: 10, color: "var(--theme-text-muted, #a1a1aa)", marginTop: 4 }}>
                  Enter any valid model ID supported by your {settings.provider === "gemini" ? "Google AI" : settings.provider === "groq" ? "Groq" : "OpenRouter"} account.
                </div>
              </div>
            ) : (
              <select
                value={settings.model}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setIsCustomModel(true);
                  } else {
                    setSettings({ ...settings, model: e.target.value });
                    setTestResult(null);
                  }
                }}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {(PROVIDER_MODELS[settings.provider] || []).map((m) => (
                  <option key={m.id} value={m.id} style={{ background: "#18181b", color: "#fff" }}>
                    {m.name}
                  </option>
                ))}
                {settings.provider !== "heuristic" && (
                  <option value="__custom__" style={{ background: "#18181b", color: "#818cf8" }}>
                    + Custom Model ID...
                  </option>
                )}
              </select>
            )}
          </div>

          {/* Test Connection Banner */}
          {testResult && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                marginBottom: 16,
                background: testResult.success ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${testResult.success ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                color: testResult.success ? "#4ade80" : "#f87171",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {testResult.success ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || (settings.provider !== "heuristic" && !settings.apiKey)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 16px",
                borderRadius: 10,
                border: "1px solid var(--theme-card-border, rgba(255,255,255,0.15))",
                background: "rgba(255,255,255,0.05)",
                color: "var(--color-zinc-50, #f4f4f5)",
                fontSize: 12,
                fontWeight: 600,
                cursor: testing ? "wait" : "pointer",
                opacity: settings.provider !== "heuristic" && !settings.apiKey ? 0.5 : 1,
              }}
            >
              <RefreshCw size={13} style={testing ? { animation: "spin 1s linear infinite" } : {}} />
              {testing ? "Testing..." : "Test Connection"}
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "9px 18px",
                  borderRadius: 10,
                  border: "1px solid var(--theme-card-border, rgba(255,255,255,0.1))",
                  background: "transparent",
                  color: "var(--theme-text-muted, #a1a1aa)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  padding: "9px 22px",
                  borderRadius: 10,
                  border: "none",
                  background: savedSuccess ? "#22c55e" : "#6366f1",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s",
                }}
              >
                {savedSuccess ? (
                  <>
                    <CheckCircle2 size={14} /> Saved!
                  </>
                ) : (
                  "Save Settings"
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
