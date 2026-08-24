import React, { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  Plus,
  Trash2,
  RefreshCw,
  Activity,
  Cpu,
  Network,
  Shield,
  ChevronDown,
  ChevronRight,
  Gauge,
  Zap,
  Globe,
  Box,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ArrowRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  getSlices,
  createSlice,
  deleteSlice,
  getTopologyInfo,
  getAllMeterStats,
  SLICE_TEMPLATES,
} from "../api/slicingService";

// ─── Constants ───────────────────────────────────────────────────────────────

const SELECTOR_TYPES = [
  { value: "IPV4_DST", label: "Destination IP (IPv4)" },
  { value: "IPV4_SRC", label: "Source IP (IPv4)" },
  { value: "IP_PROTO", label: "IP Protocol" },
];

const UNIT_OPTIONS = [
  { value: "KB_PER_SEC", label: "KB/s" },
  { value: "PKTS_PER_SEC", label: "Packets/s" },
];

const SLICE_COLORS = [
  "#6366f1",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#a855f7",
  "#f97316",
  "#06b6d4",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatRate(kbps) {
  if (kbps >= 1000000) return (kbps / 1000000).toFixed(1) + " GB/s";
  if (kbps >= 1000) return (kbps / 1000).toFixed(1) + " MB/s";
  return kbps + " KB/s";
}

function formatDuration(seconds) {
  if (!seconds) return "0s";
  if (seconds < 60) return seconds + "s";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m " + (seconds % 60) + "s";
  return Math.floor(seconds / 3600) + "h " + Math.floor((seconds % 3600) / 60) + "m";
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const configs = {
    ACTIVE: { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.3)", color: "#22c55e", icon: CheckCircle2, label: "Active" },
    PENDING: { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.3)", color: "#f59e0b", icon: Activity, label: "Pending" },
    ERROR: { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)", color: "#ef4444", icon: XCircle, label: "Error" },
  };
  const c = configs[status] || configs.PENDING;
  const Icon = c.icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
      borderRadius: 20, background: c.bg, border: `1px solid ${c.border}`, color: c.color,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
    }}>
      <Icon size={12} /> {c.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "#6366f1" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "var(--theme-card)",
        border: "1px solid var(--theme-card-border)",
        borderRadius: 16,
        padding: "20px 22px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        minWidth: 0,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${color}18`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Icon size={20} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--theme-text-muted)", fontWeight: 500, marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-zinc-50)", lineHeight: 1.1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginTop: 2 }}>{sub}</div>
        )}
      </div>
    </motion.div>
  );
}

function MessageBanner({ message, type = "info", onClose }) {
  if (!message) return null;
  const configs = {
    success: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)", color: "#34d399", icon: "✓" },
    error: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", color: "#f87171", icon: "⚠" },
    info: { bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.25)", color: "#818cf8", icon: "ℹ" },
  };
  const c = configs[type] || configs.info;
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      style={{
        padding: "12px 18px", borderRadius: 12, background: c.bg,
        border: `1px solid ${c.border}`, color: c.color, fontSize: 13,
        display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
      }}
    >
      <span style={{ fontSize: 16 }}>{c.icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 14, padding: 0 }}
        >
          ✕
        </button>
      )}
    </motion.div>
  );
}

// ─── Slice Card ──────────────────────────────────────────────────────────────

