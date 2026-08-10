import React, { useEffect, useRef, useState } from "react";
import { DataSet } from "vis-data";
import { Network } from "vis-network";
import { X, Info, Layout, Server, Globe, Monitor, Cpu, Network as NetIcon } from "lucide-react";

const CloudTopology = ({ virtualMachines, networks, routers, ports, onClose }) => {
  const containerRef = useRef(null);
  const [networkInstance, setNetworkInstance] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const nodesArray = [];
    const edgesArray = [];

    // 1. Add Routers
    routers?.forEach((router) => {
      nodesArray.push({
        id: router.id,
        label: router.name || "Router",
        title: `<b>Router</b><br>Name: <b>${router.name || "N/A"}</b><br>ID: <b>${router.id}</b><br>Status: <b>${router.status}</b>`,
        group: "router",
        value: 30,
        entityData: router,
      });
    });

    // 2. Add Networks (Logical Switches)
    networks?.forEach((net) => {
      const segLabel = net.segmentation ? ` (${net.segmentation})` : "";
      nodesArray.push({
        id: net.id,
        label: `${net.name || "Network"}`,
        title: `<b>Network</b><br>Name: <b>${net.name || "N/A"}</b><br>CIDR: <b>${net.cidr || "N/A"}</b><br>Type: <b>${net.type || "OVN Logical Switch"}</b><br>Segmentation: <b>${net.segmentation || "N/A"}</b>`,
        group: "network",
        value: 25,
        entityData: net,
      });
    });

    // 3. Add Virtual Machines
    virtualMachines?.forEach((vm) => {
      const isActive = vm.status === "ACTIVE";
      nodesArray.push({
        id: vm.id,
        label: vm.name || "VM",
        title: `<b>Virtual Machine</b><br>Name: <b>${vm.name}</b><br>IP: <b>${vm.ip || "N/A"}</b><br>Status: <b>${vm.status}</b><br>Network: <b>${vm.network || "N/A"}</b><br>Zone: <b>${vm.zone || "N/A"}</b>`,
        group: isActive ? "vm-active" : "vm-inactive",
        value: 20,
        entityData: vm,
      });

      // Connect VM to its network
      if (vm.logicalSwitch) {
        const netId = vm.logicalSwitch.replace("neutron-", "");
        edgesArray.push({
          from: vm.id,
          to: netId,
          title: `<b>${vm.name}</b> → <b>${vm.network || netId}</b><br>IP: <b>${vm.ip || "N/A"}</b>`,
          color: { color: isActive ? "#10b981" : "#52525b" },
          width: 2,
          smooth: { type: "curvedCW", roundness: 0.1 },
        });
      }
    });

    // 4. Connect Routers to Networks via Ports
    ports?.forEach((port) => {
      if (port.device_owner === "network:router_interface") {
        const routerId = port.device_id;
        const netId = port.network_id;
        if (routerId && netId) {
          edgesArray.push({
            from: routerId,
            to: netId,
            title: `<b>Router Interface</b><br>Port: <b>${port.id?.slice(0, 8) || "N/A"}</b>`,
            color: { color: "#818cf8" },
            width: 3,
            dashes: [8, 4],
            smooth: { type: "curvedCW", roundness: 0.15 },
          });
        }
      }
      // Router gateway (external network connection)
      if (port.device_owner === "network:router_gateway") {
        const routerId = port.device_id;
        const netId = port.network_id;
        if (routerId && netId) {
          edgesArray.push({
            from: routerId,
            to: netId,
            title: `<b>Router Gateway</b><br>External Network`,
            color: { color: "#f59e0b" },
            width: 3,
            dashes: [12, 6],
            smooth: { type: "curvedCCW", roundness: 0.15 },
          });
        }
      }
    });

    const nodesDataSet = new DataSet(nodesArray);
    const edgesDataSet = new DataSet(edgesArray);

    const data = { nodes: nodesDataSet, edges: edgesDataSet };

    const options = {
      autoResize: true,
      height: "100%",
      width: "100%",
      nodes: {
        size: 30,
        font: {
          color: "#f4f4f5",
          face: "Inter, system-ui, sans-serif",
          size: 13,
          background: "rgba(24, 24, 27, 0.85)",
          strokeWidth: 2,
          strokeColor: "#09090b",
        },
        borderWidth: 2,
        shadow: {
          enabled: true,
          color: "rgba(0,0,0,0.4)",
          size: 8,
          x: 0,
          y: 2,
        },
      },
      edges: {
        length: 200,
        color: {
          color: "#3f3f46",
          highlight: "#6366f1",
          hover: "#818cf8",
        },
        smooth: {
          type: "continuous",
        },
        font: {
          color: "#71717a",
          face: "Inter, system-ui, sans-serif",
          size: 10,
          strokeWidth: 3,
          strokeColor: "#09090b",
        },
      },
      physics: {
        barnesHut: {
          gravitationalConstant: -6000,
          centralGravity: 0.25,
          springLength: 180,
          springConstant: 0.04,
          damping: 0.12,
        },
        stabilization: {
          iterations: 150,
        },
      },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        zoomView: true,
        dragView: true,
      },
      groups: {
        router: {
          shape: "box",
          color: {
            background: "#1e1b4b",
            border: "#6366f1",
            highlight: { background: "#312e81", border: "#818cf8" },
            hover: { background: "#312e81", border: "#a5b4fc" },
          },
          font: { color: "#e0e7ff", face: "Inter, system-ui, sans-serif", size: 14, bold: true },
          borderWidth: 2,
          shapeProperties: { borderRadius: 8 },
          margin: 14,
          shadow: {
            enabled: true,
            color: "rgba(99, 102, 241, 0.3)",
            size: 12,
          },
        },
        network: {
          shape: "box",
          color: {
            background: "#064e3b",
            border: "#10b981",
            highlight: { background: "#065f46", border: "#34d399" },
            hover: { background: "#065f46", border: "#6ee7b7" },
          },
          font: { color: "#ecfdf5", face: "Inter, system-ui, sans-serif", size: 13, bold: true },
          borderWidth: 2,
          shapeProperties: { borderRadius: 6 },
          margin: 12,
          shadow: {
            enabled: true,
            color: "rgba(16, 185, 129, 0.25)",
            size: 10,
          },
        },
        "vm-active": {
          shape: "box",
          color: {
            background: "#1c1917",
            border: "#22c55e",
            highlight: { background: "#292524", border: "#4ade80" },
            hover: { background: "#292524", border: "#86efac" },
          },
          font: { color: "#fafaf9", face: "Inter, system-ui, sans-serif", size: 12 },
          borderWidth: 2,
          shapeProperties: { borderRadius: 6 },
          margin: 10,
          shadow: {
            enabled: true,
            color: "rgba(34, 197, 94, 0.2)",
            size: 8,
          },
        },
        "vm-inactive": {
          shape: "box",
          color: {
            background: "#1c1917",
            border: "#a16207",
            highlight: { background: "#292524", border: "#eab308" },
            hover: { background: "#292524", border: "#facc15" },
          },
          font: { color: "#fafaf9", face: "Inter, system-ui, sans-serif", size: 12 },
          borderWidth: 2,
          shapeProperties: { borderRadius: 6 },
          margin: 10,
          shadow: {
            enabled: true,
            color: "rgba(161, 98, 7, 0.2)",
            size: 8,
          },
        },
      },
    };

    const network = new Network(containerRef.current, data, options);
    setNetworkInstance(network);

    // ── Click handler with path highlight ──
    const restoreDefaults = () => {
      const allNodes = nodesDataSet.get();
      const allEdges = edgesDataSet.get();
      nodesDataSet.update(allNodes.map((n) => ({ id: n.id, borderWidth: 2, opacity: 1 })));
      edgesDataSet.update(
        allEdges.map((e) => {
          const baseColor = e.color ? (typeof e.color === "object" ? e.color.color : e.color) : "#3f3f46";
          return { id: e.id, color: { color: baseColor }, width: e.dashes ? 3 : 2, opacity: 1 };
        })
      );
    };

    network.on("click", (params) => {
      try {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          const node = nodesArray.find((n) => String(n.id) === String(nodeId));

          if (node) {
            setSelectedNode(node);

            // Highlight connected path
            const connectedEdges = network.getConnectedEdges(nodeId);
            const connectedNodes = new Set([nodeId, ...network.getConnectedNodes(nodeId)]);

            // Second-degree connections (e.g. VM → Network → Router)
            network.getConnectedNodes(nodeId).forEach((neighborId) => {
              const neighborNode = nodesDataSet.get(neighborId);
              if (neighborNode) {
                network.getConnectedNodes(neighborId).forEach((secondId) => {
                  connectedNodes.add(secondId);
                });
                network.getConnectedEdges(neighborId).forEach((eId) => {
                  const edge = edgesDataSet.get(eId);
                  if (edge && connectedNodes.has(edge.from) && connectedNodes.has(edge.to)) {
                    connectedEdges.push(eId);
                  }
                });
              }
            });

            const uniqueEdges = [...new Set(connectedEdges)];

            // Dim non-connected, highlight connected
            const allNodes = nodesDataSet.get();
            const allEdges = edgesDataSet.get();

            nodesDataSet.update(
              allNodes.map((n) => ({
                id: n.id,
                borderWidth: connectedNodes.has(n.id) ? 4 : 2,
                opacity: connectedNodes.has(n.id) ? 1 : 0.25,
              }))
            );

            edgesDataSet.update(
              allEdges.map((e) => {
                const baseColor = e.color ? (typeof e.color === "object" ? e.color.color : e.color) : "#3f3f46";
                if (uniqueEdges.includes(e.id)) {
                  return { id: e.id, color: { color: baseColor }, width: 4, opacity: 1 };
                }
                return { id: e.id, color: { color: "#27272a" }, width: 1, opacity: 0.15 };
              })
            );
          } else {
            setSelectedNode(null);
            restoreDefaults();
          }
        } else {
          setSelectedNode(null);
          restoreDefaults();
        }
      } catch (err) {
        console.error("Topology Click Error:", err);
      }
    });

    return () => {
      network.destroy();
    };
  }, [virtualMachines, networks, routers, ports]);

  // ── Node Details Panel Renderer ──
  const renderNodeDetails = () => {
    if (!selectedNode) {
      return (
        <p className="text-zinc-500 text-xs leading-relaxed">
          Click on any node in the topology graph to inspect its metadata, connections, and status.
        </p>
      );
    }

    const entity = selectedNode.entityData;
    const group = selectedNode.group;

    if (group === "router" && entity) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Server className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-bold text-zinc-100">{entity.name || "Router"}</span>
            <span className={`ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full ${entity.status === "ACTIVE" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-zinc-800 text-zinc-400"}`}>
              {entity.status}
            </span>
          </div>
          <div className="space-y-2">
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Router ID</span>
              <span className="block text-xs font-mono font-semibold text-zinc-200 break-all bg-zinc-950 p-1.5 rounded border border-zinc-800 mt-0.5">{entity.id}</span>
            </div>
            {entity.external_gateway_info && (
              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">External Gateway</span>
                <span className="block text-xs font-mono text-indigo-300 mt-0.5">
                  Network: {entity.external_gateway_info.network_id?.slice(0, 12) || "N/A"}...
                </span>
              </div>
            )}
            {entity.routes && entity.routes.length > 0 && (
              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Static Routes</span>
                <span className="block text-xs text-zinc-300 mt-0.5">{entity.routes.length} route(s)</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (group === "network" && entity) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold text-zinc-100">{entity.name || "Network"}</span>
            <span className={`ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full ${entity.status === "ACTIVE" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-zinc-800 text-zinc-400"}`}>
              {entity.status}
            </span>
          </div>
          <div className="space-y-2">
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Network ID</span>
              <span className="block text-xs font-mono font-semibold text-zinc-200 break-all bg-zinc-950 p-1.5 rounded border border-zinc-800 mt-0.5">{entity.id}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase">CIDR</span>
              <span className="block text-xs font-mono text-emerald-300 mt-0.5">{entity.cidr || "N/A"}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Type</span>
              <span className="block text-xs text-zinc-300 mt-0.5">{entity.type || "N/A"}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Segmentation</span>
              <span className="block text-xs font-mono text-cyan-400 mt-0.5">{entity.segmentation || "N/A"}</span>
            </div>
          </div>
        </div>
      );
    }

    if ((group === "vm-active" || group === "vm-inactive") && entity) {
      const isActive = entity.status === "ACTIVE";
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
            <Monitor className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-zinc-100">{entity.name || "VM"}</span>
            <span className={`ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full ${isActive ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-amber-950 text-amber-400 border border-amber-800"}`}>
              {entity.status}
            </span>
          </div>
          <div className="space-y-2">
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Instance ID</span>
              <span className="block text-xs font-mono font-semibold text-zinc-200 break-all bg-zinc-950 p-1.5 rounded border border-zinc-800 mt-0.5">{entity.id}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase">IP Address</span>
              <span className="block text-xs font-mono text-emerald-300 mt-0.5">{entity.ip || "N/A"}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Network</span>
              <span className="block text-xs text-zinc-300 mt-0.5">{entity.network || "N/A"}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Availability Zone</span>
              <span className="block text-xs text-zinc-400 mt-0.5">{entity.zone || "N/A"}</span>
            </div>
            {entity.logicalPort && (
              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Logical Port</span>
                <span className="block text-xs font-mono text-indigo-300 mt-0.5 break-all">{entity.logicalPort}</span>
              </div>
            )}
            {entity.logicalSwitch && (
              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Logical Switch</span>
                <span className="block text-xs font-mono text-cyan-400 mt-0.5 break-all">{entity.logicalSwitch}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Fallback
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
          <Cpu className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-bold text-zinc-100">{selectedNode.label}</span>
        </div>
        <div
          className="text-xs text-zinc-300 font-mono leading-relaxed space-y-1.5"
          dangerouslySetInnerHTML={{ __html: selectedNode.title }}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full" style={{ minHeight: "640px" }}>
      {/* Main Graph Panel */}
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h3 className="text-base font-bold text-zinc-200 flex items-center gap-2">
            <Layout className="w-5 h-5 text-indigo-400" />
            OpenStack OVN Cloud Topology
          </h3>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 font-bold rounded-lg text-xs flex items-center gap-1.5 transition duration-200 border border-zinc-700 hover:border-red-500/50"
          >
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>

        {/* Vis-Network Canvas */}
        <div
          ref={containerRef}
          className="w-full border border-zinc-800 rounded-lg relative overflow-hidden bg-zinc-950"
          style={{ height: "520px" }}
        />

        {/* Legend Bar */}
        <div className="flex flex-wrap items-center gap-5 text-xs text-zinc-300 bg-zinc-950/80 p-3.5 rounded-lg border border-zinc-800 shadow-inner">
          <span className="font-bold text-zinc-200 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-400" />
            Legend:
          </span>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-[#1e1b4b] border-2 border-indigo-500 inline-block shadow-sm" />
            <span>Router</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-[#064e3b] border-2 border-emerald-500 inline-block shadow-sm" />
            <span>Network</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-[#1c1917] border-2 border-green-500 inline-block shadow-sm" />
            <span>VM (Active)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-[#1c1917] border-2 border-amber-600 inline-block shadow-sm" />
            <span>VM (Inactive)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 bg-indigo-400 rounded-full inline-block" style={{ borderTop: "2px dashed #818cf8" }} />
            <span>Router Link</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 bg-emerald-500 rounded-full inline-block" />
            <span>VM Link</span>
          </div>
        </div>
      </div>

      {/* Node Inspector Panel */}
      <div className="w-full lg:w-80 bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg h-fit flex flex-col gap-4">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-3 flex items-center gap-2">
          <Info className="w-4 h-4 text-zinc-500" />
          Cloud Node Inspector
        </h3>
        {renderNodeDetails()}
      </div>

      {/* Vis tooltip styling override */}
      <style>{`
        .vis-tooltip {
          position: absolute;
          padding: 10px 14px;
          background-color: rgba(9, 9, 11, 0.95) !important;
          color: #f4f4f5 !important;
          border: 1px solid #3f3f46 !important;
          border-radius: 8px !important;
          font-family: Inter, system-ui, sans-serif !important;
          font-size: 11px !important;
          line-height: 1.6 !important;
          pointer-events: none;
          z-index: 100 !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6) !important;
          max-width: 300px;
        }
      `}</style>
    </div>
  );
};

export default CloudTopology;
