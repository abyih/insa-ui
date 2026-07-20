import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNodes } from "../../pipeline/DataPipelineContext";

const statusColor = {
  up:      "bg-green-500 text-white",
  down:    "bg-red-500 text-white",
  blocked: "bg-yellow-500 text-black",
  unknown: "bg-gray-300 text-black",
};

const NodeItem = ({ node, onClick }) => (
  <tr onClick={onClick} className="hover:bg-gray-100 cursor-pointer border-t text-sm">
    <td className="border p-2"><span className="font-semibold break-words">{node.id}</span></td>
    <td className="border p-2">{node.type}</td>
    <td className={`border p-2 text-xs rounded text-center ${statusColor[node.status] || statusColor.unknown}`}>
      {node.status?.toUpperCase() || "UNKNOWN"}
    </td>
    <td className="border p-2">
      <ul className="text-sm space-y-1">
        {(node.connectors || []).slice(0, 3).map((c, i) => (
          <li key={i} className="text-gray-600 truncate">{c.name || c.id}</li>
        ))}
        {(node.connectors || []).length > 3 && (
          <li className="text-gray-400 italic">+{node.connectors.length - 3} more</li>
        )}
      </ul>
    </td>
  </tr>
);

export default function AllNodes() {
  const { data: nodes = [], loading, error } = useNodes();
  const [search,  setSearch]  = useState("");
  const [showAll, setShowAll] = useState(false);
  const VISIBLE = 10;
  const navigate = useNavigate();

  // pipeline auto-polls — no manual fetch needed here
  const filtered = Array.isArray(nodes)
    ? nodes.filter((n) => n.id?.toLowerCase().includes(search.toLowerCase()))
    : [];
  const visible = showAll ? filtered : filtered.slice(0, VISIBLE);

  return (
    <div className="mt-5 pt-5 px-4">
      {error && (
        <div className="text-red-600 mb-4 p-2 border border-red-300 rounded bg-red-50">{error}</div>
      )}
      <input
        className="border p-2 mb-4 w-full max-w-md rounded"
        type="text"
        placeholder="Search by Node ID"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border min-w-[600px]">
          <thead className="bg-gray-200">
            <tr>
              <th className="border p-2 text-left">Node ID</th>
              <th className="border p-2 text-left">Type</th>
              <th className="border p-2 text-left">Status</th>
              <th className="border p-2 text-left">Ports</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center p-4 text-gray-500">Loading nodes...</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={4} className="text-center p-4 text-gray-400">No nodes found</td></tr>
            ) : visible.map((node, i) => (
              <NodeItem key={i} node={node} onClick={() => navigate(`/node/${node.id}/detail`)} />
            ))}
          </tbody>
        </table>
        {filtered.length > VISIBLE && (
          <div className="text-center mt-4">
            <button onClick={() => setShowAll(!showAll)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
              {showAll ? "Show Less" : `Show All (${filtered.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
