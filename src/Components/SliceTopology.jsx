import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { DataSet } from "vis-data";
import { Network } from "vis-network";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Eye,
  Shield,
  Activity,
  Cpu,
  Monitor,
  Network as NetIcon,
  Info,
  X,
  Zap,
} from "lucide-react";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getHostDisplayName(host) {
  const ips = host.ipAddresses || host.ips || [];
  const ip = ips.find((i) => !i.includes(":")) || ips[0];
  if (ip) return ip;
  return host.mac || host.id || "Host";
}

export default function SliceTopology({
  slices = [],
  devices = [],
  links = [],
  hosts = [],
  onRefresh,
  loading = false,
}) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const nodesDatasetRef = useRef(null);
  const edgesDatasetRef = useRef(null);

  const [selectedSliceId, setSelectedSliceId] = useState("ALL");
  const [selectedNodeDetails, setSelectedNodeDetails] = useState(null);

  // Map hosts to their slices
  const hostSliceMap = useMemo(() => {
    const map = new Map();
    for (const slice of slices) {
      for (const h of slice.hosts || []) {
        map.set(h.mac.toLowerCase(), slice);
      }
    }
    return map;
  }, [slices]);

  // Build Vis Network Nodes & Edges
  const graphData = useMemo(() => {
    const nodes = [];
    const edges = [];
    const edgeIdSet = new Set();

    // 1. Add Switches
    for (const dev of devices) {
      const devName = dev.annotations?.datapathDescription || dev.id.split(":").slice(-1)[0] || dev.id;
      const isCore = devName.toLowerCase() === "s1" || (dev.annotations?.datapathDescription || "").toLowerCase() === "s1";

      nodes.push({
        id: dev.id,
        label: `Switch: ${devName}\n${dev.id.length > 20 ? dev.id.slice(-12) : dev.id}`,
        shape: "box",
        margin: 12,
        color: {
          background: isCore ? "#1e1b4b" : "#18181b",
          border: isCore ? "#818cf8" : "#3f3f46",
          highlight: {
            background: "#2e1065",
            border: "#a855f7",
          },
        },
        font: {
          color: "#f4f4f5",
          face: "Inter, sans-serif",
          size: 13,
          bold: true,
          multi: true,
        },
        borderWidth: 2,
        shadow: {
          enabled: true,
          color: isCore ? "rgba(99,102,241,0.3)" : "rgba(0,0,0,0.5)",
          size: 10,
        },
        data: { type: "switch", device: dev, name: devName },
      });
    }

    // 2. Add Switch-to-Switch Links
    for (const link of links) {
      const srcDev = link.src?.device;
      const dstDev = link.dst?.device;
      if (!srcDev || !dstDev) continue;

      const linkKey = [srcDev, dstDev].sort().join("<->");
      if (edgeIdSet.has(linkKey)) continue;
      edgeIdSet.add(linkKey);

      edges.push({
        id: linkKey,
        from: srcDev,
        to: dstDev,
        color: { color: "#3f3f46", highlight: "#818cf8" },
        width: 3,
        smooth: { type: "continuous" },
        arrows: { to: { enabled: false }, from: { enabled: false } },
        data: { type: "inter-switch", link },
      });
    }

    // 3. Add Hosts & Host-to-Switch Links
    for (const host of hosts) {
      const mac = (host.mac || "").toLowerCase();
      const ip = getHostDisplayName(host);
      const assignedSlice = hostSliceMap.get(mac);
      const isVisibleInFilter =
        selectedSliceId === "ALL" || (assignedSlice && assignedSlice.id === selectedSliceId);

      const sliceColor = assignedSlice?.color || "#71717a";
      const isInSlice = Boolean(assignedSlice);

      const hostLabel = `${ip}\n[${mac.slice(-5)}]${
        assignedSlice ? `\n• ${assignedSlice.name} (VLAN ${assignedSlice.vlanId})` : "\n• Unassigned"
      }`;

      nodes.push({
        id: host.id || mac,
        label: hostLabel,
        shape: "box",
        margin: 10,
        color: {
          background: isInSlice ? `${sliceColor}20` : "#18181b",
          border: isInSlice ? sliceColor : "#3f3f46",
          highlight: {
            background: isInSlice ? `${sliceColor}40` : "#27272a",
            border: isInSlice ? sliceColor : "#a1a1aa",
          },
        },
        font: {
          color: isInSlice ? "#fafafa" : "#a1a1aa",
          face: "Inter, sans-serif",
          size: 11,
          multi: true,
        },
        borderWidth: isInSlice ? 2.5 : 1,
        borderWidthSelected: 3.5,
        opacity: isVisibleInFilter ? 1 : 0.25,
        shadow: isInSlice
          ? {
              enabled: true,
              color: `${sliceColor}60`,
              size: 12,
            }
          : false,
        data: {
          type: "host",
          host,
          ip,
          mac,
          slice: assignedSlice,
        },
      });

      // Host connection to switch
      const loc = host.locations?.[0] || host.location;
      if (loc && loc.elementId) {
        const hostLinkId = `link-${host.id || mac}-${loc.elementId}`;
        edges.push({
          id: hostLinkId,
          from: host.id || mac,
          to: loc.elementId,
          color: {
            color: isInSlice ? sliceColor : "#27272a",
            opacity: isVisibleInFilter ? 1 : 0.2,
          },
          width: isInSlice ? 2.5 : 1.5,
          dashes: !isInSlice,
          smooth: { type: "continuous" },
          data: { type: "host-link", host, port: loc.port },
        });
      }
    }

    return { nodes, edges };
  }, [devices, links, hosts, hostSliceMap, selectedSliceId]);

  // Initialize and update Vis Network
  useEffect(() => {
    if (!containerRef.current) return;

    const nodesDataSet = new DataSet(graphData.nodes);
    const edgesDataSet = new DataSet(graphData.edges);
    nodesDatasetRef.current = nodesDataSet;
    edgesDatasetRef.current = edgesDataSet;

    const options = {
      physics: {
        enabled: true,
        solver: "forceAtlas2Based",
        forceAtlas2Based: {
          gravitationalConstant: -70,
          centralGravity: 0.01,
          springLength: 120,
          springConstant: 0.08,
          damping: 0.85,
        },
        stabilization: { iterations: 150 },
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        zoomView: true,
        dragView: true,
        navigationButtons: false,
      },
      layout: {
        improvedLayout: true,
      },
    };

    const network = new Network(
      containerRef.current,
      { nodes: nodesDataSet, edges: edgesDataSet },
      options
    );
    networkRef.current = network;

    network.on("click", (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const nodeItem = nodesDataSet.get(nodeId);
        if (nodeItem?.data) {
          setSelectedNodeDetails(nodeItem.data);
        }
      } else {
        setSelectedNodeDetails(null);
      }
    });

    return () => {
      network.destroy();
    };
  }, [graphData]);

  // Controls
  const handleZoomIn = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale();
      networkRef.current.moveTo({ scale: scale * 1.25, animation: { duration: 250 } });
    }
  };

  const handleZoomOut = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale();
      networkRef.current.moveTo({ scale: scale * 0.8, animation: { duration: 250 } });
    }
  };

  const handleFit = () => {
    if (networkRef.current) {
      networkRef.current.fit({ animation: { duration: 350 } });
    }
  };

  return (
    <div
      style={{
        background: "var(--theme-card)",
        border: "1px solid var(--theme-card-border)",
        borderRadius: 18,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        marginBottom: 24,
        position: "relative",
      }}
    >
      {/* Top Header & Filter Toolbar */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--theme-card-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          background: "rgba(24, 24, 27, 0.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(99,102,241,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <NetIcon size={18} color="#6366f1" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-zinc-50)" }}>
              Slice Overlay Topology
            </div>
            <div style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
              Live OpenFlow paths and VLAN boundaries across switches
            </div>
          </div>
        </div>

        {/* Slice Filter Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => setSelectedSliceId("ALL")}
            style={{
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              border: selectedSliceId === "ALL" ? "1px solid #6366f1" : "1px solid var(--theme-card-border)",
              background: selectedSliceId === "ALL" ? "rgba(99,102,241,0.2)" : "var(--theme-bg)",
              color: selectedSliceId === "ALL" ? "#818cf8" : "var(--theme-text-muted)",
              transition: "all 0.15s",
            }}
          >
            All Slices ({slices.length})
          </button>

          {slices.map((slice) => {
            const isSelected = selectedSliceId === slice.id;
            return (
              <button
                key={slice.id}
                onClick={() => setSelectedSliceId(isSelected ? "ALL" : slice.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: `1px solid ${isSelected ? slice.color : `${slice.color}40`}`,
                  background: isSelected ? `${slice.color}25` : `${slice.color}10`,
                  color: isSelected ? "#fff" : slice.color,
                  transition: "all 0.15s",
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: slice.color }} />
                {slice.name} (VLAN {slice.vlanId})
              </button>
            );
          })}
        </div>

        {/* View Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--theme-card-border)",
              background: "var(--theme-bg)",
              color: "var(--color-zinc-50)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--theme-card-border)",
              background: "var(--theme-bg)",
              color: "var(--color-zinc-50)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={handleFit}
            title="Fit to Screen"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--theme-card-border)",
              background: "var(--theme-bg)",
              color: "var(--color-zinc-50)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Maximize2 size={14} />
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Refresh Topology"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "1px solid var(--theme-card-border)",
                background: "var(--theme-bg)",
                color: "var(--color-zinc-50)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
            </button>
          )}
        </div>
      </div>

      {/* Vis Network Canvas Container */}
      <div style={{ position: "relative", width: "100%", height: 420 }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%", background: "#09090b" }} />

        {/* Selected Node Details Drawer */}
        <AnimatePresence>
          {selectedNodeDetails && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                width: 280,
                background: "rgba(24, 24, 27, 0.95)",
                backdropFilter: "blur(12px)",
                border: "1px solid var(--theme-card-border)",
                borderRadius: 14,
                padding: 16,
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
                zIndex: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {selectedNodeDetails.type === "switch" ? (
                    <Cpu size={16} color="#818cf8" />
                  ) : (
                    <Monitor size={16} color={selectedNodeDetails.slice?.color || "#a1a1aa"} />
                  )}
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-zinc-50)" }}>
                    {selectedNodeDetails.type === "switch"
                      ? `Switch ${selectedNodeDetails.name}`
                      : `Host ${selectedNodeDetails.ip}`}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNodeDetails(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--theme-text-muted)",
                    cursor: "pointer",
                    padding: 2,
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              {selectedNodeDetails.type === "host" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>MAC:</span>
                    <span style={{ fontFamily: "monospace", color: "var(--color-zinc-50)" }}>
                      {selectedNodeDetails.mac}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>Slice:</span>
                    {selectedNodeDetails.slice ? (
                      <span
                        style={{
                          fontWeight: 700,
                          color: selectedNodeDetails.slice.color,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: `${selectedNodeDetails.slice.color}20`,
                        }}
                      >
                        {selectedNodeDetails.slice.name} (VLAN {selectedNodeDetails.slice.vlanId})
                      </span>
                    ) : (
                      <span style={{ color: "var(--theme-text-muted)" }}>Unassigned</span>
                    )}
                  </div>
                  {selectedNodeDetails.slice && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--theme-text-muted)" }}>Bandwidth Cap:</span>
                      <span style={{ color: "var(--color-zinc-50)", fontWeight: 600 }}>
                        {selectedNodeDetails.slice.bandwidth} KB/s
                      </span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>Location:</span>
                    <span style={{ color: "var(--color-zinc-50)", fontFamily: "monospace" }}>
                      {selectedNodeDetails.host?.locations?.[0]
                        ? `${selectedNodeDetails.host.locations[0].elementId.slice(-8)} : ${selectedNodeDetails.host.locations[0].port}`
                        : "—"}
                    </span>
                  </div>
                </div>
              )}

              {selectedNodeDetails.type === "switch" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>Device ID:</span>
                    <span style={{ fontFamily: "monospace", color: "var(--color-zinc-50)", fontSize: 10 }}>
                      {selectedNodeDetails.device.id}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>Protocol:</span>
                    <span style={{ color: "#22c55e", fontWeight: 700 }}>
                      {selectedNodeDetails.device.annotations?.protocol || "OF_13"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>Status:</span>
                    <span style={{ color: "#22c55e", fontWeight: 700 }}>AVAILABLE</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Status Legend */}
      <div
        style={{
          padding: "10px 20px",
          background: "rgba(24, 24, 27, 0.6)",
          borderTop: "1px solid var(--theme-card-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--theme-text-muted)" }}>
            <Shield size={13} color="#22c55e" />
            <span>Hardware Flow Slicing: <b>Active</b></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--theme-text-muted)" }}>
            <Zap size={13} color="#f59e0b" />
            <span>Isolation Boundary: <b>Priority 39000</b></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--theme-text-muted)" }}>
            <Activity size={13} color="#6366f1" />
            <span>Multi-Switch Path Routing: <b>Enabled</b></span>
          </div>
        </div>

        <div style={{ color: "var(--theme-text-muted)" }}>
          {hosts.length} Host(s) • {devices.length} Switch(es)
        </div>
      </div>
    </div>
  );
}