function SliceCard({ slice, onDelete, onToggle, isExpanded }) {
  const totalBytes = useMemo(() => {
    return (slice.devices || []).reduce((sum, d) => sum + (d.meterStats?.bytes || 0), 0);
  }, [slice.devices]);

  const totalPackets = useMemo(() => {
    return (slice.devices || []).reduce((sum, d) => sum + (d.meterStats?.packets || 0), 0);
  }, [slice.devices]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{
        background: "var(--theme-card)",
        border: "1px solid var(--theme-card-border)",
        borderRadius: 16,
        overflow: "hidden",
        borderLeft: `4px solid ${slice.color || "#6366f1"}`,
      }}
    >
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "16px 20px",
          cursor: "pointer",
          gap: 14,
          userSelect: "none",
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${slice.color || "#6366f1"}20`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, flexShrink: 0,
        }}>
          <Layers size={18} color={slice.color || "#6366f1"} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-zinc-50)" }}>
              {slice.name}
            </span>
            <StatusBadge status={slice.status} />
          </div>
          {slice.description && (
            <div style={{ fontSize: 12, color: "var(--theme-text-muted)", marginTop: 3 }}>
              {slice.description}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-zinc-50)" }}>
              {formatRate(slice.bandwidth)}
            </div>
            <div style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>
              {slice.devices?.length || 0} device{(slice.devices?.length || 0) !== 1 ? "s" : ""}
            </div>
          </div>
          {isExpanded ? <ChevronDown size={16} color="var(--theme-text-muted)" /> : <ChevronRight size={16} color="var(--theme-text-muted)" />}
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{
              borderTop: "1px solid var(--theme-card-border)",
              padding: "16px 20px",
            }}>
              {/* Slice stats row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}>
                <div style={{
                  background: "var(--theme-bg)",
                  border: "1px solid var(--theme-card-border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 10, color: "var(--theme-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Total Traffic
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-zinc-50)", marginTop: 2 }}>
                    {formatBytes(totalBytes)}
                  </div>
                </div>
                <div style={{
                  background: "var(--theme-bg)",
                  border: "1px solid var(--theme-card-border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 10, color: "var(--theme-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Packets Processed
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-zinc-50)", marginTop: 2 }}>
                    {totalPackets.toLocaleString()}
                  </div>
                </div>
                <div style={{
                  background: "var(--theme-bg)",
                  border: "1px solid var(--theme-card-border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 10, color: "var(--theme-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Priority
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-zinc-50)", marginTop: 2 }}>
                    {slice.priority}
                  </div>
                </div>
                <div style={{
                  background: "var(--theme-bg)",
                  border: "1px solid var(--theme-card-border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 10, color: "var(--theme-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Selector
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-zinc-50)", marginTop: 4, fontFamily: "monospace" }}>
                    {slice.selectorType}: {slice.selectorValue}
                  </div>
                </div>
              </div>

              {/* Per-device table */}
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                Device Breakdown
              </div>
              <div style={{
                background: "var(--theme-bg)",
                border: "1px solid var(--theme-card-border)",
                borderRadius: 12,
                overflow: "hidden",
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--theme-card-border)" }}>
                      {["Device ID", "Meter ID", "Flow ID", "Bytes", "Packets", "State"].map((h) => (
                        <th key={h} style={{
                          padding: "10px 14px", textAlign: "left",
                          color: "var(--theme-text-muted)", fontWeight: 600,
                          fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(slice.devices || []).map((dev, i) => (
                      <tr key={i} style={{ borderBottom: i < slice.devices.length - 1 ? "1px solid var(--theme-card-border)" : "none" }}>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "var(--color-zinc-50)", fontWeight: 500 }}>
                          {dev.deviceId}
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--color-zinc-50)" }}>{dev.meterId ?? "—"}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "var(--theme-text-muted)", fontSize: 10, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {dev.flowId ?? "—"}
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--color-zinc-50)" }}>
                          {dev.meterStats ? formatBytes(dev.meterStats.bytes) : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--color-zinc-50)" }}>
                          {dev.meterStats ? dev.meterStats.packets.toLocaleString() : "—"}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {dev.meterStats?.state ? (
                            <StatusBadge status={dev.meterStats.state === "ADDED" ? "ACTIVE" : "PENDING"} />
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                <div style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                  Created: {slice.createdAt ? new Date(slice.createdAt).toLocaleString() : "Unknown"}
                  {slice.vlanId && <span> · VLAN: {slice.vlanId}</span>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(slice.id); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                    color: "#f87171", padding: "7px 14px", borderRadius: 8,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.target.style.background = "rgba(239,68,68,0.2)"; }}
                  onMouseLeave={(e) => { e.target.style.background = "rgba(239,68,68,0.1)"; }}
                >
                  <Trash2 size={13} /> Delete Slice
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Create Slice Modal ──────────────────────────────────────────────────────

function CreateSliceModal({ isOpen, onClose, onSubmit, devices, loading }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    bandwidth: 5000,
    burstSize: 1000,
    unit: "KB_PER_SEC",
    priority: 40000,
    selectorType: "IPV4_DST",
    selectorValue: "10.0.0.0/24",
    color: SLICE_COLORS[0],
    vlanId: "",
    selectedDevices: [],
  });

  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const applyTemplate = (template) => {
    setSelectedTemplate(template.id);
    setForm((prev) => ({
      ...prev,
      name: template.name,
      description: template.description,
      bandwidth: template.bandwidth,
      burstSize: template.burstSize || Math.round(template.bandwidth * 0.2),
      unit: template.unit,
      priority: template.priority,
      color: template.color,
    }));
  };

  const toggleDevice = (deviceId) => {
    setForm((prev) => ({
      ...prev,
      selectedDevices: prev.selectedDevices.includes(deviceId)
        ? prev.selectedDevices.filter((d) => d !== deviceId)
        : [...prev.selectedDevices, deviceId],
    }));
  };

  const selectAllDevices = () => {
    if (form.selectedDevices.length === devices.length) {
      setForm((prev) => ({ ...prev, selectedDevices: [] }));
    } else {
      setForm((prev) => ({ ...prev, selectedDevices: devices.map((d) => d.id) }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      bandwidth: Number(form.bandwidth),
      burstSize: Number(form.burstSize),
      priority: Number(form.priority),
      vlanId: form.vlanId ? Number(form.vlanId) : null,
      targetDevices: form.selectedDevices.map((id) => ({ id })),
    });
  };

  if (!isOpen) return null;

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid var(--theme-input-border)",
    background: "var(--theme-input-bg)",
    color: "var(--color-zinc-50)",
    fontSize: 13,
    outline: "none",
    transition: "border-color 0.15s",
    fontFamily: "inherit",
  };

  const labelStyle = {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--theme-text-muted)",
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
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--theme-card)",
          border: "1px solid var(--theme-card-border)",
          borderRadius: 20,
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
        }}
      >
        {/* Modal header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid var(--theme-card-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "rgba(99,102,241,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Plus size={20} color="#6366f1" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-zinc-50)" }}>Create Network Slice</div>
              <div style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>Configure bandwidth, traffic selector, and target devices</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--theme-text-muted)",
              cursor: "pointer", fontSize: 20, padding: 4, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px" }}>
          {/* Templates */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Quick Templates</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
              {SLICE_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${selectedTemplate === t.id ? t.color : "var(--theme-card-border)"}`,
                    background: selectedTemplate === t.id ? `${t.color}15` : "var(--theme-bg)",
                    color: "var(--color-zinc-50)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{t.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{t.name.split("(")[0].trim()}</div>
                  <div style={{ fontSize: 10, color: "var(--theme-text-muted)", marginTop: 2 }}>
                    {formatRate(t.bandwidth)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Name & Description */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Slice Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Critical Infrastructure"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Color</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SLICE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: c,
                      border: form.color === c ? "2px solid #fff" : "2px solid transparent",
                      cursor: "pointer",
                      transition: "border-color 0.15s",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
              style={inputStyle}
            />
          </div>

          {/* Bandwidth & QoS */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14,
            marginBottom: 14,
          }}>
            <div>
              <label style={labelStyle}>Bandwidth Rate *</label>
              <input
                type="number"
                value={form.bandwidth}
                onChange={(e) => setForm({ ...form, bandwidth: e.target.value })}
                min="1"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Burst Size</label>
              <input
                type="number"
                value={form.burstSize}
                onChange={(e) => setForm({ ...form, burstSize: e.target.value })}
                min="0"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Unit</label>
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                min="1"
                max="65535"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Traffic Selector */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1.5fr 0.8fr", gap: 14,
            marginBottom: 14,
          }}>
            <div>
              <label style={labelStyle}>Selector Type</label>
              <select
                value={form.selectorType}
                onChange={(e) => setForm({ ...form, selectorType: e.target.value })}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {SELECTOR_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Selector Value *</label>
              <input
                type="text"
                value={form.selectorValue}
                onChange={(e) => setForm({ ...form, selectorValue: e.target.value })}
                placeholder="e.g. 10.0.0.0/24"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>VLAN ID (optional)</label>
              <input
                type="number"
                value={form.vlanId}
                onChange={(e) => setForm({ ...form, vlanId: e.target.value })}
                placeholder="e.g. 100"
                min="1"
                max="4094"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Target Devices */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Target Devices *</label>
              {devices.length > 0 && (
                <button
                  type="button"
                  onClick={selectAllDevices}
                  style={{
                    background: "none", border: "none", color: "#6366f1",
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {form.selectedDevices.length === devices.length ? "Deselect All" : "Select All"}
                </button>
              )}
            </div>
            {devices.length === 0 ? (
              <div style={{
                padding: "16px",
                borderRadius: 10,
                border: "1px solid rgba(245,158,11,0.25)",
                background: "rgba(245,158,11,0.08)",
                color: "#f59e0b",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <AlertTriangle size={14} />
                No devices discovered by ONOS. Connect switches to the controller.
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 8,
                maxHeight: 180,
                overflow: "auto",
              }}>
                {devices.map((d) => {
                  const isSelected = form.selectedDevices.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDevice(d.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: `1px solid ${isSelected ? "#6366f1" : "var(--theme-card-border)"}`,
                        background: isSelected ? "rgba(99,102,241,0.1)" : "var(--theme-bg)",
                        color: "var(--color-zinc-50)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 4,
                        border: `2px solid ${isSelected ? "#6366f1" : "var(--theme-text-muted)"}`,
                        background: isSelected ? "#6366f1" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                        transition: "all 0.15s",
                      }}>
                        {isSelected && <CheckCircle2 size={12} color="#fff" />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace" }}>
                          {d.id}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>
                          {d.available ? "Online" : "Offline"} · {d.hw || d.type || "Switch"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bandwidth preview */}
          <div style={{
            background: "var(--theme-bg)",
            border: "1px solid var(--theme-card-border)",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <Info size={16} color="#6366f1" />
            <div style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>
              This slice will rate-limit traffic matching{" "}
              <span style={{ color: "var(--color-zinc-50)", fontWeight: 600, fontFamily: "monospace" }}>
                {form.selectorType}: {form.selectorValue}
              </span>{" "}
              to{" "}
              <span style={{ color: form.color, fontWeight: 700 }}>
                {formatRate(Number(form.bandwidth))}
              </span>{" "}
              on {form.selectedDevices.length} device{form.selectedDevices.length !== 1 ? "s" : ""}.
              {form.vlanId && (
                <span> Traffic will be tagged with <span style={{ fontWeight: 600 }}>VLAN {form.vlanId}</span>.</span>
              )}
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 20px", borderRadius: 10,
                border: "1px solid var(--theme-card-border)",
                background: "transparent",
                color: "var(--theme-text-muted)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || form.selectedDevices.length === 0}
              style={{
                padding: "10px 24px", borderRadius: 10,
                border: "none",
                background: loading ? "#4f46e5" : "#6366f1",
                color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: loading ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: 8,
                opacity: form.selectedDevices.length === 0 ? 0.5 : 1,
                transition: "all 0.15s",
              }}
            >
              {loading ? (
                <>
                  <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                  Creating...
                </>
              ) : (
                <>
                  <Layers size={14} /> Create Slice
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function NetworkSlicing() {
  const [slices, setSlices] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedSlice, setExpandedSlice] = useState(null);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("info");
  const [meterStats, setMeterStats] = useState([]);

  const showMessage = useCallback((msg, type = "info") => {
    setMessage(msg);
    setMessageType(type);
    if (type !== "error") {
      setTimeout(() => setMessage(null), 5000);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [slicesData, topoData, statsData] = await Promise.all([
        getSlices().catch(() => []),
        getTopologyInfo().catch(() => ({ devices: [], links: [], hosts: [] })),
        getAllMeterStats().catch(() => []),
      ]);
      setSlices(slicesData);
      setDevices(topoData.devices || []);
      setMeterStats(statsData);
    } catch (err) {
      showMessage("Failed to load slicing data: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [slicesData, statsData] = await Promise.all([
          getSlices().catch(() => slices),
          getAllMeterStats().catch(() => meterStats),
        ]);
        setSlices(slicesData);
        setMeterStats(statsData);
      } catch {
        // silent
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [slices, meterStats]);

  const handleCreate = useCallback(async (config) => {
    setCreating(true);
    try {
      const newSlice = await createSlice(config);
      showMessage(`Slice "${newSlice.name}" created successfully with ${newSlice.devices.length} device(s)`, "success");
      setShowCreate(false);
      await loadData();
    } catch (err) {
      showMessage("Failed to create slice: " + err.message, "error");
    } finally {
      setCreating(false);
    }
  }, [loadData, showMessage]);

  const handleDelete = useCallback(async (sliceId) => {
    const slice = slices.find((s) => s.id === sliceId);
    if (!slice) return;
    if (!window.confirm(`Delete slice "${slice.name}"? This will remove meters and flow rules from all devices.`)) return;

    try {
      const result = await deleteSlice(sliceId);
      if (result.warnings?.length > 0) {
        showMessage(`Slice deleted with warnings: ${result.warnings.join("; ")}`, "info");
      } else {
        showMessage(`Slice "${slice.name}" deleted successfully`, "success");
      }
      await loadData();
    } catch (err) {
      showMessage("Failed to delete slice: " + err.message, "error");
    }
  }, [slices, loadData, showMessage]);

  // ─── Computed stats ──────────────────────────────────────────────────────

  const totalBandwidth = useMemo(() => {
    return slices.reduce((sum, s) => sum + (s.bandwidth || 0), 0);
  }, [slices]);

  const totalMeters = useMemo(() => {
    return slices.reduce((sum, s) => sum + (s.devices?.length || 0), 0);
  }, [slices]);

  const bandwidthChartData = useMemo(() => {
    return slices.map((s) => ({
      name: s.name.length > 18 ? s.name.slice(0, 18) + "…" : s.name,
      bandwidth: s.bandwidth,
      fill: s.color,
    }));
  }, [slices]);

  const pieData = useMemo(() => {
    if (slices.length === 0) return [];
    return slices.map((s) => ({
      name: s.name.length > 14 ? s.name.slice(0, 14) + "…" : s.name,
      value: s.bandwidth,
      color: s.color,
    }));
  }, [slices]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 24,
        flexWrap: "wrap",
        gap: 14,
      }}>
        <div>
          <h1 style={{
            fontSize: 26, fontWeight: 800, color: "var(--color-zinc-50)",
            margin: 0, display: "flex", alignItems: "center", gap: 10,
          }}>
            <Layers size={26} color="#6366f1" />
            Network Slicing
          </h1>
          <p style={{ fontSize: 13, color: "var(--theme-text-muted)", margin: "4px 0 0 36px" }}>
            Create and manage bandwidth-isolated network slices via ONOS meters and flow rules
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={loadData}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 16px", borderRadius: 10,
              border: "1px solid var(--theme-card-border)",
              background: "var(--theme-card)",
              color: "var(--color-zinc-50)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 10,
              border: "none",
              background: "#6366f1",
              color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.target.style.background = "#4f46e5")}
            onMouseLeave={(e) => (e.target.style.background = "#6366f1")}
          >
            <Plus size={15} /> New Slice
          </button>
        </div>
      </div>

      {/* Messages */}
      <AnimatePresence>
        {message && (
          <MessageBanner
            message={message}
            type={messageType}
            onClose={() => setMessage(null)}
          />
        )}
      </AnimatePresence>

      {/* Stats Row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 14,
        marginBottom: 24,
      }}>
        <StatCard
          icon={Layers}
          label="Active Slices"
          value={slices.length}
          sub={`${devices.length} devices available`}
          color="#6366f1"
        />
        <StatCard
          icon={Gauge}
          label="Total Bandwidth Allocated"
          value={formatRate(totalBandwidth)}
          sub={`Across ${totalMeters} meter(s)`}
          color="#22c55e"
        />
        <StatCard
          icon={Activity}
          label="Live Meters"
          value={meterStats.length}
          sub="Deployed on switches"
          color="#f59e0b"
        />
        <StatCard
          icon={Shield}
          label="Isolation Method"
          value="Meter + Flow"
          sub="OpenFlow 1.3 policing"
          color="#3b82f6"
        />
      </div>

      {/* Charts + Slice List Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, marginBottom: 24 }}>
        {/* Slice list */}
        <div>
          <div style={{
            fontSize: 14, fontWeight: 700, color: "var(--color-zinc-50)",
            marginBottom: 12, display: "flex", alignItems: "center", gap: 8,
          }}>
            <Network size={16} color="#6366f1" />
            Configured Slices
          </div>

          {loading ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: 60, gap: 12,
              background: "var(--theme-card)",
              border: "1px solid var(--theme-card-border)",
              borderRadius: 16,
            }}>
              <RefreshCw size={24} color="#6366f1" style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ fontSize: 13, color: "var(--theme-text-muted)" }}>Loading slices...</div>
            </div>
          ) : slices.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "50px 30px", gap: 14,
              background: "var(--theme-card)",
              border: "1px solid var(--theme-card-border)",
              borderRadius: 16,
              textAlign: "center",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: "rgba(99,102,241,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Layers size={28} color="#6366f1" />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-zinc-50)" }}>
                No Network Slices
              </div>
              <div style={{ fontSize: 12, color: "var(--theme-text-muted)", maxWidth: 300 }}>
                Create your first network slice to enforce bandwidth policies and traffic isolation on your ONOS-managed switches.
              </div>
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 20px", borderRadius: 10,
                  border: "none", background: "#6366f1", color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  marginTop: 4,
                }}
              >
                <Plus size={14} /> Create First Slice
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <AnimatePresence>
                {slices.map((slice) => (
                  <SliceCard
                    key={slice.id}
                    slice={slice}
                    onDelete={handleDelete}
                    isExpanded={expandedSlice === slice.id}
                    onToggle={() =>
                      setExpandedSlice(expandedSlice === slice.id ? null : slice.id)
                    }
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Charts sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Pie chart */}
          <div style={{
            background: "var(--theme-card)",
            border: "1px solid var(--theme-card-border)",
            borderRadius: 16,
            padding: "18px 20px",
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: "var(--color-zinc-50)",
              marginBottom: 12, display: "flex", alignItems: "center", gap: 6,
            }}>
              <Gauge size={14} color="#6366f1" /> Bandwidth Distribution
            </div>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--theme-card)",
                      border: "1px solid var(--theme-card-border)",
                      borderRadius: 10,
                      fontSize: 11,
                      color: "var(--color-zinc-50)",
                    }}
                    formatter={(value) => formatRate(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{
                height: 180, display: "flex", alignItems: "center",
                justifyContent: "center", color: "var(--theme-text-muted)", fontSize: 12,
              }}>
                No slices configured
              </div>
            )}

            {/* Legend */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {pieData.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                  <span style={{ color: "var(--color-zinc-50)", flex: 1 }}>{d.name}</span>
                  <span style={{ color: "var(--theme-text-muted)", fontWeight: 600 }}>
                    {formatRate(d.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bar chart */}
          <div style={{
            background: "var(--theme-card)",
            border: "1px solid var(--theme-card-border)",
            borderRadius: 16,
            padding: "18px 20px",
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: "var(--color-zinc-50)",
              marginBottom: 12, display: "flex", alignItems: "center", gap: 6,
            }}>
              <Activity size={14} color="#22c55e" /> Bandwidth per Slice
            </div>
            {bandwidthChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={bandwidthChartData} barCategoryGap="20%">
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "var(--theme-text-muted)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--theme-text-muted)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatRate(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--theme-card)",
                      border: "1px solid var(--theme-card-border)",
                      borderRadius: 10,
                      fontSize: 11,
                      color: "var(--color-zinc-50)",
                    }}
                    formatter={(value) => formatRate(value)}
                  />
                  <Bar dataKey="bandwidth" radius={[6, 6, 0, 0]}>
                    {bandwidthChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{
                height: 180, display: "flex", alignItems: "center",
                justifyContent: "center", color: "var(--theme-text-muted)", fontSize: 12,
              }}>
                No slices configured
              </div>
            )}
          </div>

          {/* Topology info mini-card */}
          <div style={{
            background: "var(--theme-card)",
            border: "1px solid var(--theme-card-border)",
            borderRadius: 16,
            padding: "16px 20px",
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: "var(--color-zinc-50)",
              marginBottom: 10, display: "flex", alignItems: "center", gap: 6,
            }}>
              <Cpu size={14} color="#f59e0b" /> ONOS Infrastructure
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--theme-text-muted)" }}>Devices Online</span>
                <span style={{ color: "var(--color-zinc-50)", fontWeight: 700 }}>{devices.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--theme-text-muted)" }}>Active Meters</span>
                <span style={{ color: "var(--color-zinc-50)", fontWeight: 700 }}>{meterStats.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--theme-text-muted)" }}>OpenFlow Version</span>
                <span style={{ color: "#22c55e", fontWeight: 700 }}>1.3</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--theme-text-muted)" }}>Meter Support</span>
                <span style={{ color: "#22c55e", fontWeight: 700 }}>✓ Available</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Slice Modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateSliceModal
            isOpen={showCreate}
            onClose={() => setShowCreate(false)}
            onSubmit={handleCreate}
            devices={devices}
            loading={creating}
          />
        )}
      </AnimatePresence>

      {/* CSS for spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
