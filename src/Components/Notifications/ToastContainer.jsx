import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, AlertCircle, CheckCircle2, Info, X, Zap } from "lucide-react";
import { useNotifications } from "../../context/NotificationContext";

export default function ToastContainer() {
  const { toasts, dismissToast, setIsDrawerOpen } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 88,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
        maxWidth: 380,
        width: "100%",
      }}
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const isBurst = toast.type === "BURST_VIOLATION";
          const isWarning = toast.type === "BURST_WARNING";
          const isSuccess = toast.type === "SUCCESS";
          const isError = toast.type === "ERROR";

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
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.92, x: 20 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              exit={{ opacity: 0, y: -15, scale: 0.9, x: 20 }}
              transition={{ duration: 0.2 }}
              style={{
                pointerEvents: "auto",
                background: "rgba(18, 18, 22, 0.95)",
                backdropFilter: "blur(16px)",
                border: `1px solid ${accentColor}50`,
                borderLeft: `4px solid ${accentColor}`,
                borderRadius: 14,
                padding: "14px 16px",
                boxShadow: `0 12px 30px -8px rgba(0, 0, 0, 0.8), 0 0 20px ${accentColor}20`,
                color: "#ffffff",
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: `${accentColor}20`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                {isBurst ? (
                  <Zap size={16} color={accentColor} style={{ animation: "pulse 1.5s infinite" }} />
                ) : isWarning ? (
                  <AlertTriangle size={16} color={accentColor} />
                ) : isSuccess ? (
                  <CheckCircle2 size={16} color={accentColor} />
                ) : isError ? (
                  <AlertCircle size={16} color={accentColor} />
                ) : (
                  <Info size={16} color={accentColor} />
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-zinc-50)" }}>
                    {toast.title}
                  </span>
                  {toast.sliceName && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: `${toast.sliceColor}25`,
                        color: toast.sliceColor,
                        border: `1px solid ${toast.sliceColor}40`,
                      }}
                    >
                      {toast.sliceName}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: "var(--theme-text-muted, #a1a1aa)",
                    lineHeight: 1.4,
                    marginBottom: 6,
                  }}
                >
                  {toast.message}
                </div>

                {isBurst && toast.droppedPackets > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#f87171",
                    }}
                  >
                    <span>⚠️ Rate Meter Dropped: {toast.droppedPackets.toLocaleString()} pkts</span>
                    <button
                      type="button"
                      onClick={() => setIsDrawerOpen(true)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#818cf8",
                        textDecoration: "underline",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 10,
                      }}
                    >
                      View Details
                    </button>
                  </div>
                )}
              </div>

              {/* Dismiss button */}
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--theme-text-muted, #71717a)",
                  cursor: "pointer",
                  padding: 2,
                  marginTop: 2,
                }}
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
