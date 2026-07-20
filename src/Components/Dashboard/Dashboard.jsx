import React, { useEffect, useState, useMemo } from "react";
import { useNodes, useStats, useFlowStats } from "../../pipeline/DataPipelineContext";
import { motion } from "framer-motion";
import { FaMicrochip, FaProjectDiagram, FaShieldAlt, FaNetworkWired } from "react-icons/fa";
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
      <div className="p-8 flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-600 mb-4">Dashboard error</h2>
          <p className="text-gray-600 mb-4">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ error: null })}
            className="bg-blue-500 text-white px-4 py-2 rounded">Try Again</button>
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
  // ── All data from the pipeline — no direct API calls ──────────────────────
  const { data: rawNodes,         loading: nodesLoading } = useNodes();
  const { data: rawConnectionStats }                       = useStats();
  const { data: rawFlowStats }                             = useFlowStats();

  const nodes           = Array.isArray(rawNodes)           ? rawNodes           : [];
  const connectionStats = Array.isArray(rawConnectionStats) ? rawConnectionStats : [];
  const flowStats       = Array.isArray(rawFlowStats)       ? rawFlowStats       : [];

  // ── Derived from pipeline data ─────────────────────────────────────────────
  const deviceCount    = nodes.length;
  const connectedCount = nodes.filter((n) => n.status === "up").length;
  const flowCount      = flowStats.length;

  // Top 6 flows for bar chart — derived from pipeline flowStats
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

  // Flow table rows — derived from pipeline flowStats
  const flowTableRows = flowStats.slice(0, 20).map((f) => ({
    id:          f.flow_id,
    device:      f.switch_id,
    packetCount: f.packet_count,
    byteCount:   f.byte_count,
    duration:    f.duration,
  }));

  // ── Bandwidth chart — simulated, updates on each render cycle ─────────────
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
      <div className="border-b border-gray-200 py-4">
        <button onClick={() => setOpen(!open)}
          className="flex justify-between w-full text-left text-gray-800 font-medium text-lg">
          {question}<span className="text-gray-500">{open ? "−" : "+"}</span>
        </button>
        {open && <div className="mt-2 text-gray-600">{answer}</div>}
      </div>
    );
  };

  if (nodesLoading) return (
    <div className="p-8 min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-gray-600">Loading dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="p-8 min-h-screen bg-gray-100">
      {/* Hero */}
      <div className="relative bg-white rounded-xl shadow mb-8 overflow-hidden h-80">
        <img src="/assets/images/network.jpg" alt="Network" className="w-full h-80 object-cover" />
        <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center text-white p-6 text-center">
          <motion.h1 className="text-4xl font-bold mb-2"
            initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8 }}>
            Welcome to the SDN Dashboard
          </motion.h1>
          <motion.p className="text-lg max-w-2xl"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 1, delay: 0.3 }}>
            Monitor your devices, flows, and network health all in one place.
          </motion.p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard title="Total Nodes"       value={deviceCount}    icon={<FaNetworkWired   className="text-blue-500   text-2xl mr-4"/>} border="border-blue-500"   />
        <StatCard title="Connected Devices" value={connectedCount} icon={<FaMicrochip      className="text-green-500  text-2xl mr-4"/>} border="border-green-500"  />
        <StatCard title="Active Flows"      value={flowCount}      icon={<FaProjectDiagram className="text-purple-500 text-2xl mr-4"/>} border="border-purple-500" />
        <div className="relative group">
          <StatCard title="Network Connections"
            value={connectionStats.reduce((a, c) => a + c.value, 0)}
            icon={<FaShieldAlt className="text-orange-500 text-2xl mr-4"/>}
            border="border-orange-500" />
          {connectionStats.length > 0 && (
            <div className="absolute z-10 hidden group-hover:block top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[220px]">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">Breakdown</p>
              <table className="w-full text-sm"><tbody>
                {connectionStats.map((item, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1 flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}/>
                      {item.name}
                    </td>
                    <td className="py-1 text-right font-bold">{item.value}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Bandwidth Utilization">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={bandwidthData}>
                <CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="time"/><YAxis/>
                <Tooltip/><Legend/>
                <Line type="monotone" dataKey="incoming" stroke="#8884d8" name="Incoming (Mbps)"/>
                <Line type="monotone" dataKey="outgoing" stroke="#82ca9d" name="Outgoing (Mbps)"/>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Bandwidth Trends (Historical)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="time"/><YAxis/>
                <Tooltip/><Legend/>
                <Line type="monotone" dataKey="incoming" stroke="#8884d8" name="Incoming (Mbps)"/>
                <Line type="monotone" dataKey="outgoing" stroke="#82ca9d" name="Outgoing (Mbps)"/>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Flow Statistics">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={flowChartData}>
                <CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="flowId"/><YAxis/>
                <Tooltip/><Legend/>
                <Bar dataKey="packets" fill="#8884d8" name="Packets"/>
                <Bar dataKey="bytes"   fill="#82ca9d" name="Bytes"/>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Network Connections">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={connectionStats} dataKey="value" outerRadius={90}
                  label={({ name, percent }) => percent > 0 ? `${name} ${(percent*100).toFixed(0)}%` : ""}>
                  {connectionStats.map((e, i) => <Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip/><Legend/>
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Flow table */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Flow Table</h3>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">pipeline data</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead><tr className="bg-gray-50">
                {["Flow ID","Switch","Packets","Bytes","Duration"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-sm font-medium text-gray-700">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {flowTableRows.map((f, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2 text-sm">{f.id}</td>
                    <td className="px-4 py-2 text-sm font-mono text-xs">{f.device}</td>
                    <td className="px-4 py-2 text-sm">{f.packetCount}</td>
                    <td className="px-4 py-2 text-sm">{f.byteCount}</td>
                    <td className="px-4 py-2 text-sm">{f.duration}</td>
                  </tr>
                ))}
                {flowTableRows.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-500">No flows found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-white rounded-xl shadow-sm p-8 mt-8">
        <h2 className="text-3xl font-bold mb-6 text-center">Frequently Asked Questions</h2>
        {[
          { question: "What is DLUX?",                     answer: "DLUX is a network automation and monitoring platform for managing Software Defined Networks (SDN)." },
          { question: "How are connected devices counted?", answer: "Devices are considered connected if they have at least one active connector with link-up status." },
          { question: "What are flows?",                   answer: "Flows define how packets are matched and forwarded through your network devices." },
        ].map((faq, i) => <FaqItem key={i} {...faq}/>)}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, border }) {
  return (
    <div className={`bg-white p-6 rounded-lg shadow-md border-l-4 ${border}`}>
      <div className="flex items-center">
        {icon}
        <div>
          <h3 className="text-gray-600 text-sm font-medium">{title}</h3>
          <p className="text-3xl font-bold text-gray-800">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function DashboardWithErrorBoundary() {
  return <ErrorBoundary><Dashboard /></ErrorBoundary>;
}
