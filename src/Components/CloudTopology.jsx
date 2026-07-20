import React, { useEffect, useRef, useState } from "react";
import { DataSet } from "vis-data";
import { Network } from "vis-network";

const CloudTopology = ({ virtualMachines, networks, routers, ports, onClose }) => {
  const containerRef = useRef(null);
  const [networkInstance, setNetworkInstance] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // We create nodes and edges from our OpenStack data
    const nodesArray = [];
    const edgesArray = [];

    // 1. Add Routers
    routers?.forEach((router) => {
      nodesArray.push({
        id: router.id,
        label: router.name || "Router",
        title: `Router<br>ID: ${router.id}<br>Status: ${router.status}`,
        group: "router",
        shape: "image",
        // Using a built-in vis-network icon or text if image is missing. Let's use standard shapes.
        image: "assets/images/Device_router_3062_unknown_64.png", 
        fallbackShape: "box",
        color: { background: "#4A90E2", border: "#2C3E50" },
        font: { color: "white" }
      });
    });

    // 2. Add Networks (Logical Switches)
    networks?.forEach((net) => {
      nodesArray.push({
        id: net.id,
        label: net.name || "Network",
        title: `Network<br>CIDR: ${net.cidr}<br>Type: ${net.segmentation}`,
        group: "network",
        shape: "ellipse",
        color: { background: "#50E3C2", border: "#0B3954" },
        font: { color: "black" }
      });
    });

    // 3. Add Virtual Machines
    virtualMachines?.forEach((vm) => {
      nodesArray.push({
        id: vm.id,
        label: vm.name || "VM",
        title: `VM<br>IP: ${vm.ip}<br>Status: ${vm.status}`,
        group: "vm",
        shape: "box",
        color: { background: "#F5A623", border: "#8B572A" },
        font: { color: "white" }
      });

      // Connect VM to its network
      if (vm.logicalSwitch) {
        // logicalSwitch is formatted as "neutron-<id>"
        const netId = vm.logicalSwitch.replace("neutron-", "");
        edgesArray.push({
          from: vm.id,
          to: netId,
          color: { color: "#9B9B9B" },
          width: 2,
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
            color: { color: "#4A90E2" },
            width: 3,
            dashes: true, // Router interfaces are dashed
          });
        }
      }
    });

    const nodesDataSet = new DataSet(nodesArray);
    const edgesDataSet = new DataSet(edgesArray);

    const data = {
      nodes: nodesDataSet,
      edges: edgesDataSet,
    };

    const options = {
      autoResize: true,
      height: "100%",
      width: "100%",
      physics: {
        barnesHut: {
          gravitationalConstant: -4000,
          springConstant: 0.04,
          springLength: 150,
        },
      },
      edges: {
        smooth: {
          type: "continuous",
        },
      },
      nodes: {
        font: {
          size: 14,
        },
        borderWidth: 2,
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
      },
    };

    const network = new Network(containerRef.current, data, options);
    setNetworkInstance(network);

    const restoreDefaults = () => {
      const allNodes = nodesDataSet.get();
      const allEdges = edgesDataSet.get();
      nodesDataSet.update(allNodes.map(n => ({ id: n.id, borderWidth: 2 })));
      edgesDataSet.update(allEdges.map(e => {
         const baseColor = e.color ? (typeof e.color === 'object' ? e.color.color : e.color) : '#9B9B9B';
         return { id: e.id, color: { color: baseColor }, width: e.dashes ? 3 : 2 };
      }));
    };

    network.on("click", (params) => {
      try {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          // Use String() to ensure safety between UUIDs and numeric IDs
          const node = nodesArray.find((n) => String(n.id) === String(nodeId));
          
          let entity = null;
          if (node) {
            if (node.group === "vm") entity = virtualMachines?.find((v) => String(v.id) === String(nodeId));
            if (node.group === "network") entity = networks?.find((n) => String(n.id) === String(nodeId));
            if (node.group === "router") entity = routers?.find((r) => String(r.id) === String(nodeId));
            setSelectedNode({ ...node, entityDetails: entity });
          } else {
            setSelectedNode(null);
          }

          const allNodes = nodesDataSet.get();
          const allEdges = edgesDataSet.get();

          if (node && node.group === "vm") {
            const connectedEdges = network.getConnectedEdges(nodeId);
            const connectedNodes = network.getConnectedNodes(nodeId);
            
            let highlightNodes = [nodeId, ...connectedNodes];
            let highlightEdges = [...connectedEdges];

            connectedNodes.forEach(netId => {
              const netNode = nodesDataSet.get(netId);
              if (netNode && netNode.group === "network") {
                const netEdges = network.getConnectedEdges(netId);
                const netConnectedNodes = network.getConnectedNodes(netId);
                
                netConnectedNodes.forEach(rId => {
                  const rNode = nodesDataSet.get(rId);
                  if (rNode && rNode.group === "router") {
                    highlightNodes.push(rId);
                  }
                });
                
                netEdges.forEach(eId => {
                  const edge = edgesDataSet.get(eId);
                  if (edge && highlightNodes.includes(edge.from) && highlightNodes.includes(edge.to)) {
                    if (!highlightEdges.includes(eId)) highlightEdges.push(eId);
                  }
                });
              }
            });

            nodesDataSet.update(allNodes.map(n => {
              if (highlightNodes.includes(n.id)) {
                 return { id: n.id, borderWidth: 5 }; // Highlight with thick border
              } else {
                 return { id: n.id, borderWidth: 2 }; // Keep fully visible
              }
            }));

            edgesDataSet.update(allEdges.map(e => {
              const baseColor = e.color ? (typeof e.color === 'object' ? e.color.color : e.color) : '#9B9B9B';
              if (highlightEdges.includes(e.id)) {
                 return { id: e.id, color: { color: baseColor }, width: 5 }; // Highlight with thick line
              } else {
                 return { id: e.id, color: { color: baseColor }, width: e.dashes ? 3 : 2 }; // Keep fully visible
              }
            }));
          } else {
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

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden relative" style={{ minHeight: "600px" }}>
      {/* Fix for Vis-Network default tooltips which might be hidden or unstyled */}
      <style>{`
        .vis-tooltip {
          position: absolute;
          padding: 10px;
          background-color: rgba(30, 41, 59, 0.95) !important;
          color: #f8fafc !important;
          border: 1px solid #334155 !important;
          border-radius: 8px !important;
          font-family: inherit !important;
          font-size: 12px !important;
          pointer-events: none;
          z-index: 100 !important;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5) !important;
        }
      `}</style>

      {/* Header Bar */}
      <div className="flex justify-between items-center bg-slate-800 p-4 border-b border-slate-700 z-10 relative shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white">OpenStack OVN Topology</h2>
          <p className="text-sm text-slate-400">Real-time SDN Virtual Network Graph</p>
        </div>
        <button
          onClick={onClose}
          className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-4 py-2 rounded-xl transition"
        >
          Close Topology
        </button>
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 relative w-full h-full">
        {/* The vis-network container must perfectly hug the parent to align mouse coordinates */}
        <div ref={containerRef} className="absolute inset-0 bg-slate-950"></div>

        {/* Selected Node Details Panel (Right Side) */}
        {selectedNode && (
          <div className="absolute right-4 top-4 w-80 bg-slate-800/95 backdrop-blur border border-slate-700 rounded-2xl p-5 shadow-2xl z-20 max-h-[90%] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-white capitalize">{selectedNode.group} Details</h3>
              <button 
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-full w-6 h-6 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="border-b border-slate-700/50 pb-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Name / Label</p>
                <p className="text-sm text-slate-200 font-semibold">{selectedNode.label}</p>
              </div>
              <div className="border-b border-slate-700/50 pb-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">ID</p>
                <p className="text-[11px] text-slate-300 font-mono break-all bg-slate-950 p-2 rounded border border-slate-800">{selectedNode.id}</p>
              </div>
              {selectedNode.entityDetails && (
                <div className="border-b border-slate-700/50 pb-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Metadata Properties</p>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2 max-h-60 overflow-y-auto">
                    {Object.entries(selectedNode.entityDetails).map(([key, value]) => {
                      let displayVal = value;
                      if (typeof value === "object" && value !== null) {
                         displayVal = JSON.stringify(value);
                      }
                      return (
                        <div key={key} className="text-xs flex flex-col mb-1">
                          <span className="text-slate-500 font-semibold uppercase text-[9px] tracking-wider">{key.replace(/_/g, ' ')}</span>
                          <span className="text-slate-200 break-words mt-0.5">
                            {displayVal !== null && displayVal !== undefined && displayVal !== "" ? displayVal.toString() : "N/A"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Quick Status</p>
                <div className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800" dangerouslySetInnerHTML={{ __html: selectedNode.title }}></div>
              </div>
            </div>
          </div>
        )}
        
        {/* Legend Panel (Bottom Left) */}
        <div className="absolute left-4 bottom-4 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-2xl p-4 shadow-xl z-20 pointer-events-none">
          <h4 className="text-[10px] uppercase text-slate-400 font-bold mb-3 tracking-wider">Legend</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-[#4A90E2] border border-[#2C3E50] shadow-[0_0_8px_rgba(74,144,226,0.5)]"></div>
              <span className="text-xs font-medium text-slate-200">Router</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-[#50E3C2] border border-[#0B3954] shadow-[0_0_8px_rgba(80,227,194,0.5)]"></div>
              <span className="text-xs font-medium text-slate-200">Network / Logical Switch</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 bg-[#F5A623] border border-[#8B572A] shadow-[0_0_8px_rgba(245,166,35,0.5)]"></div>
              <span className="text-xs font-medium text-slate-200">Virtual Machine</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudTopology;
