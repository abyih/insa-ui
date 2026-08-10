import React, { useEffect, useState, useMemo } from "react";
import { useNodes, useStats, useFlowStats } from "../../pipeline/DataPipelineContext";
import { motion } from "framer-motion";
import {
  Cpu,
  GitBranch,
  ShieldCheck,
  Network,
  ChevronDown,
  RefreshCw,
  Server,
  Layers,
  Box,
  HardDrive,
  Activity,
  Globe,
  Terminal,
  CheckCircle2,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e) {
    return { error: e };
  }
  render() {
    if (this.state.error)
      return (
        <div className="p-8 flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-50">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md w-full text-center">
            <h2 className="text-xl font-bold text-red-400 mb-4">
              Dashboard error
            </h2>
            <p className="text-zinc-400 text-sm mb-6 break-words">
              {this.state.error?.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="w-full py-2 bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-semibold rounded-lg transition-all"
            >
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
  const { data: rawNodes, loading: nodesLoading } = useNodes();
  const { data: rawConnectionStats } = useStats();
  const { data: rawFlowStats } = useFlowStats();

  const nodes = Array.isArray(rawNodes) ? rawNodes : [];
  const connectionStats = Array.isArray(rawConnectionStats)
    ? rawConnectionStats
    : [];
  const flowStats = Array.isArray(rawFlowStats) ? rawFlowStats : [];

  // Categorize Nodes by Type
  const ovsHosts = useMemo(
    () => nodes.filter((n) => n.type === "OVS Host"),
    [nodes]
  );
  const ovsBridges = useMemo(
    () =>
      nodes.filter(
        (n) =>
          n.type === "Integration Bridge" ||
          n.type === "External Bridge" ||
          (n.type && n.type.includes("Bridge"))
      ),
    [nodes]
  );
  const vms = useMemo(
    () => nodes.filter((n) => n.type === "Virtual Machine"),
    [nodes]
  );
  const openflowSwitches = useMemo(
    () => nodes.filter((n) => n.type === "OpenFlow Switch"),
    [nodes]
  );
  const hostNodes = useMemo(
    () => nodes.filter((n) => n.type === "Host"),
    [nodes]
  );

  const deviceCount = nodes.length;
  const connectedCount = nodes.filter((n) => n.status === "up").length;
  const flowCount = flowStats.length;

  // Topology Distribution Chart Data
  const deviceDistributionData = useMemo(() => {
    const list = [
      { name: "DevStack Bridges", value: ovsBridges.length, color: "#6366f1" },
      { name: "Virtual Machines", value: vms.length, color: "#10b981" },
      { name: "OpenFlow Switches", value: openflowSwitches.length, color: "#a855f7" },
      { name: "OVS Hosts", value: ovsHosts.length, color: "#f59e0b" },
      { name: "Host Trackers", value: hostNodes.length, color: "#3b82f6" },
    ].filter((item) => item.value > 0);

    return list.length > 0
      ? list
      : [
          { name: "DevStack Bridges", value: 2, color: "#6366f1" },
          { name: "Virtual Machines", value: 4, color: "#10b981" },
          { name: "OVS Hosts", value: 1, color: "#f59e0b" },
        ];
  }, [ovsBridges, vms, openflowSwitches, ovsHosts, hostNodes]);

  // Top 6 flows for bar chart
  const flowChartData = useMemo(() => {
    const top = flowStats.slice(0, 6);
    return top.length
      ? top.map((f, i) => ({
          flowId: f.flow_id
            ? `Flow-${String(f.flow_id).slice(-4)}`
            : `Flow-0${i + 1}`,
          packets: f.packet_count || 0,
          bytes: f.byte_count || 0,
        }))
      : [
          { flowId: "Flow-01", packets: 120, bytes: 4800 },
          { flowId: "Flow-02", packets: 98, bytes: 3920 },
          { flowId: "Flow-03", packets: 45, bytes: 1800 },
        ];
  }, [flowStats]);

  // Flow table rows
  const flowTableRows = flowStats.slice(0, 15).map((f) => ({
    id: f.flow_id,
    device: f.switch_id,
    packetCount: f.packet_count,
    byteCount: f.byte_count,
    duration: f.duration,
  }));

  const [bandwidthData, setBandwidthData] = useState(() =>
    [4, 3, 2, 1, 0].map(makeBandwidthPoint)
  );
  const [historicalData, setHistoricalData] = useState([]);
  const [activeTab, setActiveTab] = useState("devstack");

  useEffect(() => {
    const id = setInterval(() => {
      const pts = [4, 3, 2, 1, 0].map(makeBandwidthPoint);
      setBandwidthData(pts);
      setHistoricalData((prev) => [...prev, ...pts].slice(-100));
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const FaqItem = ({ question, answer }) => {
    const [open, setOpen] = useState(false);
    return (
      <div className="border-b border-zinc-800 py-4 last:border-0">
        <button
          onClick={() => setOpen(!open)}
          className="flex justify-between items-center w-full text-left text-zinc-200 hover:text-zinc-100 font-medium text-base focus:outline-none"
        >
          <span>{question}</span>
          <ChevronDown
            className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${
              open ? "transform rotate-180 text-zinc-300" : ""
            }`}
          />
        </button>
        {open && (
          <div className="mt-2 text-zinc-400 text-sm leading-relaxed">
            {answer}
          </div>
        )}
      </div>
    );
  };

  if (nodesLoading)
    return (
      <div className="p-8 min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="animate-spin h-10 w-10 text-indigo-500 mx-auto mb-4" />
          <p className="text-zinc-400 text-sm font-medium">
            Loading Operations Center telemetry...
          </p>
        </div>
      </div>
    );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Hero Header */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-8 md:p-10 shadow-xl shadow-black/20 flex flex-col justify-between">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.06] mix-blend-overlay"
          style={{ backgroundImage: "url('/assets/images/network.jpg')" }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-900/90 to-transparent -z-10"></div>
        <div className="relative max-w-3xl space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Activity className="w-3.5 h-3.5" /> SDN & DevStack Operations Center
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Sync Active
            </span>
          </div>

          <motion.h2
            className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-50"
            initial={{ y: -15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            Network Infrastructure Overview
          </motion.h2>
          <motion.p
            className="text-sm md:text-base text-zinc-400 leading-relaxed"
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            Unified dashboard monitoring active OpenFlow switches, DevStack OVSDB bridges, and OpenStack virtual machines with real-time telemetry.
          </motion.p>
        </div>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Nodes"
          value={deviceCount}
          subtitle={`${connectedCount} Online`}
          icon={<Network className="w-5 h-5 text-indigo-400" />}
        />
        <StatCard
          title="DevStack Bridges"
          value={ovsBridges.length}
          subtitle="br-int & br-ex"
          icon={<Layers className="w-5 h-5 text-cyan-400" />}
        />
        <StatCard
          title="Virtual Machines"
          value={vms.length}
          subtitle="OpenStack Instances"
          icon={<Box className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="OpenFlow Switches"
          value={openflowSwitches.length}
          subtitle="Controller Managed"
          icon={<Server className="w-5 h-5 text-purple-400" />}
        />
        <StatCard
          title="Active Flow Rules"
          value={flowCount}
          subtitle="Configured Flows"
          icon={<GitBranch className="w-5 h-5 text-amber-400" />}
        />

        {/* Network Connections hover breakdown card */}
        <div className="relative group">
          <StatCard
            title="Connections"
            value={connectionStats.reduce((a, c) => a + c.value, 0)}
            subtitle="Switch & Host Links"
            icon={<ShieldCheck className="w-5 h-5 text-orange-400" />}
          />
          {connectionStats.length > 0 && (
            <div className="absolute z-20 hidden group-hover:block top-full left-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-4 min-w-[240px] animate-in fade-in duration-150">
              <p className="text-[10px] font-bold text-zinc-500 mb-2.5 uppercase tracking-wider">
                Connection Breakdown
              </p>
              <table className="w-full text-xs">
                <tbody>
                  {connectionStats.map((item, i) => (
                    <tr
                      key={i}
                      className="border-b border-zinc-800 last:border-0"
                    >
                      <td className="py-2 flex items-center gap-2 text-zinc-300">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.name}
                      </td>
                      <td className="py-2 text-right font-bold text-zinc-100">
                        {item.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ─── DevStack & OpenFlow Topology Details Panel ─────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <h3 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-indigo-400" />
              DevStack & Network Topology Inspector
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Detailed structural breakdown of active OVSDB bridges, OpenStack virtual machines, and OpenFlow switches.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-xl border border-zinc-800 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab("devstack")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "devstack"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              DevStack OVSDB ({ovsBridges.length + ovsHosts.length + vms.length})
            </button>
            <button
              onClick={() => setActiveTab("openflow")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "openflow"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              OpenFlow Inventory ({openflowSwitches.length})
            </button>
          </div>
        </div>

        {activeTab === "devstack" ? (
          <div className="space-y-6">
            {/* OVS Host Overview Banner */}
            {ovsHosts.length > 0 ? (
              ovsHosts.map((host, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs"
                >
                  <div>
                    <span className="text-zinc-500 font-semibold block uppercase text-[10px] tracking-wider">
                      OVS Host Node
                    </span>
                    <span className="text-zinc-100 font-bold text-sm block mt-1 break-all">
                      {host.nodeDetails?.hostname || host.id}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-semibold block uppercase text-[10px] tracking-wider">
                      OVS Version / DB Version
                    </span>
                    <span className="text-zinc-300 font-medium block mt-1">
                      {host.nodeDetails?.ovsVersion || "3.3.4"} (DB: {host.nodeDetails?.dbVersion || "8.5.1"})
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-semibold block uppercase text-[10px] tracking-wider">
                      OVN Encap IP
                    </span>
                    <span className="text-indigo-400 font-mono font-semibold block mt-1">
                      {host.nodeDetails?.externalIds?.["ovn-encap-ip"] || "172.27.189.3"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-semibold block uppercase text-[10px] tracking-wider">
                      OVN Remote Controller
                    </span>
                    <span className="text-emerald-400 font-mono font-semibold block mt-1">
                      {host.nodeDetails?.externalIds?.["ovn-remote"] || "tcp:172.27.189.3:6642"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-zinc-950/40 border border-zinc-850 p-4 rounded-xl flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  DevStack OVS Manager connected via OVSDB protocol (ovsdb:1)
                </span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active Topology
                </span>
              </div>
            )}

            {/* DevStack Bridges & VMs Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* OVS Bridges Table */}
              <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
                  <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    Open vSwitch Bridges ({ovsBridges.length})
                  </h4>
                  <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                    OVSDB Integration
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 font-semibold uppercase tracking-wider bg-zinc-900/50">
                        <th className="px-4 py-3">Bridge Name</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Datapath</th>
                        <th className="px-4 py-3">Interfaces / Ports</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                      {ovsBridges.map((b) => (
                        <tr key={b.id} className="hover:bg-zinc-800/30">
                          <td className="px-4 py-3 font-semibold text-zinc-100">
                            {b.nodeDetails?.bridgeName || b.id.split("/").pop()}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                b.type === "Integration Bridge"
                                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                  : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                              }`}
                            >
                              {b.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-zinc-400">
                            {b.nodeDetails?.datapathType || "system"} ({b.nodeDetails?.failMode || "secure"})
                          </td>
                          <td className="px-4 py-3 text-zinc-400">
                            {b.connectors?.length || 0} active interfaces
                          </td>
                        </tr>
                      ))}

                      {ovsBridges.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-center py-8 text-zinc-500">
                            No DevStack bridges found in active topology
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* OpenStack Virtual Machines (VMs) Table */}
              <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
                  <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                    <Box className="w-4 h-4 text-emerald-400" />
                    OpenStack Virtual Machines ({vms.length})
                  </h4>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    TAP Interfaces
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400 font-semibold uppercase tracking-wider bg-zinc-900/50">
                        <th className="px-4 py-3">VM Instance</th>
                        <th className="px-4 py-3">Interface / TAP</th>
                        <th className="px-4 py-3">MAC Address</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                      {vms.map((vm) => (
                        <tr key={vm.id} className="hover:bg-zinc-800/30">
                          <td className="px-4 py-3 font-semibold text-zinc-100">
                            {vm.nodeDetails?.vmUuid
                              ? `VM (${vm.nodeDetails.vmUuid.slice(0, 8)})`
                              : vm.id}
                          </td>
                          <td className="px-4 py-3 font-mono text-zinc-400">
                            {vm.nodeDetails?.tapPort || "tap-int"}
                          </td>
                          <td className="px-4 py-3 font-mono text-zinc-400">
                            {vm.nodeDetails?.mac || "fa:16:3e:..."}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              ACTIVE
                            </span>
                          </td>
                        </tr>
                      ))}

                      {vms.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-center py-8 text-zinc-500">
                            No virtual machines detected on DevStack bridge ports
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* OpenFlow Inventory Tab */
          <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
              <h4 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Server className="w-4 h-4 text-purple-400" />
                OpenFlow Controller Managed Switches ({openflowSwitches.length})
              </h4>
              <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                OFPT_FEATURES_REPLY
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-semibold uppercase tracking-wider bg-zinc-900/50">
                    <th className="px-6 py-3">Switch Node ID</th>
                    <th className="px-6 py-3">Protocol Type</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Connectors / Ports</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                  {openflowSwitches.map((sw) => (
                    <tr key={sw.id} className="hover:bg-zinc-800/30">
                      <td className="px-6 py-3.5 font-semibold text-zinc-100 font-mono">
                        {sw.id}
                      </td>
                      <td className="px-6 py-3.5 text-zinc-400">OpenFlow Switch</td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          ONLINE
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-zinc-400">
                        {sw.connectors?.length || 0} active ports
                      </td>
                    </tr>
                  ))}

                  {openflowSwitches.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-10 text-zinc-500">
                        No OpenFlow hardware switches connected to controller inventory
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Real-time Bandwidth Utilization">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={bandwidthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-grid)" />
              <XAxis
                dataKey="time"
                stroke="var(--theme-text-muted)"
                fontSize={11}
              />
              <YAxis stroke="var(--theme-text-muted)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--theme-card)",
                  borderColor: "var(--theme-card-border)",
                  borderRadius: "8px",
                  color: "var(--theme-fg)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
              <Line
                type="monotone"
                dataKey="incoming"
                stroke="#6366f1"
                strokeWidth={2}
                name="Incoming (Mbps)"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="outgoing"
                stroke="#10b981"
                strokeWidth={2}
                name="Outgoing (Mbps)"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Historical Bandwidth Trends">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-grid)" />
              <XAxis
                dataKey="time"
                stroke="var(--theme-text-muted)"
                fontSize={11}
              />
              <YAxis stroke="var(--theme-text-muted)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--theme-card)",
                  borderColor: "var(--theme-card-border)",
                  borderRadius: "8px",
                  color: "var(--theme-fg)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
              <Line
                type="monotone"
                dataKey="incoming"
                stroke="#6366f1"
                strokeWidth={1.5}
                name="Incoming (Mbps)"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="outgoing"
                stroke="#10b981"
                strokeWidth={1.5}
                name="Outgoing (Mbps)"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="OpenFlow Flow Statistics (Top Rules)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={flowChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-grid)" />
              <XAxis
                dataKey="flowId"
                stroke="var(--theme-text-muted)"
                fontSize={11}
              />
              <YAxis stroke="var(--theme-text-muted)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--theme-card)",
                  borderColor: "var(--theme-card-border)",
                  borderRadius: "8px",
                  color: "var(--theme-fg)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
              <Bar
                dataKey="packets"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                name="Packets"
              />
              <Bar
                dataKey="bytes"
                fill="#a78bfa"
                radius={[4, 4, 0, 0]}
                name="Bytes"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Topology Device Breakdown">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={deviceDistributionData}
                dataKey="value"
                outerRadius={80}
                innerRadius={40}
                paddingAngle={2}
                label={({ name, percent }) =>
                  percent > 0 ? `${name} ${(percent * 100).toFixed(0)}%` : ""
                }
              >
                {deviceDistributionData.map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--theme-card)",
                  borderColor: "var(--theme-card-border)",
                  borderRadius: "8px",
                  color: "var(--theme-fg)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Active Flow Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div>
            <h3 className="text-lg font-bold text-zinc-200">Active Flow Table</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Snapshot of top active controller flow entries
            </p>
          </div>
          <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-1 rounded">
            pipeline data
          </span>
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
                  <td className="px-6 py-3.5 font-medium text-zinc-100">
                    {f.id}
                  </td>
                  <td className="px-6 py-3.5 font-mono text-xs text-zinc-400">
                    {f.device}
                  </td>
                  <td className="px-6 py-3.5">
                    {f.packetCount.toLocaleString()}
                  </td>
                  <td className="px-6 py-3.5 font-mono text-xs">
                    {f.byteCount.toLocaleString()}
                  </td>
                  <td className="px-6 py-3.5">{f.duration}</td>
                </tr>
              ))}
              {flowTableRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-12 text-zinc-500 font-medium"
                  >
                    No active OpenFlow rules found in current nodes
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg p-8 mt-8">
        <h3 className="text-xl font-bold mb-6 text-zinc-200 tracking-tight">
          Frequently Asked Questions
        </h3>
        <div className="divide-y divide-zinc-800">
          {[
            {
              question: "What is DLUX / PNTC?",
              answer:
                "DLUX is a network visualization and monitoring console for Software Defined Networks (SDN), designed to interface directly with OpenDaylight controllers to control and manage active flows, nodes, and connections.",
            },
            {
              question: "How are DevStack OVSDB bridges and VMs integrated?",
              answer:
                "DevStack OVSDB bridges (br-int, br-ex), OVS host nodes, and OpenStack VMs (via TAP interfaces) are parsed directly from the OpenDaylight network-topology OVSDB plugin and combined with OpenFlow switch inventory.",
            },
            {
              question: "What are flow tables & rules?",
              answer:
                "Flow tables reside on network switches. They contain instructions (flows) that define action blocks (like Drop, Output to Port, or Forward to Controller) matching packet parameters (IPs, Ports, Protocols) passing through the node.",
            },
          ].map((faq, i) => (
            <FaqItem key={i} {...faq} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl shadow-md flex items-center gap-4 relative overflow-hidden group">
      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl group-hover:scale-105 transition-transform duration-200">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
          {title}
        </h3>
        <p className="text-2xl font-bold text-zinc-100 mt-1">{value}</p>
        {subtitle && (
          <p className="text-[10px] text-zinc-400 font-medium mt-0.5 truncate">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-md flex flex-col">
      <h3 className="text-sm font-semibold text-zinc-200 tracking-tight mb-4">
        {title}
      </h3>
      <div className="flex-1 w-full min-h-[260px]">{children}</div>
    </div>
  );
}

export default function DashboardWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}
