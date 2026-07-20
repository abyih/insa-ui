import { useState } from "react";
import { useFlowStats } from "../pipeline/DataPipelineContext";
import { Activity, RefreshCw } from "lucide-react";

const VISIBLE = 10;

export default function Stats() {
  const { data: flowStats = [], loading: flowLoading, error: flowError } = useFlowStats();
  const [showAll, setShowAll] = useState(false);

  const safeFlows = Array.isArray(flowStats) ? flowStats : [];
  const visible   = showAll ? safeFlows : safeFlows.slice(0, VISIBLE);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* Title section */}
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-50 flex items-center gap-2">
          <Activity className="w-6 h-6 text-indigo-400" />
          Flow Telemetry & Port Statistics
        </h2>
        <p className="text-sm text-zinc-400">Granular packet flow counters and telemetry aggregated from active openflow switches.</p>
      </div>

      {/* Flow stats table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center">
          <h3 className="text-base font-bold text-zinc-200">Packet Counters</h3>
          <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 border border-zinc-700 px-2.5 py-1 rounded">
            {safeFlows.length} flows active
          </span>
        </div>

        {flowError && (
          <div className="p-4 bg-red-950/20 border-b border-zinc-800 text-sm text-red-400">
            ⚠️ {flowError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                <th className="px-6 py-3.5">Switch ID</th>
                <th className="px-6 py-3.5">Flow ID</th>
                <th className="px-6 py-3.5">Packet Count</th>
                <th className="px-6 py-3.5">Byte Count</th>
                <th className="px-6 py-3.5">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 text-sm text-zinc-300">
              {flowLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-16">
                    <RefreshCw className="animate-spin h-6 w-6 text-zinc-500 mx-auto mb-2" />
                    <span className="text-zinc-500 text-xs font-medium">Loading telemetry...</span>
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-zinc-500 font-medium">
                    No active flow counters resolved
                  </td>
                </tr>
              ) : (
                visible.map((f, i) => (
                  <tr key={i} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-xs text-zinc-400">{f.switch_id}</td>
                    <td className="px-6 py-3.5 font-semibold text-zinc-100">{f.flow_id}</td>
                    <td className="px-6 py-3.5 font-semibold text-indigo-400">{f.packet_count.toLocaleString()}</td>
                    <td className="px-6 py-3.5 font-mono text-zinc-300">{f.byte_count.toLocaleString()} B</td>
                    <td className="px-6 py-3.5 text-zinc-400">{f.duration}s</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {safeFlows.length > VISIBLE && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 hover:text-zinc-100 font-semibold rounded-lg text-sm transition-all duration-200"
          >
            {showAll ? "Show Less" : `Show All Flows (${safeFlows.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
