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
  Filter,
  ChevronDown,
  Check,
} from "lucide-react";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getHostDisplayName(host) {
  if (!host) return "Host";
  const ips = host.ipAddresses || host.ips || [];
  const ip = ips.find((i) => !i.includes(":")) || ips[0];
  const name = host.name || (host.id?.startsWith("host:h") ? host.id.replace("host:", "") : null);
  if (name && ip) return `Host ${name} (${ip})`;
  if (ip) return `Host: ${ip}`;
  return host.mac ? `Host ${host.mac.slice(-8)}` : "Host";
}

function getSwitchDisplayName(dev) {
  if (!dev) return "Switch";
  const desc = dev.annotations?.datapathDescription || dev.annotations?.bridgeName || dev.label;
  if (desc && desc !== "None" && !desc.includes(":") && desc.length < 15) return desc;
  const parts = String(dev.id || "").split(":");
  const last = parts[parts.length - 1];
  const num = parseInt(last, 16);
  if (!isNaN(num) && num < 100) return `s${num}`;
  return last ? `sw-${last.slice(-4)}` : (dev.id ? dev.id.slice(-8) : "Switch");
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
  const [layoutMode, setLayoutMode] = useState("hierarchical"); // 'hierarchical' (Tiered View) is the default
  const [selectedNodeDetails, setSelectedNodeDetails] = useState(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close slice filter dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsFilterDropdownOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

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

  // Only consider active/connected OpenFlow devices
  const activeDevices = useMemo(() => {
    return (devices || []).filter((d) => d.available !== false && d.available !== "false");
  }, [devices]);

  // Use unified host list provided by parent (slicingService / ONOS)
  const combinedHosts = useMemo(() => {
    if (activeDevices.length === 0) return [];
    if (hosts && hosts.length > 0) return hosts;
    return [];
  }, [hosts, activeDevices]);

  // Determine Core vs Leaf Switches for Hierarchical Levels
  const switchLevelMap = useMemo(() => {
    const map = new Map();
    for (const dev of activeDevices) {
      const name = (dev.annotations?.datapathDescription || dev.label || "").toLowerCase();
      const parts = String(dev.id || "").split(":");
      const num = parseInt(parts[parts.length - 1], 16);
      if (name === "s1" || name.includes("core") || name.includes("spine") || num === 1) {
        map.set(dev.id, 0); // Core Level
      } else {
        map.set(dev.id, 1); // Leaf Level
      }
    }

    if (![...map.values()].includes(0) && activeDevices.length > 0) {
      map.set(activeDevices[0].id, 0);
    }

    return map;
  }, [activeDevices]);

  // Build Vis Network Nodes & Edges
  const graphData = useMemo(() => {
    const nodes = [];
    const edges = [];
    const edgeIdSet = new Set();
    const activeDevIds = new Set(activeDevices.map((d) => d.id));

    // 1. Add Switches (matching normal topology appearance)
    for (const dev of activeDevices) {
      const devName = getSwitchDisplayName(dev);
      const isCore = (switchLevelMap.get(dev.id) ?? 1) === 0;

      nodes.push({
        id: dev.id,
        label: devName,
        group: "switch",
        shape: "image",
        image: "/assets/images/Device_switch_3062_unknown_64.png",
        size: 30,
        level: layoutMode === "hierarchical" ? (isCore ? 0 : 1) : undefined,
        font: {
          color: "#38bdf8",
          background: "rgba(15, 23, 42, 0.9)",
          face: "Inter, system-ui, sans-serif",
          size: 12,
          strokeWidth: 2,
          strokeColor: "#09090b",
          bold: true,
        },
        shadow: {
          enabled: true,
          color: "rgba(0, 0, 0, 0.6)",
          size: 8,
          x: 0,
          y: 4,
        },
        data: { type: "switch", device: dev, name: devName, isCore },
      });
    }

    // 2. Add Inter-Switch Links (discovered links + trunk links)
    for (const link of links || []) {
      const srcDev = link.src?.device || link.from;
      const dstDev = link.dst?.device || link.to;
      if (!srcDev || !dstDev || srcDev === dstDev) continue;
      if (!activeDevIds.has(srcDev) || !activeDevIds.has(dstDev)) continue;

      const linkKey = [srcDev, dstDev].sort().join("<->");
      if (edgeIdSet.has(linkKey)) continue;
      edgeIdSet.add(linkKey);

      edges.push({
        id: linkKey,
        from: srcDev,
        to: dstDev,
        title: link.title || `Trunk Link: <b>${getSwitchDisplayName({ id: srcDev })}</b> &harr; <b>${getSwitchDisplayName({ id: dstDev })}</b>`,
        color: {
          color: "#6366f1",
          highlight: "#818cf8",
          hover: "#a5b4fc",
        },
        width: 2.5,
        smooth: false,
        arrows: { to: { enabled: false }, from: { enabled: false } },
        shadow: {
          enabled: true,
          color: "rgba(99, 102, 241, 0.4)",
          size: 6,
        },
        data: { type: "inter-switch", link },
      });
    }

    // Fallback: Ensure all leaf switches have trunk link to root switch s1
    const s1Id = activeDevices.find((d) => (switchLevelMap.get(d.id) ?? 1) === 0)?.id;
    if (s1Id && activeDevices.length > 1) {
      for (const dev of activeDevices) {
        if (dev.id === s1Id) continue;
        const linkKey = [s1Id, dev.id].sort().join("<->");
        if (!edgeIdSet.has(linkKey)) {
          edgeIdSet.add(linkKey);
          edges.push({
            id: linkKey,
            from: s1Id,
            to: dev.id,
            title: `Trunk Link: <b>${getSwitchDisplayName({ id: s1Id })}</b> &harr; <b>${getSwitchDisplayName(dev)}</b>`,
            color: {
              color: "#6366f1",
              highlight: "#818cf8",
              hover: "#a5b4fc",
            },
            width: 2.5,
            smooth: false,
            arrows: { to: { enabled: false }, from: { enabled: false } },
            shadow: {
              enabled: true,
              color: "rgba(99, 102, 241, 0.4)",
              size: 6,
            },
            data: { type: "inter-switch-trunk" },
          });
        }
      }
    }

    // 3. Add Hosts & Host-to-Switch Links
    for (const host of combinedHosts) {
      const mac = (host.mac || "").toLowerCase();
      const ip = (host.ipAddresses || host.ips || [])[0] || (host.mac ? host.mac.slice(-8) : "Host");
      const assignedSlice = hostSliceMap.get(mac) || hostSliceMap.get(ip.toLowerCase());
      const isVisibleInFilter =
        selectedSliceId === "ALL" || (assignedSlice && assignedSlice.id === selectedSliceId);

      const sliceColor = assignedSlice?.color || "#6366f1";
      const isInSlice = Boolean(assignedSlice);

      // Identify connected switch
      const targetSwitchId =
        host.deviceId ||
        host.location?.elementId ||
        host.locations?.[0]?.elementId ||
        (activeDevices.length > 0 ? activeDevices[activeDevices.length - 1].id : null);
      const portNumber = host.port || host.location?.port || host.locations?.[0]?.port || "1";

      const hostBaseName = getHostDisplayName(host);
      const hostLabel = isInSlice
        ? `${hostBaseName}\n[VLAN ${assignedSlice.vlanId}]`
        : hostBaseName;

      const hostNodeId = host.id || `host:${mac || ip}`;

      nodes.push({
        id: hostNodeId,
        label: hostLabel,
        group: "host",
        shape: "image",
        image: "/assets/images/Device_pc_3045_default_64.png",
        size: 28,
        level: layoutMode === "hierarchical" ? 2 : undefined,
        font: {
          color: isInSlice ? "#ffffff" : "#a7f3d0",
          background: isInSlice ? "rgba(24, 24, 27, 0.92)" : "rgba(6, 78, 59, 0.9)",
          face: "Inter, system-ui, sans-serif",
          size: 11,
          bold: isInSlice,
          strokeWidth: 2,
          strokeColor: isInSlice ? sliceColor : "#09090b",
          multi: true,
        },
        opacity: isVisibleInFilter ? 1 : 0.2,
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
          title: isInSlice
            ? `${hostBaseName} ↔ ${getSwitchDisplayName({ id: targetSwitchId })} [${assignedSlice.name} • VLAN ${assignedSlice.vlanId}]`
            : `${hostBaseName} ↔ ${getSwitchDisplayName({ id: targetSwitchId })} (Port ${portNumber})`,
          color: {
            color: isInSlice ? sliceColor : "#10b981",
            opacity: isVisibleInFilter ? 1 : 0.2,
          },
          width: isInSlice ? 2.5 : 2,
          dashes: false,
          smooth: false,
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
      width: "100%",
      height: "480px",
      nodes: {
        size: 30,
        font: {
          face: "Inter, system-ui, sans-serif",
          size: 12,
        },
      },
      edges: {
        length: 220,
        color: {
          color: "#3f3f46",
          highlight: "#6366f1",
          hover: "#10b981",
        },
        smooth: false,
      },
      layout: isHierarchical
        ? {
            hierarchical: {
              enabled: true,
              direction: "UD", // Top to Bottom (Spine -> Leaf -> Hosts)
              sortMethod: "hubsize",
              levelSeparation: 140,
              nodeSpacing: 220,
              treeSpacing: 260,
              blockShifting: true,
              edgeMinimization: true,
              parentCentralization: true,
            },
          }
        : {
            hierarchical: { enabled: false },
          },
      physics: isHierarchical
        ? {
            enabled: false,
          }
        : {
            enabled: true,
            barnesHut: {
              gravitationalConstant: -8000,
              centralGravity: 0.3,
              springLength: 150,
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
        overflow: "visible",
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
          background: "rgba(18, 18, 20, 0.85)",
          backdropFilter: "blur(10px)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          position: "relative",
          zIndex: 60,
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

        {/* View Layout & Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Tiered View vs Forced View Segmented Switcher */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(24, 24, 27, 0.85)",
              border: "1px solid var(--theme-card-border)",
              borderRadius: 10,
              padding: 3,
              gap: 2,
            }}
          >
            <button
              onClick={() => setLayoutMode("hierarchical")}
              title="Tiered View (Spine -> Leaf -> Hosts 3-Tier Hierarchy)"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: 7,
                fontSize: 11,
                fontWeight: layoutMode === "hierarchical" ? 700 : 500,
                cursor: "pointer",
                border: "none",
                background: layoutMode === "hierarchical" ? "rgba(99, 102, 241, 0.3)" : "transparent",
                color: layoutMode === "hierarchical" ? "#c7d2fe" : "var(--theme-text-muted)",
                boxShadow: layoutMode === "hierarchical" ? "0 0 10px rgba(99, 102, 241, 0.25)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <LayoutGrid size={12} color={layoutMode === "hierarchical" ? "#818cf8" : "currentColor"} />
              <span>Tiered View</span>
            </button>
            <button
              onClick={() => setLayoutMode("forced")}
              title="Forced View (BarnesHut Force-Directed Simulation)"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: 7,
                fontSize: 11,
                fontWeight: layoutMode === "forced" ? 700 : 500,
                cursor: "pointer",
                border: "none",
                background: layoutMode === "forced" ? "rgba(99, 102, 241, 0.3)" : "transparent",
                color: layoutMode === "forced" ? "#c7d2fe" : "var(--theme-text-muted)",
                boxShadow: layoutMode === "forced" ? "0 0 10px rgba(99, 102, 241, 0.25)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <span>Forced View</span>
            </button>
          </div>

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
      <div style={{ position: "relative", width: "100%", height: 480, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, overflow: "hidden" }}>
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

        {/* Floating Slice Filter Dropdown Overlay (Inside Topology Canvas) */}
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            zIndex: 25,
          }}
        >
          {(() => {
            const activeSlice = slices.find((s) => s.id === selectedSliceId);
            return (
              <>
                <button
                  type="button"
                  onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "7px 14px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: activeSlice
                      ? `1.5px solid ${activeSlice.color}`
                      : "1px solid rgba(255, 255, 255, 0.18)",
                    background: activeSlice
                      ? "rgba(18, 18, 22, 0.92)"
                      : "rgba(18, 18, 22, 0.85)",
                    backdropFilter: "blur(12px)",
                    color: "#ffffff",
                    boxShadow: activeSlice
                      ? `0 8px 24px rgba(0, 0, 0, 0.6), 0 0 12px ${activeSlice.color}35`
                      : "0 8px 24px rgba(0, 0, 0, 0.6)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <Filter size={13} color={activeSlice ? activeSlice.color : "#818cf8"} />
                  <span style={{ color: "var(--theme-text-muted)", fontWeight: 500, fontSize: 11 }}>Slice:</span>
                  {activeSlice ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: activeSlice.color, boxShadow: `0 0 6px ${activeSlice.color}` }} />
                      <span style={{ color: "#ffffff", fontWeight: 700 }}>{activeSlice.name}</span>
                      <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: `${activeSlice.color}30`, color: activeSlice.color, fontWeight: 700 }}>
                        VLAN {activeSlice.vlanId}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: "#ffffff", fontWeight: 700 }}>All Slices ({slices.length})</span>
                  )}
                  <ChevronDown
                    size={14}
                    color="#a5b4fc"
                    style={{
                      transform: isFilterDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                      marginLeft: 2,
                    }}
                  />
                </button>

                <AnimatePresence>
                  {isFilterDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        minWidth: 260,
                        background: "#18181b",
                        border: "1.5px solid #4f46e5",
                        borderRadius: 12,
                        padding: 7,
                        boxShadow: "0 20px 45px rgba(0, 0, 0, 0.9), 0 0 20px rgba(99, 102, 241, 0.25)",
                        zIndex: 9999,
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                        pointerEvents: "auto",
                      }}
                    >
                      <div style={{ padding: "4px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#818cf8" }}>
                        Filter Topology by Slice
                      </div>

                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedSliceId("ALL");
                          setIsFilterDropdownOpen(false);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSliceId("ALL");
                          setIsFilterDropdownOpen(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "9px 12px",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: selectedSliceId === "ALL" ? 700 : 500,
                          border: selectedSliceId === "ALL" ? "1px solid rgba(99, 102, 241, 0.6)" : "1px solid transparent",
                          background: selectedSliceId === "ALL" ? "rgba(99, 102, 241, 0.25)" : "rgba(39, 39, 42, 0.5)",
                          color: selectedSliceId === "ALL" ? "#ffffff" : "var(--color-zinc-300)",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Layers size={14} color="#818cf8" />
                          <span>All Slices</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>({slices.length})</span>
                          {selectedSliceId === "ALL" && <Check size={14} color="#818cf8" />}
                        </div>
                      </button>

                      {slices.length > 0 && (
                        <div style={{ height: 1, background: "rgba(255, 255, 255, 0.1)", margin: "3px 0" }} />
                      )}

                      {slices.map((slice) => {
                        const isSelected = selectedSliceId === slice.id;
                        return (
                          <button
                            key={slice.id}
                            type="button"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              setSelectedSliceId(slice.id);
                              setIsFilterDropdownOpen(false);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSliceId(slice.id);
                              setIsFilterDropdownOpen(false);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "9px 12px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: isSelected ? 700 : 500,
                              border: isSelected ? `1px solid ${slice.color}` : "1px solid transparent",
                              background: isSelected ? `${slice.color}25` : "rgba(39, 39, 42, 0.5)",
                              color: isSelected ? "#ffffff" : "var(--color-zinc-300)",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: slice.color, flexShrink: 0, boxShadow: `0 0 6px ${slice.color}` }} />
                              <span style={{ color: isSelected ? "#ffffff" : "var(--color-zinc-200)" }}>{slice.name}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: slice.color, background: `${slice.color}20`, padding: "2px 6px", borderRadius: 4 }}>
                                VLAN {slice.vlanId}
                              </span>
                              {isSelected && <Check size={14} color={slice.color} />}
                            </div>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            );
          })()}
        </div>

        <div ref={containerRef} style={{ width: "100%", height: "100%", background: "transparent" }} />

        {/* Empty State Overlay when no switches are connected */}
        {activeDevices.length === 0 && !loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "rgba(12, 12, 16, 0.8)",
              backdropFilter: "blur(4px)",
              zIndex: 4,
              borderRadius: 12,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(99, 102, 241, 0.1)",
                border: "1px solid rgba(99, 102, 241, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Cpu size={22} color="#818cf8" />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-zinc-50)" }}>
              No Active SDN Switches Connected
            </div>
            <div style={{ fontSize: 11, color: "var(--theme-text-muted)", maxWidth: 360, textAlign: "center", lineHeight: 1.4 }}>
              Start Mininet (e.g. <code>sudo mn --controller=remote...</code>) or connect OpenFlow switches to visualize the slice topology.
            </div>
          </div>
        )}

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
