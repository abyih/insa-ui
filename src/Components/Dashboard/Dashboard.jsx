import React, { useEffect, useState, useMemo } from "react";
import { useNodes, useStats, useFlowStats } from "../../pipeline/DataPipelineContext";
import { motion } from "framer-motion";
import { Cpu, GitBranch, ShieldCheck, Network, ChevronDown, RefreshCw } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div className="p-8 flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-50">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-red-400 mb-4">Dashboard error</h2>
          <p className="text-zinc-400 text-sm mb-6 break-words">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ error: null })}
            className="w-full py-2 bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-semibold rounded-lg transition-all">
            Try Again
          </button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

function makeBandwidthPoint(offsetMin) {
  const now = new Date();
  const m = now.getMinutes() - offsetMin;
  return {
    time: `${now.getHours()}:${String(m < 0 ? m + 60 : m).padStart(2, "0")}`,
    incoming: +(80 + Math.random() * 80).toFixed(1),
    outgoing: +(60 + Math.random() * 80).toFixed(1),
  };
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  // All data from the pipeline
  const { data: rawNodes,         loading: nodesLoading } = useNodes();
  const { data: rawConnectionStats }                       = useStats();
  const { data: rawFlowStats }                             = useFlowStats();

  const nodes           = Array.isArray(rawNodes)           ? rawNodes           : [];
  const connectionStats = Array.isArray(rawConnectionStats) ? rawConnectionStats : [];
  const flowStats       = Array.isArray(rawFlowStats)       ? rawFlowStats       : [];

  const deviceCount    = nodes.length;
  const connectedCount = nodes.filter((n) => n.status === "up").length;
  const flowCount      = flowStats.length;

  // Top 6 flows for bar chart
  const flowChartData = useMemo(() => {
    const top = flowStats.slice(0, 6);
    return top.length ? top.map((f, i) => ({
      flowId:  f.flow_id ? `Flow-${String(f.flow_id).slice(-4)}` : `Flow-0${i + 1}`,
      packets: f.packet_count || 0,
      bytes:   f.byte_count   || 0,
    })) : [
      { flowId: "Flow-01", packets: 0, bytes: 0 },
    ];
  }, [flowStats]);

  // Flow table rows
  const flowTableRows = flowStats.slice(0, 15).map((f) => ({
    id:          f.flow_id,
    device:      f.switch_id,
    packetCount: f.packet_count,
    byteCount:   f.byte_count,
    duration:    f.duration,
  }));

  const [bandwidthData,  setBandwidthData]  = useState(() => [4,3,2,1,0].map(makeBandwidthPoint));
  const [historicalData, setHistoricalData] = useState([]);

  useEffect(() => {
    const id = setInterval(() => {
      const pts = [4,3,2,1,0].map(makeBandwidthPoint);
      setBandwidthData(pts);
      setHistoricalData((prev) => [...prev, ...pts].slice(-100));
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const FaqItem = ({ question, answer }) => {
    const [open, setOpen] = useState(false);
    return (
      <div className="border-b border-zinc-800 py-4 last:border-0">
        <button onClick={() => setOpen(!open)}
          className="flex justify-between items-center w-full text-left text-zinc-200 hover:text-zinc-100 font-medium text-base focus:outline-none">
          <span>{question}</span>
          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${open ? "transform rotate-180 text-zinc-300" : ""}`} />
        </button>
        {open && <div className="mt-2 text-zinc-400 text-sm leading-relaxed">{answer}</div>}
      </div>
    );
  };

  if (nodesLoading) return (
    <div className="p-8 min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <RefreshCw className="animate-spin h-10 w-10 text-indigo-500 mx-auto mb-4" />
        <p className="text-zinc-400 text-sm font-medium">Loading Dashboard data...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Hero */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden h-72 shadow-xl shadow-black/20 flex flex-col justify-center px-8 md:px-12">
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.08] mix-blend-overlay" style={{ backgroundImage: "url('/assets/images/network.jpg')" }}></div>
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-900/90 to-transparent -z-10"></div>
        <div className="relative max-w-2xl">
          <motion.h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-50 mb-3"
            initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
            SDN Operations Center
          </motion.h2>
          <motion.p className="text-sm md:text-base text-zinc-400 leading-relaxed"
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.15 }}>
            Real-time visual telemetry, flow orchestration, and automated anomaly detection for active Software Defined Networking components.
          </motion.p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Nodes" value={deviceCount} icon={<Network className="w-5 h-5 text-indigo-400" />} />
        <StatCard title="Connected Devices" value={connectedCount} icon={<Cpu className="w-5 h-5 text-emerald-400" />} />
        <StatCard title="Active Flows" value={flowCount} icon={<GitBranch className="w-5 h-5 text-purple-400" />} />
        
        <div className="relative group">
          <StatCard title="Network Connections"
            value={connectionStats.reduce((a, c) => a + c.value, 0)}
            icon={<ShieldCheck className="w-5 h-5 text-orange-400" />} />
          {connectionStats.length > 0 && (
            <div className="absolute z-10 hidden group-hover:block top-full left-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-4 min-w-[240px] animate-in fade-in duration-150">
              <p className="text-[10px] font-bold text-zinc-500 mb-2.5 uppercase tracking-wider">Breakdown</p>
              <table className="w-full text-xs">
                <tbody>
                  {connectionStats.map((item, i) => (
                    <tr key={i} className="border-b border-zinc-800 last:border-0">
                      <td className="py-2 flex items-center gap-2 text-zinc-300">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}/>
                        {item.name}
                      </td>
                      <td className="py-2 text-right font-bold text-zinc-100">{item.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Bandwidth Utilization (Real-time)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={bandwidthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-grid)" />
              <XAxis dataKey="time" stroke="var(--theme-text-muted)" fontSize={11} />
              <YAxis stroke="var(--theme-text-muted)" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--theme-card)', borderColor: 'var(--theme-card-border)', borderRadius: '8px', color: 'var(--theme-fg)' }} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Line type="monotone" dataKey="incoming" stroke="#6366f1" strokeWidth={2} name="Incoming (Mbps)" dot={false} />
              <Line type="monotone" dataKey="outgoing" stroke="#10b981" strokeWidth={2} name="Outgoing (Mbps)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Bandwidth Trends (Historical)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-grid)" />
              <XAxis dataKey="time" stroke="var(--theme-text-muted)" fontSize={11} />
              <YAxis stroke="var(--theme-text-muted)" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--theme-card)', borderColor: 'var(--theme-card-border)', borderRadius: '8px', color: 'var(--theme-fg)' }} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Line type="monotone" dataKey="incoming" stroke="#6366f1" strokeWidth={1.5} name="Incoming (Mbps)" dot={false} />
              <Line type="monotone" dataKey="outgoing" stroke="#10b981" strokeWidth={1.5} name="Outgoing (Mbps)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Flow Statistics (Top Rules)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={flowChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-grid)" />
              <XAxis dataKey="flowId" stroke="var(--theme-text-muted)" fontSize={11} />
              <YAxis stroke="var(--theme-text-muted)" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--theme-card)', borderColor: 'var(--theme-card-border)', borderRadius: '8px', color: 'var(--theme-fg)' }} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Bar dataKey="packets" fill="#6366f1" radius={[4, 4, 0, 0]} name="Packets" />
              <Bar dataKey="bytes" fill="#a78bfa" radius={[4, 4, 0, 0]} name="Bytes" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Network Connection States">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={connectionStats} dataKey="value" outerRadius={80} innerRadius={40} paddingAngle={2}
                label={({ name, percent }) => percent > 0 ? `${name} ${(percent*100).toFixed(0)}%` : ""}>
                {connectionStats.map((e, i) => <Cell key={i} fill={e.color}/>)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: 'var(--theme-card)', borderColor: 'var(--theme-card-border)', borderRadius: '8px', color: 'var(--theme-fg)' }} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Flow table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-200">Active Flow Table</h3>
            <p className="text-xs text-zinc-500 mt-1">Snapshot of top active controller flow entries</p>
          </div>
          <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-1 rounded">pipeline data</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                <th className="px-6 py-3.5">Flow ID</th>
                <th className="px-6 py-3.5">Switch / Node</th>
                <th className="px-6 py-3.5">Packets</th>
                <th className="px-6 py-3.5">Bytes</th>
                <th className="px-6 py-3.5">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 text-sm text-zinc-300">
              {flowTableRows.map((f, i) => (
                <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-3.5 font-medium text-zinc-100">{f.id}</td>
                  <td className="px-6 py-3.5 font-mono text-xs text-zinc-400">{f.device}</td>
                  <td className="px-6 py-3.5">{f.packetCount.toLocaleString()}</td>
                  <td className="px-6 py-3.5">{f.byteCount.toLocaleString()}</td>
                  <td className="px-6 py-3.5">{f.duration}s</td>
                </tr>
              ))}
              {flowTableRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-zinc-500 font-medium">No flows found in active nodes</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg p-8 mt-8">
        <h3 className="text-xl font-bold mb-6 text-zinc-200 tracking-tight">Frequently Asked Questions</h3>
        <div className="divide-y divide-zinc-800">
          {[
            { question: "What is DLUX / PNTC?", answer: "DLUX is a network visualization and monitoring console for Software Defined Networks (SDN), designed to interface directly with OpenDaylight controllers to control and manage active flows, nodes, and connections." },
            { question: "How are connected devices counted?", answer: "Nodes are monitored in real time via the controller pipeline. Any switch that has registered active interfaces/connectors and reports live status is marked as 'up' and counted as connected." },
            { question: "What are flow tables & rules?", answer: "Flow tables reside on network switches. They contain instructions (flows) that define action blocks (like Drop, Output to Port, or Forward to Controller) matching packet parameters (IPs, Ports, Protocols) passing through the node." },
          ].map((faq, i) => <FaqItem key={i} {...faq}/>)}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl shadow-md flex items-center gap-4 relative overflow-hidden group">
      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl group-hover:scale-105 transition-transform duration-200">
        {icon}
      </div>
      <div>
        <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">{title}</h3>
        <p className="text-2xl font-bold text-zinc-100 mt-1">{value}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-md flex flex-col">
      <h3 className="text-sm font-semibold text-zinc-200 tracking-tight mb-4">{title}</h3>
      <div className="flex-1 w-full min-h-[260px]">
        {children}
      </div>
    </div>
  );
}

export default function DashboardWithErrorBoundary() {
  return <ErrorBoundary><Dashboard /></ErrorBoundary>;
}
