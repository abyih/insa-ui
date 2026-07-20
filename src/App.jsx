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

// ─── Topology route — lazy loads topology only when navigated to
function TopologyRoute() {
  const [topo, setTopo]       = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError]     = React.useState(null);

  React.useEffect(() => {
    import("./Pages/Topology/TopologyService").then(({ default: svc }) => {
      svc.getNode("flow:1")
        .then((data) => { setTopo(data); setLoading(false); })
        .catch((err) => { setError(err.message); setLoading(false); });
    });
  }, []);

  if (loading) return <Spinner />;
  if (error || !topo) return (
    <div className="flex items-center justify-center h-64 text-gray-500">
      Topology unavailable — ODL controller not reachable.
    </div>
  );
  return <TopologySimple topologyData={topo} onReload={() => {
    setTopo(null); setLoading(true); setError(null);
    import("./Pages/Topology/TopologyService").then(({ default: svc }) =>
      svc.getNode("flow:1")
        .then((d) => { setTopo(d); setLoading(false); })
        .catch((e) => { setError(e.message); setLoading(false); })
    );
  }} />;
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
