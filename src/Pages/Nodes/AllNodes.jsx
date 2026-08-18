import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNodes } from "../../pipeline/DataPipelineContext";
import { Search, Server, Layers, ShieldCheck, RefreshCw, Cpu, Network as NetIcon } from "lucide-react";

const statusColor = {
  up:      "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  down:    "bg-red-500/10 text-red-400 border border-red-500/20",
  blocked: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  unknown: "bg-zinc-800/40 text-zinc-400 border border-zinc-700/50",
};

const OPENFLOW_TYPES = new Set(["OpenFlow Switch", "Host", "Switch"]);
const DEVSTACK_TYPES = new Set(["OVS Host", "Integration Bridge", "External Bridge", "Virtual Machine"]);

const isDevstackNode = (n) => {
  if (DEVSTACK_TYPES.has(n.type)) return true;
  if (n.id?.includes("ovsdb") || n.id?.startsWith("vm-")) return true;
  if (n.id?.startsWith("openflow:") && Number(n.id.replace("openflow:", "")) > 100000) return true;
  if (n.connectors?.some(c => c.name?.startsWith("tap") || c.name?.startsWith("patch") || c.name === "br-int" || c.name === "br-ex")) return true;
  return false;
};

const CATEGORIES = [
  {
    id: "openflow",
    label: "OpenFlow",
    icon: <Cpu className="w-4 h-4" />,
    matchFn: (n) => !isDevstackNode(n),
  },
  {
    id: "devstack",
    label: "DevStack",
    icon: <NetIcon className="w-4 h-4" />,
    matchFn: (n) => isDevstackNode(n),
  },
];

const NodeItem = ({ node, onClick }) => (
  <tr onClick={onClick} className="hover:bg-zinc-800/25 cursor-pointer border-t border-zinc-850 text-sm transition-colors duration-150">
    <td className="px-6 py-4">
      <div className="flex items-center gap-3">
        <Server className="w-4 h-4 text-zinc-400" />
        <span className="font-semibold text-zinc-200 break-all">{node.id}</span>
      </div>
    </td>
    <td className="px-6 py-4 text-zinc-300 font-mono text-xs">{node.type}</td>
    <td className="px-6 py-4">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wider ${statusColor[node.status] || statusColor.unknown}`}>
        {node.status?.toUpperCase() || "UNKNOWN"}
      </span>
    </td>
    <td className="px-6 py-4">
      <ul className="text-xs space-y-1.5">
        {(node.connectors || []).slice(0, 3).map((c, i) => (
          <li key={i} className="text-zinc-400 truncate max-w-xs">{c.name || c.id}</li>
        ))}
        {(node.connectors || []).length > 3 && (
          <li className="text-zinc-500 italic">+{node.connectors.length - 3} more interfaces</li>
        )}
      </ul>
    </td>
  </tr>
);

export default function AllNodes() {
  const { data: nodes = [], loading, error } = useNodes();
  const [search,  setSearch]  = useState("");
  const [showAll, setShowAll] = useState(false);
  const [category, setCategory] = useState("openflow");
  const VISIBLE = 10;
  const navigate = useNavigate();

  const activeCategory = CATEGORIES.find((c) => c.id === category);

  const filtered = Array.isArray(nodes)
    ? nodes
        .filter((n) => activeCategory?.matchFn(n))
        .filter((n) => n.id?.toLowerCase().includes(search.toLowerCase()))
    : [];
  const visible = showAll ? filtered : filtered.slice(0, VISIBLE);

  // Count nodes per category for badge
  const categoryCounts = {};
  CATEGORIES.forEach((cat) => {
    categoryCounts[cat.id] = Array.isArray(nodes) ? nodes.filter((n) => cat.matchFn(n)).length : 0;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Title block */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-50">Active Devices</h2>
        <p className="text-sm text-zinc-400">Monitor and inspect active hardware switches and network controller nodes.</p>
      </div>

      {error && (
        <div className="text-red-400 border border-red-900/30 bg-red-950/20 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 w-fit">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setCategory(cat.id); setShowAll(false); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
              category === cat.id
                ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent"
            }`}
          >
            {cat.icon}
            <span>{cat.label}</span>
            <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-md ${
              category === cat.id
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                : "bg-zinc-800 text-zinc-500"
            }`}>
              {categoryCounts[cat.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Control bar */}
      <div className="relative max-w-md w-full">
        <input
          className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 transition"
          type="text"
          placeholder="Search devices by ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
      </div>

      {/* Table block */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                <th className="px-6 py-3.5">Node ID</th>
                <th className="px-6 py-3.5">Type</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Active Connectors / Ports</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-16">
                    <RefreshCw className="animate-spin h-6 w-6 text-zinc-500 mx-auto mb-2" />
                    <span className="text-zinc-500 text-xs font-medium">Loading nodes...</span>
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-zinc-500 font-medium">
                    No {activeCategory?.label} devices found{search ? " matching query" : ""}
                  </td>
                </tr>
              ) : (
                visible.map((node, i) => (
                  <NodeItem key={i} node={node} onClick={() => navigate(`/node/${node.id}/detail`)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length > VISIBLE && (
        <div className="flex justify-center pt-2">
          <button 
            onClick={() => setShowAll(!showAll)}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 hover:text-zinc-100 font-semibold rounded-lg text-sm transition-all duration-200"
          >
            {showAll ? "Show Less" : `Show All Devices (${filtered.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
