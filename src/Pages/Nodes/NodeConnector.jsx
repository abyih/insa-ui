import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { mapNodeDetails } from "../../mappers/node-details-mapper";
import { formatDate, formatSpeed } from "../../utils/helper";
import FlowForm from "../../Components/Nodes/FlowForm";
import { useNodeDetail } from "../../pipeline/DataPipelineContext";
import {
  Server,
  Globe,
  Network,
  ListCollapse,
  Activity,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Search,
  ChevronDown,
  Layers,
} from "lucide-react";

const POLL_INTERVAL = 5_000;

const NodeConnector = () => {
  const { nodeId } = useParams();
  const { data: raw, loading, error, fetch: fetchDetail } = useNodeDetail(nodeId);

  useEffect(() => {
    let cancelled = false;
    const tick = () => { if (!cancelled) fetchDetail(true); };
    tick();
    const id = setInterval(tick, POLL_INTERVAL);
    return () => { cancelled = true; clearInterval(id); };
  }, [nodeId, fetchDetail]);

  const node = raw ? mapNodeDetails(raw) : null;

  if (loading && !raw) return (
    <div className="p-8 min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <RefreshCw className="animate-spin h-8 w-8 text-zinc-500 mx-auto mb-3" />
        <p className="text-zinc-400 text-sm">Retrieving Node telemetry details...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="p-8 text-center max-w-md mx-auto">
      <div className="text-red-400 border border-red-900/30 bg-red-950/20 px-4 py-3 rounded-xl text-sm mb-4">
        Failed to fetch node details: {error}
      </div>
    </div>
  );

  return <NodeDetails node={node} />;
};

export default NodeConnector;

