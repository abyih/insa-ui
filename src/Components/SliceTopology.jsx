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
  Shield,
  Activity,
  Cpu,
  Monitor,
  Network as NetIcon,
  X,
  Zap,
  LayoutGrid,
  Sparkles,
  Server,
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
  return host.mac ? host.mac.slice(-8) : "Host";
}

function getSwitchDisplayName(dev) {
  const name = dev.annotations?.datapathDescription || dev.annotations?.managementAddress;
  if (name && !name.includes(":") && name.length < 15) return name;
  const parts = dev.id.split(":");
  const last = parts[parts.length - 1];
  const num = parseInt(last, 16);
  if (!isNaN(num) && num < 100) return `s${num}`;
  return last ? `sw-${last.slice(-4)}` : dev.id.slice(-8);
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
  const [layoutMode, setLayoutMode] = useState("hierarchical"); // 'hierarchical' | 'organic'
  const [selectedNodeDetails, setSelectedNodeDetails] = useState(null);

  // Map hosts to their slice by MAC, IP, and Host ID
  const hostSliceMap = useMemo(() => {
    const map = new Map();
    for (const slice of slices || []) {
      for (const h of slice.hosts || []) {
        const mac = (h.mac || h.hostId || "").toLowerCase();
        if (mac) map.set(mac, slice);
        const ips = h.ipAddresses || (h.ip ? [h.ip] : []);
        for (const ip of ips) {
          if (ip) map.set(ip.toLowerCase(), slice);
        }
      }
    }
    return map;
  }, [slices]);

  // Combine ONOS discovered hosts, hosts saved in slices, and standard switch hosts
  const combinedHosts = useMemo(() => {
    const map = new Map();

    // 1. Add ONOS discovered hosts
    for (const h of hosts || []) {
      const key = (h.mac || h.id || "").toLowerCase();
      if (key) map.set(key, h);
    }

    // 2. Add any hosts defined in slices that might not be in ONOS /hosts yet
    for (const s of slices || []) {
      for (const sh of s.hosts || []) {
        const key = (sh.mac || sh.hostId || "").toLowerCase();
        if (key && !map.has(key)) {
          map.set(key, {
            id: sh.hostId || `${sh.mac}/None`,
            mac: sh.mac,
            ipAddresses: sh.ipAddresses || [],
            deviceId: sh.deviceId,
            port: sh.port,
            locations: sh.deviceId ? [{ elementId: sh.deviceId, port: String(sh.port || "1") }] : [],
            location: sh.deviceId ? { elementId: sh.deviceId, port: String(sh.port || "1") } : null,
          });
        }
      }
    }

    // 3. Fallback: If STILL no hosts at all but switches exist, generate standard topology hosts (h1, h2 per switch)
    if (map.size === 0 && devices.length > 0) {
      const leafSwitches = devices.filter((d) => {
        const name = getSwitchDisplayName(d).toLowerCase();
        return name !== "s1" && !name.includes("core") && !name.includes("spine");
      });
      const targetSwitches = leafSwitches.length > 0 ? leafSwitches : devices;

      let count = 1;
      targetSwitches.forEach((sw) => {
        for (let i = 1; i <= 2; i++) {
          const mac = `00:00:00:00:00:0${count}`;
          const ip = `10.0.0.${count}`;
          map.set(mac.toLowerCase(), {
            id: `host:h${count}`,
            mac,
            ipAddresses: [ip],
            deviceId: sw.id,
            port: String(i),
            locations: [{ elementId: sw.id, port: String(i) }],
            location: { elementId: sw.id, port: String(i) },
          });
          count++;
        }
      });
    }

    return Array.from(map.values());
  }, [hosts, slices, devices]);

  // Determine Core vs Leaf Switches for Hierarchical Levels
  const switchLevelMap = useMemo(() => {
    const map = new Map();
    for (const dev of devices) {
      const name = getSwitchDisplayName(dev).toLowerCase();
      if (name === "s1" || name.includes("core") || name.includes("spine")) {
        map.set(dev.id, 0); // Core Level
      } else {
        map.set(dev.id, 1); // Leaf Level
      }
    }

    if (![...map.values()].includes(0) && devices.length > 0) {
      map.set(devices[0].id, 0);
    }

    return map;
  }, [devices]);

  // Build Vis Network Nodes & Edges
  const graphData = useMemo(() => {
    const nodes = [];
    const edges = [];
    const edgeIdSet = new Set();

    // 1. Add Switches (Device Switch Image)
    for (const dev of devices) {
      const devName = getSwitchDisplayName(dev);
      const level = switchLevelMap.get(dev.id) ?? 1;
      const isCore = level === 0;

      nodes.push({
        id: dev.id,
        label: isCore ? `${devName.toUpperCase()} [Core]` : `Switch ${devName}`,
        shape: "image",
        image: "/assets/images/Device_switch_3062_unknown_64.png",
        size: isCore ? 36 : 30,
        level: layoutMode === "hierarchical" ? level : undefined,
        font: {
          color: isCore ? "#c7d2fe" : "#e4e4e7",
          background: isCore ? "rgba(30, 27, 75, 0.9)" : "rgba(24, 24, 27, 0.9)",
          face: "Inter, system-ui, sans-serif",
          size: isCore ? 12 : 11,
          bold: true,
          strokeWidth: 1,
          strokeColor: isCore ? "#818cf8" : "#52525b",
        },
        shadow: {
          enabled: true,
          color: isCore ? "rgba(99, 102, 241, 0.5)" : "rgba(0, 0, 0, 0.6)",
          size: isCore ? 16 : 8,
          x: 0,
          y: 4,
        },
        data: { type: "switch", device: dev, name: devName, isCore },
      });
    }

    // 2. Add Inter-Switch Links
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
        color: {
          color: "#6366f1",
          highlight: "#818cf8",
          hover: "#a5b4fc",
        },
        width: 3.5,
        smooth: {
          type: "cubicBezier",
          roundness: 0.2,
        },
        arrows: { to: { enabled: false }, from: { enabled: false } },
        shadow: {
          enabled: true,
          color: "rgba(99, 102, 241, 0.4)",
          size: 6,
        },
        data: { type: "inter-switch", link },
      });
    }

    // 3. Add Hosts (Device PC Image) & Host-to-Switch Links
    for (const host of combinedHosts) {
      const mac = (host.mac || "").toLowerCase();
      const ip = getHostDisplayName(host);
      const assignedSlice = hostSliceMap.get(mac) || hostSliceMap.get(ip.toLowerCase());
      const isVisibleInFilter =
        selectedSliceId === "ALL" || (assignedSlice && assignedSlice.id === selectedSliceId);

      const sliceColor = assignedSlice?.color || "#71717a";
      const isInSlice = Boolean(assignedSlice);

      // Identify connected switch
      const loc = host.locations?.[0] || host.location;
      const targetSwitchId =
        loc?.elementId ||
        host.deviceId ||
        (devices.length > 0 ? devices[devices.length - 1].id : null);
      const portNumber = loc?.port || host.port || "1";

      const parentLevel = targetSwitchId ? (switchLevelMap.get(targetSwitchId) ?? 1) : 1;

      // Short, clean label: IP + VLAN tag (prevents horizontal bloat)
      const hostLabel = isInSlice
        ? `${ip}\nVLAN ${assignedSlice.vlanId}`
        : `${ip}\nDefault`;

      const hostNodeId = host.id || mac || `host-${ip}`;

      nodes.push({
        id: hostNodeId,
        label: hostLabel,
        shape: "image",
        image: "/assets/images/Device_pc_3045_default_64.png",
        size: 28,
        level: layoutMode === "hierarchical" ? parentLevel + 1 : undefined,
        font: {
          color: isInSlice ? "#ffffff" : "#a1a1aa",
          background: isInSlice ? "rgba(24, 24, 27, 0.92)" : "rgba(18, 18, 20, 0.9)",
          face: "Inter, system-ui, sans-serif",
          size: 11,
          bold: isInSlice,
          strokeWidth: 1.5,
          strokeColor: isInSlice ? sliceColor : "#3f3f46",
          multi: true,
        },
        opacity: isVisibleInFilter ? 1 : 0.25,
        shadow: isInSlice
          ? {
              enabled: true,
              color: `${sliceColor}60`,
              size: 12,
              x: 0,
              y: 3,
            }
          : false,
        data: {
          type: "host",
          host,
          ip,
          mac,
          slice: assignedSlice,
          switchId: targetSwitchId,
          port: portNumber,
        },
      });

      // Host connection to switch
      if (targetSwitchId) {
        const hostLinkId = `link-${hostNodeId}-${targetSwitchId}`;
        edges.push({
          id: hostLinkId,
          from: hostNodeId,
          to: targetSwitchId,
          color: {
            color: isInSlice ? sliceColor : "#3f3f46",
            opacity: isVisibleInFilter ? 1 : 0.2,
          },
          width: isInSlice ? 2.5 : 1.5,
          dashes: !isInSlice,
          smooth: {
            type: "cubicBezier",
            roundness: 0.15,
          },
          data: { type: "host-link", host, port: portNumber },
        });
      }
    }

    return { nodes, edges };
  }, [devices, links, combinedHosts, hostSliceMap, selectedSliceId, layoutMode, switchLevelMap]);

  // Initialize DataSet references once
  if (!nodesDatasetRef.current) {
    nodesDatasetRef.current = new DataSet([]);
  }
  if (!edgesDatasetRef.current) {
    edgesDatasetRef.current = new DataSet([]);
  }

  // Smoothly update DataSets when graphData changes without resetting camera or network
  useEffect(() => {
    if (!nodesDatasetRef.current || !edgesDatasetRef.current) return;

    const currentNodes = nodesDatasetRef.current.get();
    const currentEdges = edgesDatasetRef.current.get();

    const newNodes = graphData.nodes;
    const newEdges = graphData.edges;

    const newNodeIds = new Set(newNodes.map((n) => n.id));
    const newEdgeIds = new Set(newEdges.map((e) => e.id));

    const nodesToRemove = currentNodes.filter((n) => !newNodeIds.has(n.id)).map((n) => n.id);
    const edgesToRemove = currentEdges.filter((e) => !newEdgeIds.has(e.id)).map((e) => e.id);

    if (nodesToRemove.length > 0) nodesDatasetRef.current.remove(nodesToRemove);
    if (edgesToRemove.length > 0) edgesDatasetRef.current.remove(edgesToRemove);

    nodesDatasetRef.current.update(newNodes);
    edgesDatasetRef.current.update(newEdges);
  }, [graphData]);

  // Initialize or re-layout Network only when layoutMode changes or on mount
  useEffect(() => {
    if (!containerRef.current || !nodesDatasetRef.current || !edgesDatasetRef.current) return;

    const isHierarchical = layoutMode === "hierarchical";

    const options = {
      layout: isHierarchical
        ? {
            hierarchical: {
              enabled: true,
              direction: "UD", // Top to Bottom (Spine -> Leaf -> Hosts)
              sortMethod: "directed",
              levelSeparation: 150,
              nodeSpacing: 280,
              treeSpacing: 300,
              blockShifting: true,
              edgeMinimization: true,
              parentCentralization: true,
            },
          }
        : {
            hierarchical: { enabled: false },
            improvedLayout: true,
          },
      physics: isHierarchical
        ? {
            enabled: false,
          }
        : {
            enabled: true,
            solver: "forceAtlas2Based",
            forceAtlas2Based: {
              gravitationalConstant: -100,
              centralGravity: 0.012,
              springLength: 160,
              springConstant: 0.06,
              damping: 0.9,
              avoidOverlap: 1,
            },
            stabilization: { iterations: 100 },
          },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        zoomView: true,
        dragView: true,
        dragNodes: true,
        navigationButtons: false,
      },
    };

    const network = new Network(
      containerRef.current,
      { nodes: nodesDatasetRef.current, edges: edgesDatasetRef.current },
      options
    );
    networkRef.current = network;

    network.on("click", (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const nodeItem = nodesDatasetRef.current.get(nodeId);
        if (nodeItem?.data) {
          setSelectedNodeDetails(nodeItem.data);
        }
      } else {
        setSelectedNodeDetails(null);
      }
    });

    // Fit only on initial mount or when switching layout mode
    setTimeout(() => {
      network.fit({ animation: { duration: 350 } });
    }, 200);

    return () => {
      network.destroy();
    };
  }, [layoutMode]);

  // Controls
  const handleZoomIn = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale();
      networkRef.current.moveTo({ scale: scale * 1.25, animation: { duration: 200 } });
    }
  };

  const handleZoomOut = () => {
    if (networkRef.current) {
      const scale = networkRef.current.getScale();
      networkRef.current.moveTo({ scale: scale * 0.8, animation: { duration: 200 } });
    }
  };

  const handleFit = () => {
    if (networkRef.current) {
      networkRef.current.fit({ animation: { duration: 300 } });
    }
  };

  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(24, 24, 27, 0.7) 0%, rgba(9, 9, 11, 0.9) 100%)",
        border: "1px solid var(--theme-card-border)",
        borderRadius: 20,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        marginBottom: 24,
        position: "relative",
        boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.5)",
      }}
    >
      {/* Top Header & Filter Toolbar */}
      <div
        style={{
          padding: "16px 22px",
          borderBottom: "1px solid var(--theme-card-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
          background: "rgba(18, 18, 20, 0.6)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Sparkles size={19} color="#818cf8" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--color-zinc-50)", letterSpacing: -0.2 }}>
              Network Slicing Topology
            </div>
            <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginTop: 1 }}>
              Visualizing physical devices, VLAN isolation boundaries, and routed paths
            </div>
          </div>
        </div>

        {/* Slice Filter Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setSelectedSliceId("ALL")}
            style={{
              padding: "6px 14px",
              borderRadius: 9,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              border: selectedSliceId === "ALL" ? "1px solid #6366f1" : "1px solid var(--theme-card-border)",
              background: selectedSliceId === "ALL" ? "rgba(99, 102, 241, 0.2)" : "rgba(24, 24, 27, 0.6)",
              color: selectedSliceId === "ALL" ? "#a5b4fc" : "var(--theme-text-muted)",
              boxShadow: selectedSliceId === "ALL" ? "0 0 15px rgba(99, 102, 241, 0.3)" : "none",
              transition: "all 0.15s ease",
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
                  gap: 7,
                  padding: "6px 14px",
                  borderRadius: 9,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: `1px solid ${isSelected ? slice.color : `${slice.color}35`}`,
                  background: isSelected ? `${slice.color}25` : `${slice.color}10`,
                  color: isSelected ? "#ffffff" : slice.color,
                  boxShadow: isSelected ? `0 0 15px ${slice.color}40` : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: slice.color }} />
                {slice.name} <span style={{ opacity: 0.7, fontSize: 10 }}>VLAN {slice.vlanId}</span>
              </button>
            );
          })}
        </div>

        {/* View Layout & Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setLayoutMode(layoutMode === "hierarchical" ? "organic" : "hierarchical")}
            title={layoutMode === "hierarchical" ? "Switch to Organic Layout" : "Switch to Hierarchical 3-Tier Layout"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid var(--theme-card-border)",
              background: "rgba(24, 24, 27, 0.8)",
              color: "var(--color-zinc-50)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <LayoutGrid size={13} color="#818cf8" />
            <span>{layoutMode === "hierarchical" ? "Tiered View" : "Force View"}</span>
          </button>

          <button
            onClick={handleZoomIn}
            title="Zoom In"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--theme-card-border)",
              background: "rgba(24, 24, 27, 0.8)",
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
              background: "rgba(24, 24, 27, 0.8)",
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
              background: "rgba(24, 24, 27, 0.8)",
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
                background: "rgba(24, 24, 27, 0.8)",
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
      <div style={{ position: "relative", width: "100%", height: 480 }}>
        {/* Subtle grid background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
            pointerEvents: "none",
          }}
        />

        <div ref={containerRef} style={{ width: "100%", height: "100%", background: "transparent" }} />

        {/* Selected Node Details Drawer */}
        <AnimatePresence>
          {selectedNodeDetails && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                width: 300,
                background: "rgba(18, 18, 22, 0.95)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 16,
                padding: 18,
                boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.7)",
                zIndex: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: selectedNodeDetails.type === "switch" ? "rgba(99,102,241,0.2)" : `${selectedNodeDetails.slice?.color || "#71717a"}25`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {selectedNodeDetails.type === "switch" ? (
                      <Cpu size={16} color="#818cf8" />
                    ) : (
                      <Monitor size={16} color={selectedNodeDetails.slice?.color || "#a1a1aa"} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-zinc-50)" }}>
                      {selectedNodeDetails.type === "switch"
                        ? `Switch ${selectedNodeDetails.name}`
                        : `Host ${selectedNodeDetails.ip}`}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>
                      {selectedNodeDetails.type === "switch" ? (selectedNodeDetails.isCore ? "Spine / Core Switch" : "Leaf / Edge Switch") : "Virtual Endpoint"}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNodeDetails(null)}
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "none",
                    borderRadius: 6,
                    color: "var(--theme-text-muted)",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <X size={13} />
                </button>
              </div>

              {selectedNodeDetails.type === "host" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>MAC Address:</span>
                    <span style={{ fontFamily: "monospace", color: "var(--color-zinc-50)", fontWeight: 600 }}>
                      {selectedNodeDetails.mac}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>Slice:</span>
                    {selectedNodeDetails.slice ? (
                      <span
                        style={{
                          fontWeight: 700,
                          color: selectedNodeDetails.slice.color,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: `${selectedNodeDetails.slice.color}20`,
                          border: `1px solid ${selectedNodeDetails.slice.color}40`,
                        }}
                      >
                        {selectedNodeDetails.slice.name} (VLAN {selectedNodeDetails.slice.vlanId})
                      </span>
                    ) : (
                      <span style={{ color: "#f59e0b", fontWeight: 600 }}>Unassigned</span>
                    )}
                  </div>
                  {selectedNodeDetails.slice && (
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span style={{ color: "var(--theme-text-muted)" }}>Bandwidth Cap:</span>
                      <span style={{ color: "var(--color-zinc-50)", fontWeight: 700 }}>
                        {selectedNodeDetails.slice.bandwidth} KB/s
                      </span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>Attachment:</span>
                    <span style={{ color: "#a5b4fc", fontFamily: "monospace", fontWeight: 600 }}>
                      {selectedNodeDetails.switchId
                        ? `${getSwitchDisplayName({ id: selectedNodeDetails.switchId })} : Port ${selectedNodeDetails.port || 1}`
                        : selectedNodeDetails.host?.locations?.[0]
                        ? `${getSwitchDisplayName({ id: selectedNodeDetails.host.locations[0].elementId })} : Port ${selectedNodeDetails.host.locations[0].port}`
                        : "—"}
                    </span>
                  </div>
                </div>
              )}

              {selectedNodeDetails.type === "switch" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>Datapath ID:</span>
                    <span style={{ fontFamily: "monospace", color: "var(--color-zinc-50)", fontSize: 10 }}>
                      {selectedNodeDetails.device.id}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>Protocol:</span>
                    <span style={{ color: "#22c55e", fontWeight: 700 }}>
                      {selectedNodeDetails.device.annotations?.protocol || "OF_13"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--theme-text-muted)" }}>Status:</span>
                    <span style={{ color: "#22c55e", fontWeight: 700 }}>ONLINE</span>
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
          padding: "12px 22px",
          background: "rgba(18, 18, 20, 0.7)",
          borderTop: "1px solid var(--theme-card-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--theme-text-muted)" }}>
            <Shield size={13} color="#22c55e" />
            <span>Hardware Isolation: <b style={{ color: "#22c55e" }}>Active</b></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--theme-text-muted)" }}>
            <Zap size={13} color="#f59e0b" />
            <span>Boundary: <b style={{ color: "#f59e0b" }}>Priority 39000</b></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--theme-text-muted)" }}>
            <Activity size={13} color="#818cf8" />
            <span>Routing: <b style={{ color: "#818cf8" }}>Priority 40000 End-to-End</b></span>
          </div>
        </div>

        <div style={{ color: "var(--theme-text-muted)", fontSize: 11, fontWeight: 500 }}>
          {hosts.length} Hosts • {devices.length} Switches • {slices.length} Slices Active
        </div>
      </div>
    </div>
  );
}
