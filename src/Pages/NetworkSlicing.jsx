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
  Monitor,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  UserPlus,
  Radio,
  Zap,
  Globe,
  Box,
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
  isHostInAnySlice,
  SLICE_TEMPLATES,
  getNetworkCapacity,
  setNetworkCapacity,
  DEFAULT_TOTAL_CAPACITY_KBPS,
} from "../api/slicingService";
import SliceTopology from "../Components/SliceTopology";
import AiIntentPanel from "../Components/IntentSlicing/AiIntentPanel";
import { useNotifications } from "../context/NotificationContext";

// ─── Constants ───────────────────────────────────────────────────────────────

const SLICE_COLORS = [
  "#6366f1", "#ef4444", "#22c55e", "#f59e0b", "#3b82f6",
  "#ec4899", "#14b8a6", "#a855f7", "#f97316", "#06b6d4",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
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

function getHostDisplayName(host) {
  const ips = host.ipAddresses || host.ips || [];
  const ip = ips.find((i) => !i.includes(":")) || ips[0]; // prefer IPv4
  if (ip) return ip;
  return host.mac || host.id || "Unknown";
}

function getHostShortMac(mac) {
  if (!mac) return "??:??";
  const parts = mac.split(":");
  return parts.slice(-2).join(":");
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
        background: "var(--theme-card)", border: "1px solid var(--theme-card-border)",
        borderRadius: 16, padding: "20px 22px",
        display: "flex", alignItems: "center", gap: 16, minWidth: 0,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: `${color}18`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={20} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--theme-text-muted)", fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-zinc-50)", lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginTop: 2 }}>{sub}</div>}
      </div>
    </motion.div>
  );
}

function MessageBanner({ message, type = "info", onClose }) {
  if (!message) return null;
  const configs = {
    success: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)", color: "#34d399", icon: CheckCircle2 },
    error: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", color: "#f87171", icon: AlertTriangle },
    info: { bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.25)", color: "#818cf8", icon: Info },
  };
  const c = configs[type] || configs.info;
  const IconComponent = c.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      style={{
        padding: "12px 18px", borderRadius: 12, background: c.bg,
        border: `1px solid ${c.border}`, color: c.color, fontSize: 13,
        display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
      }}
    >
      <IconComponent size={16} color={c.color} />
      <span style={{ flex: 1 }}>{message}</span>
      {onClose && (
        <button onClick={onClose} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
      )}
    </motion.div>
  );
}

// ─── Host Chip (used inside slice cards) ─────────────────────────────────────

function HostChip({ host, sliceColor }) {
  const name = getHostDisplayName(host);
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 12px", borderRadius: 10,
      background: `${sliceColor}12`, border: `1px solid ${sliceColor}30`,
      fontSize: 12, color: "var(--color-zinc-50)",
    }}>
      <Monitor size={13} color={sliceColor} />
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span style={{ fontSize: 10, color: "var(--theme-text-muted)", fontFamily: "monospace" }}>
        {getHostShortMac(host.mac)}
      </span>
    </div>
  );
}

// ─── Slice Card ──────────────────────────────────────────────────────────────

