import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { getMeters, getDevices } from "../api/api-controller";
import { loadSlices } from "../api/slicingService";

const NotificationContext = createContext(null);

const STORAGE_KEY = "sdn-network-notifications";
const MAX_NOTIFICATIONS = 50;
const BURST_ALERT_COOLDOWN_MS = 15000; // 15s debounce per slice

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [toasts, setToasts] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Meter stats tracking across polling cycles
  const prevMeterStatsRef = useRef(new Map()); // Map<string (deviceId:meterId), { packets: number, bytes: number, time: number }>
  const lastAlertTimeRef = useRef(new Map()); // Map<string (sliceId), number (timestamp)>

  // Save notifications to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
    } catch {
      /* silent */
    }
  }, [notifications]);

  // Add a new notification and trigger a temporary toast
  const addNotification = useCallback((item) => {
    const id = item.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const notification = {
      id,
      type: item.type || "INFO", // "BURST_VIOLATION" | "BURST_WARNING" | "SUCCESS" | "INFO" | "ERROR"
      title: item.title || "Network Notification",
      message: item.message || "",
      sliceId: item.sliceId || null,
      sliceName: item.sliceName || null,
      sliceColor: item.sliceColor || "#6366f1",
      deviceId: item.deviceId || null,
      switchName: item.switchName || null,
      droppedPackets: item.droppedPackets || 0,
      droppedBytes: item.droppedBytes || 0,
      timestamp: item.timestamp || Date.now(),
      read: false,
    };

    setNotifications((prev) => [notification, ...prev].slice(0, MAX_NOTIFICATIONS));

    // Show temporary toast
    setToasts((prev) => [...prev, notification]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);

    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markAsRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Background SLA & Meter Burst Monitor
  useEffect(() => {
    let isMounted = true;

    const checkMeterBursts = async () => {
      try {
        const slices = loadSlices();
        if (!slices || slices.length === 0) return;

        const activeDevices = await getDevices(true).catch(() => []);
        if (!activeDevices || activeDevices.length === 0) return;

        const activeDevIds = new Set(activeDevices.map((d) => d.id));
        const now = Date.now();

        // Check all meters across all active switches in real time
        for (const dev of activeDevices) {
          const switchMeters = await getMeters(dev.id).catch(() => []);
          for (const meter of switchMeters) {
            const meterKey = `${dev.id}:${meter.id}`;
            const dropBand = meter.bands?.find((b) => b.type === "DROP") || meter.bands?.[0];
            const currentDropPackets = Number(dropBand?.packets || dropBand?.packet_count || 0);
            const currentDropBytes = Number(dropBand?.bytes || dropBand?.byte_count || 0);
            const currentTotalPackets = Number(meter.packets || 0);
            const currentTotalBytes = Number(meter.bytes || 0);

            // Find matching slice for this device and meter
            const matchingSlice =
              slices.find((s) =>
                (s.hosts || []).some(
                  (h) => h.deviceId === dev.id && String(h.meterId) === String(meter.id)
                )
              ) ||
              slices[0] || {
                id: `slice-${meterKey}`,
                name: "Active Slice",
                color: "#6366f1",
                bandwidth: meter.bands?.[0]?.rate || 50000,
              };

            const sliceId = matchingSlice?.id || `meter-${meterKey}`;
            const lastAlertTime = lastAlertTimeRef.current.get(sliceId) || 0;

            const prev = prevMeterStatsRef.current.get(meterKey);

            if (prev) {
              const dtSeconds = Math.max((now - prev.time) / 1000, 0.5);
              const deltaDropPackets = currentDropPackets - prev.dropPackets;
              const deltaDropBytes = currentDropBytes - prev.dropBytes;
              const deltaTotalBytes = currentTotalBytes - prev.totalBytes;
              const deltaTotalPackets = currentTotalPackets - prev.totalPackets;

              // Throughput rate in KB/s
              const rateKbps = Math.round(deltaTotalBytes / (1024 * dtSeconds));
              const sliceCapKbps = Number(matchingSlice?.bandwidth || meter.bands?.[0]?.rate || 10000);

              const hasDrops = deltaDropPackets > 0;
              const isOverCap =
                rateKbps >= sliceCapKbps * 0.75 ||
                (deltaTotalBytes > 100000 && rateKbps > 500);

              if ((hasDrops || isOverCap) && now - lastAlertTime > BURST_ALERT_COOLDOWN_MS) {
                lastAlertTimeRef.current.set(sliceId, now);

                const switchDesc =
                  dev.annotations?.datapathDescription ||
                  (dev.id.startsWith("of:") ? `Switch ${dev.id.slice(-4)}` : dev.id);

                const dropInfo = hasDrops
                  ? `Switch meter dropped ${deltaDropPackets.toLocaleString()} packet(s) (${Math.round(deltaDropBytes / 1024)} KB).`
                  : `Traffic rate surged to ${rateKbps.toLocaleString()} KB/s (${Math.round((rateKbps / sliceCapKbps) * 100)}% of ${sliceCapKbps.toLocaleString()} KB/s SLA cap).`;

                addNotification({
                  type: "BURST_VIOLATION",
                  title: `SLA Violation: Traffic Burst on ${matchingSlice.name || "Network Slice"}`,
                  message: `Slice "${matchingSlice.name || "Slice"}" experienced high burst traffic on ${switchDesc}. ${dropInfo}`,
                  sliceId: matchingSlice.id,
                  sliceName: matchingSlice.name,
                  sliceColor: matchingSlice.color,
                  deviceId: dev.id,
                  switchName: switchDesc,
                  droppedPackets: hasDrops ? deltaDropPackets : Math.max(deltaTotalPackets, 0),
                  droppedBytes: hasDrops ? deltaDropBytes : Math.max(deltaTotalBytes, 0),
                });
              }
            }

            // Update snapshot
            prevMeterStatsRef.current.set(meterKey, {
              dropPackets: currentDropPackets,
              dropBytes: currentDropBytes,
              totalPackets: currentTotalPackets,
              totalBytes: currentTotalBytes,
              time: now,
            });
          }
        }
      } catch (err) {
        // Polling error non-blocking
      }
    };

    // Run responsive polling every 2.5 seconds
    const interval = setInterval(() => {
      if (isMounted) checkMeterBursts();
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [addNotification]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const burstViolations = notifications.filter((n) => n.type === "BURST_VIOLATION");

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        burstViolations,
        toasts,
        isDrawerOpen,
        setIsDrawerOpen,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
        removeNotification,
        dismissToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
