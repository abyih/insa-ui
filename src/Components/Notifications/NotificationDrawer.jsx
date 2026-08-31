import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Info,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useNotifications } from "../../context/NotificationContext";

export default function NotificationDrawer() {
  const {
    notifications,
    unreadCount,
    isDrawerOpen,
    setIsDrawerOpen,
    markAsRead,
    markAllAsRead,
    clearAll,
    removeNotification,
    addNotification,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'sla' | 'slices' | 'system'

  const filteredNotifications = useMemo(() => {
    if (activeTab === "sla") {
      return notifications.filter((n) => n.type === "BURST_VIOLATION" || n.type === "BURST_WARNING");
    }
    if (activeTab === "slices") {
      return notifications.filter((n) => n.sliceId || n.type === "SLICE_EVENT");
    }
    if (activeTab === "system") {
      return notifications.filter((n) => !n.sliceId && n.type !== "BURST_VIOLATION");
    }
    return notifications;
  }, [notifications, activeTab]);

  if (!isDrawerOpen) return null;

  const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 30) return "Just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const handleTriggerTestAlert = () => {
    addNotification({
      type: "BURST_VIOLATION",
      title: "SLA Violation: Traffic Burst (Test)",
      message: "Slice 'URLLC-LowLatency' exceeded its 10,000 KB/s cap on Switch s1. Switch meter dropped 340 packets (450 KB).",
      sliceName: "URLLC-LowLatency",
      sliceColor: "#ef4444",
      switchName: "Switch s1",
      droppedPackets: 340,
      droppedBytes: 460800,
    });
  };

  return (
    <AnimatePresence>
      <div style={{ position: "fixed", inset: 0, zIndex: 99999 }}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsDrawerOpen(false)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(4px)",
          }}
        />

        {/* Drawer Panel */}
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 26, stiffness: 280 }}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            maxWidth: 440,
            background: "rgba(18, 18, 22, 0.98)",
            backdropFilter: "blur(24px)",
            borderLeft: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "-10px 0 40px rgba(0, 0, 0, 0.8)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "rgba(99, 102, 241, 0.15)",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Bell size={18} color="#818cf8" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-zinc-50)" }}>
                  Network Notifications
                </div>
                <div style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                  {unreadCount > 0
                    ? `${unreadCount} unread alert${unreadCount > 1 ? "s" : ""}`
                    : "All notifications up to date"}
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsDrawerOpen(false)}
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "none",
                borderRadius: 8,
                color: "var(--theme-text-muted)",
                cursor: "pointer",
                padding: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Filter Tabs & Quick Actions */}
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { id: "all", label: "All" },
                { id: "sla", label: "SLA Alerts", highlight: true },
                { id: "slices", label: "Slices" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: activeTab === tab.id ? 700 : 500,
                    cursor: "pointer",
                    border: "none",
                    background:
                      activeTab === tab.id
                        ? tab.highlight
                          ? "rgba(239, 68, 68, 0.2)"
                          : "rgba(99, 102, 241, 0.2)"
                        : "transparent",
                    color:
                      activeTab === tab.id
                        ? tab.highlight
                          ? "#f87171"
                          : "#818cf8"
                        : "var(--theme-text-muted)",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  title="Mark all as read"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    background: "none",
                    border: "none",
                    color: "#818cf8",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <CheckCheck size={13} /> Mark read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  title="Clear all notifications"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "none",
                    border: "none",
                    color: "var(--theme-text-muted)",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            {filteredNotifications.length === 0 ? (
              <div
                style={{
                  padding: "48px 20px",
                  textAlign: "center",
                  color: "var(--theme-text-muted)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "rgba(255, 255, 255, 0.04)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Bell size={20} style={{ opacity: 0.4 }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>No notifications</div>
                <div style={{ fontSize: 11, opacity: 0.7, maxWidth: 260 }}>
                  Live SLA alerts, bandwidth burst events, and slice updates will appear here in real time.
                </div>
                <button
                  type="button"
                  onClick={handleTriggerTestAlert}
                  style={{
                    marginTop: 8,
                    padding: "6px 14px",
                    borderRadius: 8,
                    background: "rgba(99, 102, 241, 0.15)",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    color: "#818cf8",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Trigger Test SLA Alert
                </button>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isBurst = notif.type === "BURST_VIOLATION";
                const isWarning = notif.type === "BURST_WARNING";
                const isSuccess = notif.type === "SUCCESS";
                const isError = notif.type === "ERROR";

                const accentColor = isBurst
                  ? "#ef4444"
                  : isWarning
                  ? "#f59e0b"
                  : isSuccess
                  ? "#22c55e"
                  : isError
                  ? "#f87171"
                  : "#6366f1";

                return (
                  <div
                    key={notif.id}
                    onClick={() => markAsRead(notif.id)}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 14,
                      background: notif.read ? "rgba(24, 24, 27, 0.6)" : "rgba(30, 30, 36, 0.9)",
                      border: `1px solid ${notif.read ? "rgba(255, 255, 255, 0.06)" : `${accentColor}40`}`,
                      borderLeft: `4px solid ${accentColor}`,
                      position: "relative",
                      transition: "all 0.15s ease",
                      cursor: "pointer",
                    }}
                  >
                    {!notif.read && (
                      <div
                        style={{
                          position: "absolute",
                          top: 12,
                          right: 12,
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: accentColor,
                        }}
                      />
                    )}

                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: `${accentColor}20`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        {isBurst ? (
                          <Zap size={13} color={accentColor} />
                        ) : isWarning ? (
                          <AlertTriangle size={13} color={accentColor} />
                        ) : isSuccess ? (
                          <CheckCircle2 size={13} color={accentColor} />
                        ) : (
                          <Info size={13} color={accentColor} />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-zinc-50)", lineHeight: 1.3 }}>
                          {notif.title}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--theme-text-muted)", marginTop: 2 }}>
                          {formatTimeAgo(notif.timestamp)}
                          {notif.switchName && ` • on ${notif.switchName}`}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: "var(--theme-text-muted)", lineHeight: 1.4, margin: "6px 0 8px 34px" }}>
                      {notif.message}
                    </div>

                    {/* Metrics / Actions */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginLeft: 34 }}>
                      {notif.sliceName && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: `${notif.sliceColor}20`,
                            color: notif.sliceColor,
                            border: `1px solid ${notif.sliceColor}30`,
                          }}
                        >
                          {notif.sliceName}
                        </span>
                      )}

                      {isBurst && notif.droppedPackets > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#f87171" }}>
                          {notif.droppedPackets.toLocaleString()} pkts dropped
                        </span>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNotification(notif.id);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--theme-text-muted)",
                          cursor: "pointer",
                          padding: 2,
                          opacity: 0.5,
                        }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer with Slicing shortcut */}
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(12, 12, 16, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Link
              to="/network-slicing"
              onClick={() => setIsDrawerOpen(false)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 600,
                color: "#818cf8",
                textDecoration: "none",
              }}
            >
              <Layers size={13} /> Manage Network Slices <ArrowRight size={11} />
            </Link>

            <button
              onClick={handleTriggerTestAlert}
              style={{
                background: "none",
                border: "none",
                color: "var(--theme-text-muted)",
                fontSize: 10,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Test Burst
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