function SliceCard({ slice, onDelete, onToggle, isExpanded }) {
  const totalBytes = useMemo(() => {
    return (slice.hosts || []).reduce((sum, h) => sum + (h.meterStats?.bytes || 0), 0);
  }, [slice.hosts]);

  const totalPackets = useMemo(() => {
    return (slice.hosts || []).reduce((sum, h) => sum + (h.meterStats?.packets || 0), 0);
  }, [slice.hosts]);

  const hostCount = slice.hosts?.length || 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{
        background: "var(--theme-card)", border: "1px solid var(--theme-card-border)",
        borderRadius: 16, overflow: "hidden",
        borderLeft: `4px solid ${slice.color || "#6366f1"}`,
      }}
    >
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", padding: "16px 20px",
          cursor: "pointer", gap: 14, userSelect: "none",
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
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-zinc-50)" }}>{slice.name}</span>
            <StatusBadge status={slice.status} />
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
              background: `${slice.color}20`, color: slice.color, letterSpacing: 0.5,
            }}>
              VLAN {slice.vlanId}
            </span>
            {(slice.template === "urllc" || slice.type === "low-latency" || slice.dscp === 46) && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                background: "rgba(239,68,68,0.2)", color: "#ef4444", letterSpacing: 0.5,
                border: "1px solid rgba(239,68,68,0.3)",
              }}>
                ⚡ DSCP 46 • Queue 0 (60M)
              </span>
            )}
          </div>
          {slice.description && (
            <div style={{ fontSize: 12, color: "var(--theme-text-muted)", marginTop: 3 }}>{slice.description}</div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-zinc-50)" }}>{formatRate(slice.bandwidth)}</div>
            <div style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>{hostCount} host{hostCount !== 1 ? "s" : ""}</div>
          </div>
          {isExpanded ? <ChevronDown size={16} color="var(--theme-text-muted)" /> : <ChevronRight size={16} color="var(--theme-text-muted)" />}
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ borderTop: "1px solid var(--theme-card-border)", padding: "16px 20px" }}>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Total Traffic", value: formatBytes(totalBytes) },
                  { label: "Packets", value: totalPackets.toLocaleString() },
                  { label: "VLAN ID", value: slice.vlanId },
                  { label: "Bandwidth Cap", value: formatRate(slice.bandwidth) },
                ].map((s) => (
                  <div key={s.label} style={{
                    background: "var(--theme-bg)", border: "1px solid var(--theme-card-border)",
                    borderRadius: 12, padding: "12px 14px",
                  }}>
                    <div style={{ fontSize: 10, color: "var(--theme-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>{s.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-zinc-50)", marginTop: 2 }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Hosts in this slice */}
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                Hosts in this Slice
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {(slice.hosts || []).map((h, i) => (
                  <HostChip key={i} host={h} sliceColor={slice.color} />
                ))}
              </div>

              {/* Per-host table */}
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                Per-Host Details
              </div>
              <div style={{
                background: "var(--theme-bg)", border: "1px solid var(--theme-card-border)",
                borderRadius: 12, overflow: "hidden",
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--theme-card-border)" }}>
                      {["Host (IP)", "MAC Address", "Switch", "Port", "Meter", "Bytes", "State"].map((h) => (
                        <th key={h} style={{
                          padding: "10px 14px", textAlign: "left", color: "var(--theme-text-muted)",
                          fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(slice.hosts || []).map((host, i) => (
                      <tr key={i} style={{ borderBottom: i < slice.hosts.length - 1 ? "1px solid var(--theme-card-border)" : "none" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--color-zinc-50)" }}>
                          {getHostDisplayName(host)}
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "var(--theme-text-muted)", fontSize: 11 }}>
                          {host.mac}
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "var(--color-zinc-50)", fontSize: 11 }}>
                          {host.deviceId}
                        </td>
                        <td style={{ padding: "10px 14px", color: "var(--color-zinc-50)" }}>{host.port}</td>
                        <td style={{ padding: "10px 14px", color: "var(--color-zinc-50)" }}>{host.meterId ?? "—"}</td>
                        <td style={{ padding: "10px 14px", color: "var(--color-zinc-50)" }}>
                          {host.meterStats ? formatBytes(host.meterStats.bytes) : "—"}
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {host.meterStats?.state
                            ? <StatusBadge status={host.meterStats.state === "ADDED" ? "ACTIVE" : "PENDING"} />
                            : "—"
                          }
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
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(slice.id); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                    color: "#f87171", padding: "7px 14px", borderRadius: 8,
                    fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
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

function CreateSliceModal({
  isOpen,
  onClose,
  onSubmit,
  onosHosts,
  loading,
  totalCapacity = 100000,
  totalAllocatedBandwidth = 0,
  remainingCapacity = 100000,
  initialData = null,
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    bandwidth: 5000,
    burstSize: 1000,
    unit: "KB_PER_SEC",
    color: SLICE_COLORS[0],
    vlanId: "",
    selectedHostIds: [],
  });
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setForm({
          name: initialData.name || "",
          description: initialData.description || "",
          bandwidth: initialData.bandwidth || 5000,
          burstSize: initialData.burstSize || Math.round((initialData.bandwidth || 5000) * 0.2),
          unit: initialData.unit || "KB_PER_SEC",
          color: initialData.color || SLICE_COLORS[0],
          vlanId: initialData.vlanId || "",
          selectedHostIds: initialData.selectedHostIds || [],
        });
      } else {
        setForm({
          name: "",
          description: "",
          bandwidth: 5000,
          burstSize: 1000,
          unit: "KB_PER_SEC",
          color: SLICE_COLORS[0],
          vlanId: "",
          selectedHostIds: [],
        });
      }
    }
  }, [isOpen, initialData]);

  const requestedBandwidth = Number(form.bandwidth) || 0;
  const isOverCapacity = requestedBandwidth > remainingCapacity;

  const applyTemplate = (template) => {
    setSelectedTemplate(template.id);
    setForm((prev) => ({
      ...prev,
      name: template.name,
      description: template.description,
      bandwidth: template.bandwidth,
      burstSize: template.burstSize || Math.round(template.bandwidth * 0.2),
      unit: template.unit,
      color: template.color,
    }));
  };

  const toggleHost = (hostId) => {
    setForm((prev) => ({
      ...prev,
      selectedHostIds: prev.selectedHostIds.includes(hostId)
        ? prev.selectedHostIds.filter((h) => h !== hostId)
        : [...prev.selectedHostIds, hostId],
    }));
  };

  const selectAllHosts = () => {
    const available = onosHosts.filter((h) => !isHostInAnySlice(h.mac));
    if (form.selectedHostIds.length === available.length) {
      setForm((prev) => ({ ...prev, selectedHostIds: [] }));
    } else {
      setForm((prev) => ({ ...prev, selectedHostIds: available.map((h) => h.id || `${h.mac}/None`) }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isOverCapacity) return;
    const selectedHostObjects = onosHosts.filter((h) =>
      form.selectedHostIds.includes(h.id || `${h.mac}/None`)
    );
    onSubmit({
      ...form,
      bandwidth: Number(form.bandwidth),
      burstSize: Number(form.burstSize),
      vlanId: form.vlanId ? Number(form.vlanId) : null,
      selectedHosts: selectedHostObjects,
    });
  };

  if (!isOpen) return null;

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "1px solid var(--theme-input-border)", background: "var(--theme-input-bg)",
    color: "var(--color-zinc-50)", fontSize: 13, outline: "none",
    transition: "border-color 0.15s", fontFamily: "inherit",
  };

  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 600,
    color: "var(--theme-text-muted)", textTransform: "uppercase",
    letterSpacing: 0.8, marginBottom: 6,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--theme-card)", border: "1px solid var(--theme-card-border)",
          borderRadius: 20, width: "100%", maxWidth: 680,
          maxHeight: "90vh", overflow: "auto",
          boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid var(--theme-card-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, background: "rgba(99,102,241,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Plus size={20} color="#6366f1" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-zinc-50)" }}>Create Network Slice</div>
              <div style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>Assign hosts to an isolated virtual network with bandwidth controls</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--theme-text-muted)", cursor: "pointer", fontSize: 20, padding: 4, lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 24px" }}>
          {/* Templates */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Slice Type (Quick Templates)</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
              {SLICE_TEMPLATES.map((t) => {
                const IconComponent =
                  t.id === "embb" ? Radio :
                  t.id === "urllc" ? Zap :
                  t.id === "mmtc" ? Globe : Box;
                return (
                  <button key={t.id} type="button" onClick={() => applyTemplate(t)}
                    style={{
                      padding: "10px 12px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                      border: `1px solid ${selectedTemplate === t.id ? t.color : "var(--theme-card-border)"}`,
                      background: selectedTemplate === t.id ? `${t.color}15` : "var(--theme-bg)",
                      color: "var(--color-zinc-50)", transition: "all 0.15s",
                    }}
                  >
                    <div style={{
                      width: 26, height: 26, borderRadius: 6,
                      background: `${t.color}20`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 6,
                    }}>
                      <IconComponent size={14} color={t.color} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{t.name.split("(")[0].trim()}</div>
                    <div style={{ fontSize: 10, color: "var(--theme-text-muted)", marginTop: 2 }}>{formatRate(t.bandwidth)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name + Color */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Slice Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Hospital Monitoring" required style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Slice Color</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SLICE_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                    style={{
                      width: 28, height: 28, borderRadius: 8, background: c, cursor: "pointer",
                      border: form.color === c ? "2px solid #fff" : "2px solid transparent", transition: "border-color 0.15s",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Physical Bandwidth Pool & Admission Control Card */}
          <div style={{
            padding: "12px 16px", borderRadius: 12, marginBottom: 16,
            background: isOverCapacity ? "rgba(239, 68, 68, 0.1)" : "rgba(99, 102, 241, 0.08)",
            border: `1px solid ${isOverCapacity ? "rgba(239, 68, 68, 0.3)" : "rgba(99, 102, 241, 0.2)"}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: "var(--theme-text-muted)", fontWeight: 600 }}>Total Infrastructure Capacity:</span>
              <span style={{ color: "var(--color-zinc-50)", fontWeight: 700 }}>{formatRate(totalCapacity)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 8 }}>
              <span style={{ color: "var(--theme-text-muted)", fontWeight: 600 }}>Available Unallocated Pool:</span>
              <span style={{ color: remainingCapacity > 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                {formatRate(remainingCapacity)}
              </span>
            </div>
            {/* Visual allocation bar */}
            <div style={{ height: 6, borderRadius: 3, background: "rgba(255, 255, 255, 0.1)", overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${Math.min(100, (totalAllocatedBandwidth / totalCapacity) * 100)}%`, background: "#6366f1" }} />
              <div style={{ width: `${Math.min(100 - (totalAllocatedBandwidth / totalCapacity) * 100, (requestedBandwidth / totalCapacity) * 100)}%`, background: isOverCapacity ? "#ef4444" : form.color }} />
            </div>
            {isOverCapacity && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#f87171", fontSize: 11, fontWeight: 600, marginTop: 8 }}>
                <AlertTriangle size={13} />
                <span>Admission Control Alert: Requested {formatRate(requestedBandwidth)} exceeds remaining capacity ({formatRate(remainingCapacity)}).</span>
              </div>
            )}
          </div>

          {/* Bandwidth + VLAN */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Bandwidth Cap (KB/s) *</label>
              <input type="number" value={form.bandwidth} min="1" required
                onChange={(e) => setForm({ ...form, bandwidth: e.target.value })} style={inputStyle}
              />
              <div style={{ fontSize: 10, color: "var(--theme-text-muted)", marginTop: 4 }}>
                = {formatRate(Number(form.bandwidth) || 0)} max per host
              </div>
            </div>
            <div>
              <label style={labelStyle}>Burst Size (KB)</label>
              <input type="number" value={form.burstSize} min="0"
                onChange={(e) => setForm({ ...form, burstSize: e.target.value })} style={inputStyle}
              />
              <div style={{ fontSize: 10, color: "var(--theme-text-muted)", marginTop: 4 }}>
                Temporary spike allowance
              </div>
            </div>
            <div>
              <label style={labelStyle}>VLAN ID (auto if empty)</label>
              <input type="number" value={form.vlanId} min="1" max="4094"
                onChange={(e) => setForm({ ...form, vlanId: e.target.value })} placeholder="Auto" style={inputStyle}
              />
              <div style={{ fontSize: 10, color: "var(--theme-text-muted)", marginTop: 4 }}>
                Isolation tag (100–4094)
              </div>
            </div>
          </div>

          {/* Host Assignment */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                <UserPlus size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                Assign Hosts to this Slice *
              </label>
              {onosHosts.length > 0 && (
                <button type="button" onClick={selectAllHosts}
                  style={{ background: "none", border: "none", color: "#6366f1", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {form.selectedHostIds.length === onosHosts.filter((h) => !isHostInAnySlice(h.mac)).length ? "Deselect All" : "Select All Available"}
                </button>
              )}
            </div>

            {onosHosts.length === 0 ? (
              <div style={{
                padding: 20, borderRadius: 12, border: "1px solid rgba(245,158,11,0.25)",
                background: "rgba(245,158,11,0.08)", color: "#f59e0b", fontSize: 12,
                display: "flex", alignItems: "flex-start", gap: 10, lineHeight: 1.5,
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>No hosts discovered</div>
                  <div>ONOS hasn't discovered any hosts yet. Make sure hosts have sent traffic (e.g. run <code style={{ background: "rgba(0,0,0,0.2)", padding: "1px 5px", borderRadius: 4 }}>pingall</code> in Mininet) so the controller learns their locations.</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8, maxHeight: 240, overflow: "auto" }}>
                {onosHosts.map((host) => {
                  const hostId = host.id || `${host.mac}/None`;
                  const isSelected = form.selectedHostIds.includes(hostId);
                  const existingSlice = isHostInAnySlice(host.mac);
                  const isUnavailable = !!existingSlice;
                  const ips = host.ipAddresses || [];
                  const ip = ips.find((i) => !i.includes(":")) || ips[0] || "No IP";
                  const loc = host.locations?.[0] || host.location || {};

                  return (
                    <button
                      key={hostId} type="button"
                      onClick={() => !isUnavailable && toggleHost(hostId)}
                      disabled={isUnavailable}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "12px 14px", borderRadius: 12, textAlign: "left",
                        border: `1px solid ${isSelected ? "#6366f1" : isUnavailable ? "rgba(239,68,68,0.2)" : "var(--theme-card-border)"}`,
                        background: isSelected ? "rgba(99,102,241,0.1)" : isUnavailable ? "rgba(239,68,68,0.05)" : "var(--theme-bg)",
                        color: "var(--color-zinc-50)",
                        cursor: isUnavailable ? "not-allowed" : "pointer",
                        opacity: isUnavailable ? 0.5 : 1,
                        transition: "all 0.15s",
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${isSelected ? "#6366f1" : "var(--theme-text-muted)"}`,
                        background: isSelected ? "#6366f1" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s",
                      }}>
                        {isSelected && <CheckCircle2 size={12} color="#fff" />}
                      </div>

                      {/* Host icon */}
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: isSelected ? "rgba(99,102,241,0.2)" : "var(--theme-card)",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <Monitor size={15} color={isSelected ? "#6366f1" : "var(--theme-text-muted)"} />
                      </div>

                      {/* Host info */}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{ip}</div>
                        <div style={{ fontSize: 10, color: "var(--theme-text-muted)", fontFamily: "monospace" }}>
                          {host.mac}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>
                          {loc.elementId ? `${loc.elementId} port ${loc.port}` : "Unknown location"}
                        </div>
                        {isUnavailable && (
                          <div style={{ fontSize: 10, color: "#f87171", fontWeight: 600, marginTop: 2 }}>
                            Already in: {existingSlice.name}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary preview */}
          <div style={{
            background: "var(--theme-bg)", border: "1px solid var(--theme-card-border)",
            borderRadius: 12, padding: "14px 18px", marginBottom: 20,
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <Info size={16} color="#6366f1" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: "var(--theme-text-muted)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--color-zinc-50)" }}>{form.selectedHostIds.length}</strong> host{form.selectedHostIds.length !== 1 ? "s" : ""} will
              be placed in an isolated network with VLAN tag <strong style={{ color: form.color }}>{form.vlanId || "auto"}</strong>.
              Each host will be rate-limited to <strong style={{ color: form.color }}>{formatRate(Number(form.bandwidth) || 0)}</strong>.
              Hosts in this slice can communicate with each other but are isolated from hosts in other slices.
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose}
              style={{
                padding: "10px 20px", borderRadius: 10,
                border: "1px solid var(--theme-card-border)", background: "transparent",
                color: "var(--theme-text-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
              Cancel
            </button>
            <button type="submit" disabled={loading || form.selectedHostIds.length === 0 || isOverCapacity}
              style={{
                padding: "10px 24px", borderRadius: 10, border: "none",
                background: isOverCapacity ? "rgba(239,68,68,0.3)" : loading ? "#4f46e5" : "#6366f1",
                color: isOverCapacity ? "#fca5a5" : "#fff",
                fontSize: 13, fontWeight: 700,
                cursor: isOverCapacity ? "not-allowed" : loading ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: 8,
                opacity: form.selectedHostIds.length === 0 || isOverCapacity ? 0.6 : 1, transition: "all 0.15s",
              }}>
              {loading ? (
                <><RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> Creating...</>
              ) : isOverCapacity ? (
                <><AlertTriangle size={14} /> Capacity Exceeded</>
              ) : (
                <><Layers size={14} /> Create Slice</>
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
  const [onosHosts, setOnosHosts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [prefillData, setPrefillData] = useState(null);
  const [expandedSlice, setExpandedSlice] = useState(null);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("info");
  const [meterStats, setMeterStats] = useState([]);

  const showMessage = useCallback((msg, type = "info") => {
    setMessage(msg);
    setMessageType(type);
    if (type !== "error") setTimeout(() => setMessage(null), 5000);
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
      setOnosHosts(topoData.hosts || []);
      setDevices(topoData.devices || []);
      setLinks(topoData.links || []);
      setMeterStats(statsData);
    } catch (err) {
      showMessage("Failed to load slicing data: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [slicesData, topoData, statsData] = await Promise.all([
          getSlices().catch(() => slices),
          getTopologyInfo().catch(() => null),
          getAllMeterStats().catch(() => meterStats),
        ]);
        setSlices(slicesData);
        if (topoData) {
          setOnosHosts(topoData.hosts || []);
          setDevices(topoData.devices || []);
          setLinks(topoData.links || []);
        }
        setMeterStats(statsData);
      } catch { /* silent */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [slices, meterStats]);

  const handleCreate = useCallback(async (config) => {
    setCreating(true);
    try {
      const newSlice = await createSlice(config);
      showMessage(`Slice "${newSlice.name}" created — ${newSlice.hosts.length} host(s) assigned to VLAN ${newSlice.vlanId}`, "success");
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
    if (!window.confirm(`Delete slice "${slice.name}"?\n\nThis will remove VLAN ${slice.vlanId} rules and meters from all ${slice.hosts?.length || 0} host(s), breaking their isolated connectivity.`)) return;
    try {
      const result = await deleteSlice(sliceId);
      if (result.warnings?.length > 0) showMessage(`Slice deleted with warnings: ${result.warnings.join("; ")}`, "info");
      else showMessage(`Slice "${slice.name}" deleted — hosts released`, "success");
      await loadData();
    } catch (err) {
      showMessage("Failed to delete slice: " + err.message, "error");
    }
  }, [slices, loadData, showMessage]);

  // Computed
  const totalCapacity = useMemo(() => getNetworkCapacity(), []);
  const totalHosts = useMemo(() => slices.reduce((sum, s) => sum + (s.hosts?.length || 0), 0), [slices]);
  const totalBandwidth = useMemo(() => slices.reduce((sum, s) => sum + (s.bandwidth || 0), 0), [slices]);
  const remainingCapacity = useMemo(() => Math.max(0, totalCapacity - totalBandwidth), [totalCapacity, totalBandwidth]);
  const allocatedPercent = useMemo(() => Math.min(100, Math.round((totalBandwidth / totalCapacity) * 100)), [totalBandwidth, totalCapacity]);

  const pieData = useMemo(() => slices.map((s) => ({
    name: s.name.length > 14 ? s.name.slice(0, 14) + "…" : s.name,
    value: s.hosts?.length || 0, color: s.color,
  })), [slices]);
  const barData = useMemo(() => slices.map((s) => ({
    name: s.name.length > 14 ? s.name.slice(0, 14) + "…" : s.name,
    bandwidth: s.bandwidth, fill: s.color,
  })), [slices]);

  const { burstViolations, setIsDrawerOpen } = useNotifications();

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--color-zinc-50)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Layers size={26} color="#6366f1" /> Network Slicing
          </h1>
          <p style={{ fontSize: 13, color: "var(--theme-text-muted)", margin: "4px 0 0 36px" }}>
            Assign hosts to isolated virtual networks with VLAN tagging and bandwidth control
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={loadData} disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 16px", borderRadius: 10,
              border: "1px solid var(--theme-card-border)", background: "var(--theme-card)",
              color: "var(--color-zinc-50)", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
            <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : {}} /> Refresh
          </button>
          <button onClick={() => { setPrefillData(null); setShowCreate(true); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
              borderRadius: 10, border: "none", background: "#6366f1", color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#4f46e5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#6366f1")}
          >
            <Plus size={15} /> New Slice
          </button>
        </div>
      </div>

      {/* SLA Burst Violations Banner */}
      {burstViolations.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: "14px 18px",
            borderRadius: 14,
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(239, 68, 68, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Zap size={18} color="#ef4444" style={{ animation: "pulse 1.5s infinite" }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fca5a5" }}>
                Traffic Burst & SLA Violation Alert ({burstViolations.length})
              </div>
              <div style={{ fontSize: 11, color: "var(--theme-text-muted, #a1a1aa)", marginTop: 2 }}>
                {burstViolations[0].message}
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsDrawerOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.2)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#fca5a5",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Open Alert Center
          </button>
        </motion.div>
      )}

      {/* Messages */}
      <AnimatePresence>
        {message && <MessageBanner message={message} type={messageType} onClose={() => setMessage(null)} />}
      </AnimatePresence>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 16 }}>
        <StatCard icon={Layers} label="Active Slices" value={slices.length} sub={`${onosHosts.length} hosts discovered`} color="#6366f1" />
        <StatCard icon={Monitor} label="Hosts Assigned" value={totalHosts} sub={`of ${onosHosts.length} total`} color="#22c55e" />
        <StatCard icon={Gauge} label="Committed Bandwidth" value={formatRate(totalBandwidth)} sub={`${allocatedPercent}% of ${formatRate(totalCapacity)} Pool`} color="#f59e0b" />
        <StatCard icon={Shield} label="Isolation" value="VLAN" sub={`${slices.length} isolated network(s)`} color="#3b82f6" />
      </div>

      {/* Physical Bandwidth Capacity Budget Bar */}
      <div style={{
        background: "var(--theme-card)",
        border: "1px solid var(--theme-card-border)",
        borderRadius: 16,
        padding: "16px 20px",
        marginBottom: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Gauge size={16} color="#f59e0b" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-zinc-50)" }}>
              Physical Infrastructure Bandwidth Capacity Pool
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>
            Committed: <b style={{ color: "var(--color-zinc-50)" }}>{formatRate(totalBandwidth)}</b> / <b style={{ color: "#a5b4fc" }}>{formatRate(totalCapacity)}</b> ({allocatedPercent}% Allocated • <span style={{ color: remainingCapacity > 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{formatRate(remainingCapacity)} Available</span>)
          </div>
        </div>

        {/* Multi-segment progress bar */}
        <div style={{ height: 10, borderRadius: 5, background: "rgba(255, 255, 255, 0.08)", overflow: "hidden", display: "flex", gap: 2 }}>
          {slices.map((s) => {
            const pct = (s.bandwidth / totalCapacity) * 100;
            return (
              <div
                key={s.id}
                title={`${s.name}: ${formatRate(s.bandwidth)} (${pct.toFixed(1)}%)`}
                style={{ width: `${pct}%`, background: s.color, transition: "width 0.3s ease" }}
              />
            );
          })}
        </div>
      </div>

      {/* AI Intent-Based Slicing Engine Panel */}
      <AiIntentPanel
        onosHosts={onosHosts}
        existingSlices={slices}
        totalCapacity={totalCapacity}
        remainingCapacity={remainingCapacity}
        onDeploySlice={handleCreate}
        onPrefillManualForm={(data) => {
          setPrefillData(data);
          setShowCreate(true);
        }}
        loading={creating}
      />

      {/* Visual Slice Topology Map */}
      <SliceTopology
        slices={slices}
        devices={devices}
        links={links}
        hosts={onosHosts}
        onRefresh={loadData}
        loading={loading}
      />

      {/* Main layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, marginBottom: 24 }}>
        {/* Slice list */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-zinc-50)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Network size={16} color="#6366f1" /> Configured Slices
          </div>

          {loading ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: 60, gap: 12, background: "var(--theme-card)", border: "1px solid var(--theme-card-border)", borderRadius: 16,
            }}>
              <RefreshCw size={24} color="#6366f1" style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ fontSize: 13, color: "var(--theme-text-muted)" }}>Loading slices...</div>
            </div>
          ) : slices.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: "50px 30px", gap: 14, background: "var(--theme-card)",
              border: "1px solid var(--theme-card-border)", borderRadius: 16, textAlign: "center",
            }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Layers size={28} color="#6366f1" />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-zinc-50)" }}>No Network Slices</div>
              <div style={{ fontSize: 12, color: "var(--theme-text-muted)", maxWidth: 340, lineHeight: 1.6 }}>
                Create a slice to group hosts into an isolated virtual network. Hosts in the same slice can communicate.
                Hosts in different slices are isolated from each other.
              </div>
              <button onClick={() => setShowCreate(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "10px 20px",
                  borderRadius: 10, border: "none", background: "#6366f1", color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 4,
                }}>
                <Plus size={14} /> Create First Slice
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <AnimatePresence>
                {slices.map((slice) => (
                  <SliceCard key={slice.id} slice={slice} onDelete={handleDelete}
                    isExpanded={expandedSlice === slice.id}
                    onToggle={() => setExpandedSlice(expandedSlice === slice.id ? null : slice.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Sidebar charts */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Pie — hosts per slice */}
          <div style={{ background: "var(--theme-card)", border: "1px solid var(--theme-card-border)", borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-zinc-50)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Monitor size={14} color="#6366f1" /> Hosts per Slice
            </div>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} strokeWidth={0}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--theme-card)", border: "1px solid var(--theme-card-border)", borderRadius: 10, fontSize: 11, color: "var(--color-zinc-50)" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--theme-text-muted)", fontSize: 12 }}>No slices</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {pieData.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                  <span style={{ color: "var(--color-zinc-50)", flex: 1 }}>{d.name}</span>
                  <span style={{ color: "var(--theme-text-muted)", fontWeight: 600 }}>{d.value} host{d.value !== 1 ? "s" : ""}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bar — bandwidth */}
          <div style={{ background: "var(--theme-card)", border: "1px solid var(--theme-card-border)", borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-zinc-50)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Activity size={14} color="#22c55e" /> Bandwidth per Slice
            </div>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} barCategoryGap="20%">
                  <XAxis dataKey="name" tick={{ fill: "var(--theme-text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--theme-text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatRate(v)} />
                  <Tooltip contentStyle={{ background: "var(--theme-card)", border: "1px solid var(--theme-card-border)", borderRadius: 10, fontSize: 11, color: "var(--color-zinc-50)" }} formatter={(v) => formatRate(v)} />
                  <Bar dataKey="bandwidth" radius={[6, 6, 0, 0]}>{barData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--theme-text-muted)", fontSize: 12 }}>No slices</div>
            )}
          </div>

          {/* Infrastructure */}
          <div style={{ background: "var(--theme-card)", border: "1px solid var(--theme-card-border)", borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-zinc-50)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <Cpu size={14} color="#f59e0b" /> ONOS Infrastructure
            </div>
            {[
              { label: "Switches Online", value: devices.length },
              { label: "Hosts Discovered", value: onosHosts.length },
              { label: "Active Meters", value: meterStats.length },
              { label: "VLANs in Use", value: slices.length },
              { label: "OpenFlow", value: "1.3", color: "#22c55e" },
            ].map((r) => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0" }}>
                <span style={{ color: "var(--theme-text-muted)" }}>{r.label}</span>
                <span style={{ color: r.color || "var(--color-zinc-50)", fontWeight: 700 }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateSliceModal
            isOpen={showCreate}
            onClose={() => {
              setShowCreate(false);
              setPrefillData(null);
            }}
            onSubmit={handleCreate}
            onosHosts={onosHosts}
            loading={creating}
            totalCapacity={totalCapacity}
            totalAllocatedBandwidth={totalBandwidth}
            remainingCapacity={remainingCapacity}
            initialData={prefillData}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