const NodeDetails = ({ node }) => {
  const [expandedFlows, setExpandedFlows] = useState({});
  const [activeSort, setActiveSort] = useState({ column: "priority", asc: true });
  const [formOpen, setFormOpen] = useState(false);
  const [inactiveSort, setInactiveSort] = useState({ column: "id", asc: true });
  const [inactiveRowsToShow, setInactiveRowsToShow] = useState(5);

  if (!node) return (
    <div className="text-center py-16 text-zinc-400 font-medium">
      No node data available.
    </div>
  );

  const handleFormSubmit = async (data) => {
    const flowBody = {
      "flow-node-inventory:flow": [
        {
          id: data.flowId,
          "flow-name": data.flowName,
          table_id: data.tableId,
          priority: data.priority,
          match: {
            "ipv4-source": data.ipv4Source,
            "ipv4-destination": data.ipv4Destination,
            "in-port": data.inPort,
            "ethernet-match": {
              "ethernet-type": {
                type: data.ethType,
              },
            },
          },
          instructions: {
            instruction: [
              {
                order: 0,
                "apply-actions": {
                  action: [
                    {
                      order: 0,
                      "output-action": {
                        "output-node-connector": `${data.outPort}`,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    const endpoint = `/api/rests/data/opendaylight-inventory:nodes/node=${data.nodeId}/flow-node-inventory:table=${data.tableId}/flow=${data.flowId}`;

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic " + btoa("admin:admin"),
        },
        body: JSON.stringify(flowBody),
      });

      if (response.ok) {
        alert("Flow created successfully");
      } else {
        const errorText = await response.text();
        console.error(errorText);
        alert("Failed to create flow");
      }
    } catch (err) {
      console.error(err);
      alert("Error sending request");
    }
  };

  const activeTables = node.flowTables.filter((t) => t.stats.activeFlows > 0);
  const inactiveTables = node.flowTables.filter((t) => t.stats.activeFlows === 0);

  const toggleFlow = (flowId) => {
    setExpandedFlows((prev) => ({ ...prev, [flowId]: !prev[flowId] }));
  };

  const sortFlows = (flows) => {
    const { column, asc } = activeSort;
    return [...flows].sort((a, b) => {
      if (column === "priority") return asc ? a.priority - b.priority : b.priority - a.priority;
      if (column === "id") return asc ? String(a.id).localeCompare(String(b.id)) : String(b.id).localeCompare(String(a.id));
      if (column === "packets") return asc ? a.stats.packets - b.stats.packets : b.stats.packets - a.stats.packets;
      if (column === "duration") return asc ? a.stats.duration - b.stats.duration : b.stats.duration - a.stats.duration;
      return 0;
    });
  };

  const sortInactiveTables = (tables) => {
    const { column, asc } = inactiveSort;
    return [...tables].sort((a, b) => {
      if (column === "id") return asc ? a.id - b.id : b.id - a.id;
      if (column === "activeFlows") return asc ? a.stats.activeFlows - b.stats.activeFlows : b.stats.activeFlows - a.stats.activeFlows;
      if (column === "packetsMatched") return asc ? a.stats.packetsMatched - b.stats.packetsMatched : b.stats.packetsMatched - a.stats.packetsMatched;
      if (column === "packetsLookedUp") return asc ? a.stats.packetsLookedUp - b.stats.packetsLookedUp : b.stats.packetsLookedUp - a.stats.packetsLookedUp;
      return 0;
    });
  };

  const sortIndicator = (current, column, asc) => {
    return current === column ? (asc ? " ▲" : " ▼") : "";
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {formOpen && (
        <FlowForm
          onSubmit={handleFormSubmit}
          onClose={() => setFormOpen(false)}
          initialData={{
            nodeId: node.id,
            tableId: 0,
          }}
          connectors={node.connectors}
        />
      )}

      {/* Node Header Overview */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-50">Device Telemetry: {node.id}</h2>
        <p className="text-sm text-zinc-400">Detailed connector ports, hardware capabilities, and flow tables for this OpenFlow device.</p>
      </div>

      {/* Node Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <NodeMetricCard title="Node ID" value={node.id} icon={<Server className="w-5 h-5 text-indigo-400" />} />
        <NodeMetricCard title="IP Address" value={node.metadata.ip || "—"} icon={<Globe className="w-5 h-5 text-cyan-400" />} />
        <NodeMetricCard title="Connectors / Interfaces" value={node.connectors.length} icon={<Network className="w-5 h-5 text-emerald-400" />} />
        <NodeMetricCard title="Flow Tables" value={node.flowTables.length} icon={<ListCollapse className="w-5 h-5 text-purple-400" />} />
      </div>

      {/* Metadata Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-zinc-200 mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-zinc-400" />
          Node Metadata & Hardware Properties
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(node.metadata).map(([key, value]) => (
            <div key={key} className="bg-zinc-950/40 border border-zinc-850 p-4 rounded-xl">
              <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider capitalize">{key.replace(/-/g, " ")}</span>
              <span className="block text-sm text-zinc-300 font-semibold mt-1 break-all">{value || "—"}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-800 pt-6 mt-6 grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
          <div>
            <h4 className="text-sm font-bold text-zinc-300 mb-3 uppercase tracking-wider text-xs">Group Capabilities</h4>
            <div className="flex flex-wrap gap-2">
              {node.groupFeatures.capabilities.map((cap, i) => (
                <span key={i} className="bg-zinc-950 border border-zinc-850 text-zinc-400 text-xs px-3 py-1.5 rounded-lg font-medium">
                  {cap.replace("opendaylight-group-types:", "")}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-zinc-300 mb-3 uppercase tracking-wider text-xs">Snapshot Status</h4>
            <div className="bg-zinc-950/40 border border-zinc-850 rounded-xl p-4 space-y-2 text-zinc-400">
              <div className="flex justify-between">
                <span>Start Time:</span>
                <span className="font-semibold text-zinc-300">{formatDate(node.snapshot.start)}</span>
              </div>
              <div className="flex justify-between">
                <span>End Time:</span>
                <span className="font-semibold text-zinc-300">{formatDate(node.snapshot.end)}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span>Sync status:</span>
                {node.snapshot.succeeded ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Successful
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
                    <XCircle className="w-3.5 h-3.5" /> Failed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connectors Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-zinc-200">Device Connectors</h3>
            <p className="text-xs text-zinc-500 mt-1">Available active and physical port mappings on this switch</p>
          </div>
          <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-1 rounded">
            {node.connectors.length} ports
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                <th className="px-6 py-3.5">Name / Port</th>
                <th className="px-6 py-3.5">Hardware MAC</th>
                <th className="px-6 py-3.5">Current Speed</th>
                <th className="px-6 py-3.5">Packets (Rx / Tx)</th>
                <th className="px-6 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 text-sm text-zinc-300">
              {node.connectors.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-800/20 transition-colors">
                  <td className="px-6 py-4 font-semibold text-zinc-100">{c.name}</td>
                  <td className="px-6 py-4 font-mono text-xs text-zinc-400">{c.mac}</td>
                  <td className="px-6 py-4 font-semibold text-zinc-200">{formatSpeed(c.currentSpeedMbps)}</td>
                  <td className="px-6 py-4">
                    <span className="text-emerald-400 font-medium">{c.packetStats.rx.toLocaleString()}↓</span>
                    <span className="text-zinc-650 mx-1.5">/</span>
                    <span className="text-rose-400 font-medium">{c.packetStats.tx.toLocaleString()}↑</span>
                  </td>
                  <td className="px-6 py-4">
                    {c.state.live ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        LIVE
                      </span>
                    ) : c.state.linkDown ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full">
                        DOWN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 bg-zinc-800/60 border border-zinc-700/60 px-2.5 py-0.5 rounded-full">
                        UNKNOWN
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Flow Tables */}
      <div className="space-y-6">
        {activeTables.map((table) => (
          <div key={table.id} className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-200 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  Active Flow Table: ID {table.id}
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Active rules: <span className="font-semibold text-zinc-200">{table.stats.activeFlows}</span> •
                  Matched packets: <span className="font-semibold text-zinc-200">{table.stats.packetsMatched.toLocaleString()}</span> •
                  Lookups: <span className="font-semibold text-zinc-200">{table.stats.packetsLookedUp.toLocaleString()}</span>
                </p>
              </div>

              <button
                onClick={() => setFormOpen(true)}
                className="shadcn-btn shadcn-btn-primary flex items-center gap-1.5 text-xs shrink-0 font-semibold"
              >
                <Plus className="w-4 h-4" /> Add Flow Rule
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                    <th
                      className="px-6 py-3 cursor-pointer select-none hover:text-zinc-200"
                      onClick={() => setActiveSort((s) => ({ column: "id", asc: s.column === "id" ? !s.asc : true }))}
                    >
                      Flow ID {sortIndicator(activeSort.column, "id", activeSort.asc)}
                    </th>
                    <th
                      className="px-6 py-3 cursor-pointer select-none hover:text-zinc-200"
                      onClick={() => setActiveSort((s) => ({ column: "priority", asc: s.column === "priority" ? !s.asc : true }))}
                    >
                      Priority {sortIndicator(activeSort.column, "priority", activeSort.asc)}
                    </th>
                    <th
                      className="px-6 py-3 cursor-pointer select-none hover:text-zinc-200"
                      onClick={() => setActiveSort((s) => ({ column: "packets", asc: s.column === "packets" ? !s.asc : true }))}
                    >
                      Packets {sortIndicator(activeSort.column, "packets", activeSort.asc)}
                    </th>
                    <th
                      className="px-6 py-3 cursor-pointer select-none hover:text-zinc-200"
                      onClick={() => setActiveSort((s) => ({ column: "duration", asc: s.column === "duration" ? !s.asc : true }))}
                    >
                      Duration {sortIndicator(activeSort.column, "duration", activeSort.asc)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 text-sm text-zinc-300">
                  {sortFlows(table.flows).map((flow) => (
                    <React.Fragment key={flow.id}>
                      <tr
                        className="cursor-pointer hover:bg-zinc-800/30 transition-colors"
                        onClick={() => toggleFlow(flow.id)}
                      >
                        <td className="px-6 py-4 font-semibold text-zinc-100 flex items-center gap-2">
                          <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${expandedFlows[flow.id] ? "transform rotate-180 text-zinc-300" : ""}`} />
                          {flow.id}
                        </td>
                        <td className="px-6 py-4">
                          <span className="bg-zinc-950 border border-zinc-850 px-2 py-0.5 rounded text-xs text-zinc-400">
                            {flow.priority}
                          </span>
                        </td>
                        <td className="px-6 py-4">{flow.stats.packets.toLocaleString()}</td>
                        <td className="px-6 py-4">{flow.stats.duration}s</td>
                      </tr>
                      {expandedFlows[flow.id] && (
                        <tr>
                          <td colSpan="4" className="bg-zinc-950 p-6 border-t border-zinc-800">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Rule Configuration Payload</h4>
                            <pre className="text-xs font-mono text-emerald-400 overflow-x-auto bg-zinc-900 border border-zinc-850 rounded-xl p-4">
                              {JSON.stringify(flow, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Unused Flow Tables */}
        {inactiveTables.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-zinc-200 mb-4">Unused Flow Tables</h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                    <th
                      className="px-6 py-3 cursor-pointer select-none hover:text-zinc-200"
                      onClick={() => setInactiveSort((s) => ({ column: "id", asc: s.column === "id" ? !s.asc : true }))}
                    >
                      Table ID {sortIndicator(inactiveSort.column, "id", inactiveSort.asc)}
                    </th>
                    <th
                      className="px-6 py-3 cursor-pointer select-none hover:text-zinc-200"
                      onClick={() => setInactiveSort((s) => ({ column: "activeFlows", asc: s.column === "activeFlows" ? !s.asc : true }))}
                    >
                      Active Flows {sortIndicator(inactiveSort.column, "activeFlows", inactiveSort.asc)}
                    </th>
                    <th
                      className="px-6 py-3 cursor-pointer select-none hover:text-zinc-200"
                      onClick={() => setInactiveSort((s) => ({ column: "packetsMatched", asc: s.column === "packetsMatched" ? !s.asc : true }))}
                    >
                      Packets Matched {sortIndicator(inactiveSort.column, "packetsMatched", inactiveSort.asc)}
                    </th>
                    <th
                      className="px-6 py-3 cursor-pointer select-none hover:text-zinc-200"
                      onClick={() => setInactiveSort((s) => ({ column: "packetsLookedUp", asc: s.column === "packetsLookedUp" ? !s.asc : true }))}
                    >
                      Packets Looked Up {sortIndicator(inactiveSort.column, "packetsLookedUp", inactiveSort.asc)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 text-sm text-zinc-300">
                  {sortInactiveTables(inactiveTables)
                    .slice(0, inactiveRowsToShow)
                    .map((table) => (
                      <tr key={table.id}>
                        <td className="px-6 py-3 font-semibold text-zinc-200">Table {table.id}</td>
                        <td className="px-6 py-3 text-zinc-500">0</td>
                        <td className="px-6 py-3 text-zinc-500">{table.stats.packetsMatched}</td>
                        <td className="px-6 py-3 text-zinc-500">{table.stats.packetsLookedUp}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {inactiveRowsToShow < inactiveTables.length && (
              <div className="flex justify-center mt-4 gap-3">
                {inactiveRowsToShow > 5 && (
                  <button
                    className="px-4 py-2 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg text-xs font-semibold transition"
                    onClick={() => setInactiveRowsToShow(inactiveRowsToShow - 10)}
                  >
                    Show Less
                  </button>
                )}
                <button
                  className="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-semibold rounded-lg text-xs transition"
                  onClick={() => setInactiveRowsToShow(inactiveRowsToShow + 10)}
                >
                  Show More Tables ({inactiveTables.length - inactiveRowsToShow} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function NodeMetricCard({ title, value, icon }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl shadow-md flex items-center gap-4 relative overflow-hidden group">
      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl group-hover:scale-105 transition-transform duration-200">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">{title}</h3>
        <p className="text-lg font-bold text-zinc-100 mt-1 break-all truncate">{value}</p>
      </div>
    </div>
  );
}
