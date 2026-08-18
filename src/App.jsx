import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
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
  // OpenFlow state
  const [openflowTopo, setOpenflowTopo]       = React.useState(null);
  const [openflowLoading, setOpenflowLoading] = React.useState(true);
  const [openflowError, setOpenflowError]     = React.useState(null);

  // DevStack state
  const [devstackTopo, setDevstackTopo]       = React.useState(null);
  const [devstackLoading, setDevstackLoading] = React.useState(true);
  const [devstackError, setDevstackError]     = React.useState(null);

  // Cloud data for cross-check (DevStack only)
  const [cloudData, setCloudData]             = React.useState(null);
  const [crossCheck, setCrossCheck]           = React.useState(true);

  const loadTopologies = React.useCallback(() => {
    setOpenflowLoading(true);
    setDevstackLoading(true);
    setOpenflowError(null);
    setDevstackError(null);

    import("./Pages/Topology/TopologyService").then(({ default: svc }) => {
      // Fetch OpenFlow topology
      svc.getNode("flow:1")
        .then((data) => { setOpenflowTopo(data); setOpenflowLoading(false); })
        .catch((err) => { setOpenflowError(err.message); setOpenflowLoading(false); });

      // Fetch DevStack topology + cloud summary
      Promise.all([
        svc.getNode("ovsdb:1"),
        fetch("/api/openstack/cloud-summary")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ])
        .then(([topoData, cloud]) => {
          setDevstackTopo(topoData);
          setCloudData(cloud);
          setDevstackLoading(false);
        })
        .catch((err) => {
          setDevstackError(err.message);
          setDevstackLoading(false);
        });
    });
  }, []);

  React.useEffect(() => {
    loadTopologies();
  }, [loadTopologies]);

  // Cross-check filter for DevStack topology
  const displayedDevstackTopo = React.useMemo(() => {
    if (!devstackTopo) return null;
    if (!crossCheck || !cloudData || !cloudData.virtualMachines) {
      return { ...devstackTopo, nodes: [...(devstackTopo.nodes || [])], links: [...(devstackTopo.links || [])] };
    }

    const myVmIds = new Set(cloudData.virtualMachines.map((vm) => vm.id));
    const foreignVmNodeIds = new Set();
    (devstackTopo.nodes || []).forEach((n) => {
      if (n.group === "vm" && n.nodeDetails?.vmUuid) {
        if (!myVmIds.has(n.nodeDetails.vmUuid)) {
          foreignVmNodeIds.add(n.id);
        }
      }
    });

    if (foreignVmNodeIds.size === 0) return devstackTopo;

    return {
      ...devstackTopo,
      nodes: (devstackTopo.nodes || []).filter((n) => !foreignVmNodeIds.has(n.id)),
      links: (devstackTopo.links || []).filter(
        (l) => !foreignVmNodeIds.has(l.from) && !foreignVmNodeIds.has(l.to)
      ),
    };
  }, [devstackTopo, cloudData, crossCheck]);

  const renderSection = (title, topo, loading, error, reloadFn, extraProps = {}) => {
    if (loading) return <Spinner />;
    if (error || !topo) return (
      <div className="flex flex-col items-center justify-center h-48 text-zinc-400 gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="text-sm">{title} unavailable — {error || "no data returned"}</div>
        <button 
          onClick={reloadFn}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
    return (
      <TopologySimple
        topologyData={topo}
        title={title}
        onReload={reloadFn}
        {...extraProps}
      />
    );
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {renderSection(
        "OpenFlow Topology",
        openflowTopo,
        openflowLoading,
        openflowError,
        () => {
          setOpenflowLoading(true);
          setOpenflowError(null);
          import("./Pages/Topology/TopologyService").then(({ default: svc }) => {
            svc.getNode("flow:1")
              .then((data) => { setOpenflowTopo(data); setOpenflowLoading(false); })
              .catch((err) => { setOpenflowError(err.message); setOpenflowLoading(false); });
          });
        }
      )}

      {renderSection(
        "DevStack OVSDB Topology",
        displayedDevstackTopo,
        devstackLoading,
        devstackError,
        () => {
          setDevstackLoading(true);
          setDevstackError(null);
          import("./Pages/Topology/TopologyService").then(({ default: svc }) => {
            Promise.all([
              svc.getNode("ovsdb:1"),
              fetch("/api/openstack/cloud-summary")
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null),
            ])
              .then(([topoData, cloud]) => {
                setDevstackTopo(topoData);
                setCloudData(cloud);
                setDevstackLoading(false);
              })
              .catch((err) => {
                setDevstackError(err.message);
                setDevstackLoading(false);
              });
          });
        },
        {
          crossCheckOpenstack: crossCheck,
          onToggleCrossCheck: (val) => setCrossCheck(val),
          openstackConnected: Boolean(cloudData?.virtualMachines),
        }
      )}
    </div>
  );
}

const App = () => (
  <AppErrorBoundary>
    <Router>
      <Layout>
        <Routes>
          <Route path="/"                    element={<Navigate to="/dashboard" replace />} />
          <Route path="/login"               element={<Login />} />
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
