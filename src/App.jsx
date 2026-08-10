import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./App.css";
import AllNodes from "./Pages/Nodes/AllNodes";
import NodeConnector from "./Pages/Nodes/NodeConnector";
import TopologySimple from "./Pages/Topology/TopologySimple";
import Spinner from "./Components/Spinner";
import Login from "./Components/Login/Login";
import Layout from "./Components/Layout/Layout";
import ApiTester from "./Pages/ApiTester/ApiTester";
import Yangman from "./Pages/Yangui/YangLast";
import Dashboard from "./Components/Dashboard/Dashboard";
import Flows from "./Pages/Flows";
import FlowManager from "./Pages/FlowManager";
import Stats from "./Pages/Stats";
import AnomalyDetector from "./Pages/AnomalyDetector/AnomalyDetector";
import Cloud from "./Pages/Cloud";

// ─── Top-level error boundary — shows the actual crash instead of white screen
class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, fontFamily: "monospace" }}>
        <h2 style={{ color: "red" }}>App crashed — check the error below:</h2>
        <pre style={{ background: "#fee", padding: 16, borderRadius: 8, whiteSpace: "pre-wrap" }}>
          {this.state.error.message}{"\n\n"}{this.state.error.stack}
        </pre>
        <button onClick={() => this.setState({ error: null })}
          style={{ marginTop: 16, padding: "8px 16px" }}>
          Retry
        </button>
      </div>
    );
    return this.props.children;
  }
}

function TopologyRoute() {
  const [rawTopo, setRawTopo]              = React.useState(null);
  const [cloudData, setCloudData]          = React.useState(null);
  const [loading, setLoading]              = React.useState(true);
  const [error, setError]                  = React.useState(null);
  const [filter, setFilter]                = React.useState("all");
  const [crossCheck, setCrossCheck]        = React.useState(true);

  const loadTopology = (targetFilter = filter) => {
    setLoading(true);
    setError(null);
    import("./Pages/Topology/TopologyService").then(({ default: svc }) => {
      // Fetch both topology data and OpenStack cloud-summary in parallel
      Promise.all([
        svc.getNode(targetFilter),
        fetch("/api/openstack/cloud-summary")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ])
        .then(([topoData, cloud]) => {
          setRawTopo(topoData);
          setCloudData(cloud);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    });
  };

  React.useEffect(() => {
    loadTopology(filter);
  }, [filter]);

  // Compute displayed topology based on cross-check toggle
  const displayedTopology = React.useMemo(() => {
    if (!rawTopo) return null;

    // If cross-checking is turned OFF or OpenStack data is unavailable, show raw OVSDB topology
    if (!crossCheck || !cloudData || !cloudData.virtualMachines) {
      return {
        ...rawTopo,
        nodes: [...(rawTopo.nodes || [])],
        links: [...(rawTopo.links || [])],
      };
    }

    const myVmIds = new Set(cloudData.virtualMachines.map((vm) => vm.id));
    const foreignVmNodeIds = new Set();
    (rawTopo.nodes || []).forEach((n) => {
      if (n.group === "vm" && n.nodeDetails?.vmUuid) {
        if (!myVmIds.has(n.nodeDetails.vmUuid)) {
          foreignVmNodeIds.add(n.id);
        }
      }
    });

    if (foreignVmNodeIds.size === 0) return rawTopo;

    return {
      ...rawTopo,
      nodes: (rawTopo.nodes || []).filter((n) => !foreignVmNodeIds.has(n.id)),
      links: (rawTopo.links || []).filter(
        (l) => !foreignVmNodeIds.has(l.from) && !foreignVmNodeIds.has(l.to)
      ),
    };
  }, [rawTopo, cloudData, crossCheck]);

  if (loading) return <Spinner />;
  if (error || !displayedTopology) return (
    <div className="flex flex-col items-center justify-center h-64 text-zinc-400 gap-3">
      <div>Topology unavailable — ODL controller not reachable or returned error: {error}</div>
      <button 
        onClick={() => loadTopology(filter)}
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs"
      >
        Retry Fetching Topology
      </button>
    </div>
  );

  return (
    <TopologySimple 
      topologyData={displayedTopology} 
      currentFilter={filter}
      onFilterChange={(newFilter) => setFilter(newFilter)}
      onReload={() => loadTopology(filter)}
      crossCheckOpenstack={crossCheck}
      onToggleCrossCheck={(val) => setCrossCheck(val)}
      openstackConnected={Boolean(cloudData?.virtualMachines)}
    />
  );
}

const App = () => (
  <AppErrorBoundary>
    <Router>
      <Layout>
        <Routes>
          <Route path="/"                    element={<Login />} />
          <Route path="/dashboard"           element={<Dashboard />} />
          <Route path="/nodes"               element={<AllNodes />} />
          <Route path="/node/:nodeId/detail" element={<NodeConnector />} />
          <Route path="/flows"               element={<Flows />} />
          <Route path="/flow-manager"       element={<FlowManager />} />
          <Route path="/stats"               element={<Stats />} />
          <Route path="/topology"            element={<TopologyRoute />} />
          <Route path="/cloud"               element={<Cloud />} />
          <Route path="/anomaly"             element={<AnomalyDetector />} />
          <Route path="/api-tester"          element={<ApiTester />} />
          <Route path="/yangui"              element={<Yangman />} />
          <Route path="*"                    element={<div className="p-8 text-gray-400">Page not found</div>} />
        </Routes>
      </Layout>
    </Router>
  </AppErrorBoundary>
);

export default App;
