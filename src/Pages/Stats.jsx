import { useState } from "react";
import { useFlowStats } from "../pipeline/DataPipelineContext";

const VISIBLE = 10;

export default function Stats() {
  const { data: flowStats = [], loading: flowLoading, error: flowError } = useFlowStats();

  const [showAll, setShowAll] = useState(false);

  const safeFlows = Array.isArray(flowStats) ? flowStats : [];
  const visible   = showAll ? safeFlows : safeFlows.slice(0, VISIBLE);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-full">
      <h1 className="text-xl sm:text-2xl font-bold mb-6">Flow &amp; Port Statistics</h1>

      {/* ── Flow stats table ── */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-2">Flow Statistics</h2>
        {flowError && <div className="text-red-500 mb-2 text-sm">{flowError}</div>}
        <div className="overflow-x-auto rounded shadow border border-gray-200">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="p-2">Switch ID</th>
                <th className="p-2">Flow ID</th>
                <th className="p-2">Packet Count</th>
                <th className="p-2">Byte Count</th>
                <th className="p-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {flowLoading ? (
                <tr><td colSpan={5} className="p-4 text-center text-gray-500">Loading...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-gray-400">No flows found</td></tr>
              ) : visible.map((f, i) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-mono text-xs">{f.switch_id}</td>
                  <td className="p-2">{f.flow_id}</td>
                  <td className="p-2">{f.packet_count}</td>
                  <td className="p-2">{f.byte_count}</td>
                  <td className="p-2">{f.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {safeFlows.length > VISIBLE && (
          <div className="mt-2 text-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded"
            >
              {showAll ? "Show Less" : `Show All (${safeFlows.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
