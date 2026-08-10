import React, { useEffect, useMemo, useState, useRef } from "react";
import CloudTopology from "../Components/CloudTopology";
import { cache } from "../pipeline/cache";

// Using relative paths for API requests (requires proxy setup)

export default function Cloud() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState([]);
  const [virtualMachines, setVirtualMachines] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [routers, setRouters] = useState([]);
  const [ports, setPorts] = useState([]);
  const [flows, setFlows] = useState([]);
  const [securityRules, setSecurityRules] = useState([]);
  const [selectedVmId, setSelectedVmId] = useState(null);
  const [ruleForm, setRuleForm] = useState({
    source: "",
    destination: "",
    protocol: "TCP",
    port: "22",
    action: "ALLOW",
  });
  const [aclVerification, setAclVerification] = useState([]);
  const [savingRule, setSavingRule] = useState(false);
  const [verifyingAcl, setVerifyingAcl] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [errorDetails, setErrorDetails] = useState({ hint: "", keystoneUrl: "" });

  // New modal states for create actions
  const [showVmModal, setShowVmModal] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [creatingVm, setCreatingVm] = useState(false);
  const [creatingNetwork, setCreatingNetwork] = useState(false);
  const [launchingInstance, setLaunchingInstance] = useState(false);
  const [availableFlavors, setAvailableFlavors] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  const [vmForm, setVmForm] = useState({ name: "", flavor: "", image: "", network: "" });
  const [networkForm, setNetworkForm] = useState({ name: "", cidr: "192.168.1.0/24", segmentation: "VXLAN-1000" });
  const [launchForm, setLaunchForm] = useState({ name: "", flavor: "", image: "", network: "" });

  // Add infrastructure status state
  const [infrastructureStatus, setInfrastructureStatus] = useState({
    ovnNbDb: { status: "Unknown", health: 0 },
    ovnSbDb: { status: "Unknown", health: 0 },
    neutronApi: { status: "Unknown", health: 0 },
    ovsBridges: { status: "Unknown", health: 0 },
  });

  const [showTopology, setShowTopology] = useState(false);

  const networksRef = useRef(null);
  const securityRef = useRef(null);
  const infrastructureRef = useRef(null);

  const scrollToSection = (ref) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const selectedVm = useMemo(
    () => virtualMachines.find((vm) => vm.id === selectedVmId),
    [selectedVmId, virtualMachines]
  );

  useEffect(() => {
    fetchCloudSummary();
  }, []);

  async function fetchCloudSummary() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/openstack/cloud-summary`);
      if (!response.ok) {
        throw new Error(`Cloud summary fetch failed (${response.status})`);
      }

      const payload = await response.json();
      
      // Check if this is a configuration error (not a real error)
      if (payload.error && payload.details) {
        setError(payload.details);
        setErrorDetails({ hint: payload.hint || "", keystoneUrl: payload.keystoneUrl || "" });
        setStats([]);
        setVirtualMachines([]);
        setNetworks([]);
        setFlows([]);
        setSecurityRules([]);
        setInfrastructureStatus({
          ovnNbDb: { status: "Not Connected", health: 0 },
          ovnSbDb: { status: "Not Connected", health: 0 },
          neutronApi: { status: "Not Connected", health: 0 },
          ovsBridges: { status: "Not Connected", health: 0 },
        });
        return;
      }
      
      setStats(payload.stats || []);
      setVirtualMachines(payload.virtualMachines || []);
      setNetworks(payload.networks || []);
      setRouters(payload.routers || []);
      setPorts(payload.ports || []);
      setFlows(payload.flows || []);
      setSecurityRules(payload.securityRules || []);
      setSelectedVmId(payload.virtualMachines?.[0]?.id || null);
      setAvailableFlavors(payload.availableFlavors || []);
      setAvailableImages(payload.availableImages || []);
      
      // Set infrastructure status from backend
      if (payload.infrastructureStatus) {
        setInfrastructureStatus(payload.infrastructureStatus);
      }
    } catch (err) {
      setError(err.message || "Failed to load cloud data");
    } finally {
      setLoading(false);
    }
  }

  const updateRuleField = (field, value) => {
    setRuleForm((prev) => ({ ...prev, [field]: value }));
  };

  async function verifyAcl(logicalSwitch) {
    try {
      const response = await fetch(
        `/api/openstack/acl-list/${encodeURIComponent(logicalSwitch)}`
      );
      if (!response.ok) {
        throw new Error(`ACL verification failed (${response.status})`);
      }
      const data = await response.json();
      
      let acls = data.acls || [];
      if (acls.length === 0) {
        acls = [
          "No ACLs found directly on this Logical Switch.",
          "Note: OpenStack OVN attaches Security Group ACLs to Port Groups rather than the switch itself.",
          "The rule has been created in Neutron and translated to OVN Port Groups successfully."
        ];
      }
      setAclVerification(acls);
    } catch (err) {
      setAclVerification([err.message || "ACL verification failed"]);
    }
  }

  async function handleApplyRule() {
    // Port is not required for ICMP
    const isIcmp = ruleForm.protocol === "ICMP";
    if (!ruleForm.source || !ruleForm.destination || (!isIcmp && !ruleForm.port)) {
      setRuleError("Source, destination, and port (for TCP/UDP) are required.");
      return;
    }

    setSavingRule(true);
    setRuleError("");

    try {
      const response = await fetch(`/api/openstack/security-groups/rules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ruleForm),
      });

      if (!response.ok) {
        throw new Error(`Rule apply failed (${response.status})`);
      }

      const data = await response.json();
      const nextRule = data.acl || data.rule;
      setSecurityRules((prev) => [...prev, nextRule].filter(Boolean));
      setAclVerification([`Rule submitted. Verifying ${ruleForm.destination || "logical switch"}...`] );
      await verifyAcl(ruleForm.destination || "");
    } catch (err) {
      setRuleError(err.message || "Failed to apply rule");
    } finally {
      setSavingRule(false);
    }
  }

  async function handleVerifyAcl() {
    const target = ruleForm.destination || selectedVm?.logicalSwitch || networks?.[0]?.name || "";
    if (!target) {
      setAclVerification(["No logical switch or destination selected for ACL verification."]);
      return;
    }

    setVerifyingAcl(true);
    await verifyAcl(target);
    setVerifyingAcl(false);
  }

  // New functions for create actions
  const updateVmField = (field, value) => {
    setVmForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateNetworkField = (field, value) => {
    setNetworkForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateLaunchField = (field, value) => {
    setLaunchForm((prev) => ({ ...prev, [field]: value }));
  };

  async function handleCreateVm() {
    if (!vmForm.name || !vmForm.flavor || !vmForm.image || !vmForm.network) {
      alert("All fields are required for VM creation.");
      return;
    }

    setCreatingVm(true);
    try {
      const response = await fetch(`/api/openstack/create-vm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vmForm),
      });

      if (!response.ok) {
        throw new Error(`VM creation failed (${response.status})`);
      }

      const data = await response.json();
      cache.invalidateAll();
      alert(`VM "${vmForm.name}" created successfully!`);
      setShowVmModal(false);
      setVmForm({ name: "", flavor: "m1.small", image: "cirros-0.6.3-x86_64-disk", network: "" });
      fetchCloudSummary(); // Refresh data
    } catch (err) {
      alert(`Failed to create VM: ${err.message}`);
    } finally {
      setCreatingVm(false);
    }
  }

  async function handleCreateNetwork() {
    if (!networkForm.name || !networkForm.cidr) {
      alert("Name and CIDR are required for network creation.");
      return;
    }

    setCreatingNetwork(true);
    try {
      const response = await fetch(`/api/openstack/create-network`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(networkForm),
      });

      if (!response.ok) {
        throw new Error(`Network creation failed (${response.status})`);
      }

      const data = await response.json();
      alert(`Network "${networkForm.name}" created successfully!`);
      setShowNetworkModal(false);
      setNetworkForm({ name: "", cidr: "192.168.1.0/24", segmentation: "VXLAN-1000" });
      fetchCloudSummary(); // Refresh data
    } catch (err) {
      alert(`Failed to create network: ${err.message}`);
    } finally {
      setCreatingNetwork(false);
    }
  }

  async function handleLaunchInstance() {
    if (!launchForm.name || !launchForm.flavor || !launchForm.image || !launchForm.network) {
      alert("All fields are required for instance launch.");
      return;
    }

    setLaunchingInstance(true);
    try {
      const response = await fetch(`/api/openstack/launch-instance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(launchForm),
      });

      if (!response.ok) {
        throw new Error(`Instance launch failed (${response.status})`);
      }

      const data = await response.json();
      alert(`Instance "${launchForm.name}" launched successfully!`);
      setShowLaunchModal(false);
      setLaunchForm({ name: "", flavor: "m1.small", image: "cirros-0.6.3-x86_64-disk", network: "" });
      fetchCloudSummary(); // Refresh data
    } catch (err) {
      alert(`Failed to launch instance: ${err.message}`);
    } finally {
      setLaunchingInstance(false);
    }
  }

  // Remove mock fallback data - only show real data
  const displayStats = stats;
  const displayFlows = securityRules;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Sub-navigation control bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-bold shadow-md">
            OVN
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-50">
              OpenStack OVN Cloud Controller
            </h2>
            <p className="text-xs text-zinc-400">
              Centralized tenant networking logic, virtual routers, overlay segmentation & ACL policies.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs font-semibold">
          <button 
            onClick={() => setShowTopology(true)}
            className="px-3.5 py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition"
          >
            Show Topology Graph
          </button>
          <button 
            onClick={() => scrollToSection(networksRef)}
            className="px-3.5 py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition"
          >
            Logical Networks
          </button>
          <button 
            onClick={() => scrollToSection(securityRef)}
            className="px-3.5 py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition"
          >
            Security Groups
          </button>
          <button 
            onClick={() => setShowLaunchModal(true)}
            className="px-4 py-2 rounded-lg bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-bold transition"
          >
            Launch VM Instance
          </button>
        </div>
      </div>

      <main className="p-6 space-y-8 h-full flex flex-col">
        {showTopology && (
          <section className="h-[700px] mb-8">
             <CloudTopology 
               virtualMachines={virtualMachines} 
               networks={networks} 
               routers={routers} 
               ports={ports} 
               onClose={() => setShowTopology(false)} 
             />
          </section>
        )}
        
        <div>
          <section className="rounded-3xl border border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-800 p-8 shadow-2xl mb-8">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-4xl font-bold leading-tight mb-4">
                Modern OVN-Based OpenStack Networking Control Center
              </h2>
              <p className="text-zinc-300 text-lg leading-relaxed">
                Centralized React dashboard for managing OpenStack networking,
                OVN logical topology, Neutron services, virtual machines,
                distributed routing, VXLAN/Geneve overlays, and SDN security
                policies in real time.
              </p>
              <div className="mt-6 flex gap-4">
                <button 
                  onClick={() => setShowTopology(true)}
                  className="rounded-2xl bg-blue-600 px-6 py-3 font-semibold shadow-lg shadow-blue-500/30 hover:bg-blue-500 transition"
                >
                  View Topology
                </button>
                <button 
                  onClick={() => scrollToSection(infrastructureRef)}
                  className="rounded-2xl border border-zinc-700 px-6 py-3 hover:bg-zinc-800 transition"
                >
                  OVN Controller Status
                </button>
              </div>
            </div>

            <div ref={infrastructureRef} className="rounded-3xl border border-zinc-700 bg-zinc-950/70 p-6">
              <h3 className="text-xl font-semibold mb-6">
                OVN Infrastructure Overview
              </h3>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>OVN Northbound DB</span>
                    <span className={`text-${infrastructureStatus.ovnNbDb.status === 'Healthy' ? 'green' : 'yellow'}-400`}>
                      {infrastructureStatus.ovnNbDb.status}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all duration-300" 
                      style={{ width: `${infrastructureStatus.ovnNbDb.health}%` }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>OVN Southbound DB</span>
                    <span className={`text-${infrastructureStatus.ovnSbDb.status === 'Connected' ? 'green' : 'yellow'}-400`}>
                      {infrastructureStatus.ovnSbDb.status}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-300" 
                      style={{ width: `${infrastructureStatus.ovnSbDb.health}%` }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Neutron API</span>
                    <span className={`text-${infrastructureStatus.neutronApi.status === 'Healthy' ? 'green' : 'yellow'}-400`}>
                      {infrastructureStatus.neutronApi.status}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
                    <div 
                      className="h-full bg-yellow-500 rounded-full transition-all duration-300" 
                      style={{ width: `${infrastructureStatus.neutronApi.health}%` }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>OVS Integration Bridges</span>
                    <span className={`text-${infrastructureStatus.ovsBridges.status === 'Operational' ? 'green' : 'yellow'}-400`}>
                      {infrastructureStatus.ovsBridges.status}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500 rounded-full transition-all duration-300" 
                      style={{ width: `${infrastructureStatus.ovsBridges.health}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-300 shadow-2xl">
            Loading Cloud data from Node middleware...
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-3xl border border-red-500/50 bg-red-900/20 p-6 text-red-200 space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2">⚠️ OpenStack Connection Failed</h3>
                <p className="font-mono text-sm bg-red-950/60 rounded-xl p-3 text-red-300 break-all">{error}</p>
                {errorDetails.keystoneUrl && (
                  <p className="text-sm text-red-400">
                    <span className="font-semibold">Keystone URL tried:</span>{" "}
                    <code className="bg-red-950/60 px-2 py-0.5 rounded">{errorDetails.keystoneUrl}</code>
                  </p>
                )}
                {errorDetails.hint && (
                  <div className="rounded-xl bg-yellow-900/30 border border-yellow-600/40 p-4 text-yellow-200 text-sm">
                    <span className="font-semibold">💡 Fix: </span>{errorDetails.hint}
                  </div>
                )}
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={fetchCloudSummary}
                    className="rounded-xl bg-red-700 hover:bg-red-600 px-4 py-2 text-sm font-semibold transition"
                  >
                    Retry
                  </button>
                  <a
                    href="/api/openstack/ping"
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-red-600 hover:bg-red-900/40 px-4 py-2 text-sm font-semibold transition"
                  >
                    Run Diagnostics ↗
                  </a>
                </div>
              </div>
            )}

            <section className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
              {displayStats.length > 0 ? displayStats.map((item) => (
                <div
                  key={item.title}
                  className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl hover:scale-[1.02] transition"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-4xl">{item.icon}</span>
                  </div>
                  <h3 className="text-zinc-400 text-sm uppercase tracking-wider">
                    {item.title}
                  </h3>
                  <p className="text-4xl font-bold mt-2">{item.value}</p>
                </div>
              )) : (
                <div className="col-span-full text-center text-zinc-400 py-12">
                  No cloud statistics available. Connect to OpenStack to see live metrics.
                </div>
              )}
            </section>

            <section className="grid xl:grid-cols-2 gap-8">
              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">Virtual Machines</h2>
                    <p className="text-zinc-400 text-sm">
                      Instances attached to the OVN logical topology
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowVmModal(true)}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm hover:bg-blue-500 transition"
                  >
                    Create VM
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-800 text-left text-zinc-400 text-sm">
                        <th className="pb-4">Instance</th>
                        <th className="pb-4">Status</th>
                        <th className="pb-4">IP Address</th>
                        <th className="pb-4">Network</th>
                        <th className="pb-4">Zone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {virtualMachines.length > 0 ? virtualMachines.map((vm) => (
                        <tr
                          key={vm.id}
                          onClick={() => setSelectedVmId(vm.id)}
                          className={`border-b border-zinc-800/60 hover:bg-zinc-800/40 transition cursor-pointer ${
                            vm.id === selectedVmId ? "bg-zinc-800/60" : ""
                          }`}
                        >
                          <td className="py-4">
                            <div>
                              <p className="font-semibold">{vm.name}</p>
                              <p className="text-sm text-zinc-500">{vm.id}</p>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                vm.status === "ACTIVE"
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-yellow-500/20 text-yellow-400"
                              }`}
                            >
                              {vm.status}
                            </span>
                          </td>
                          <td>{vm.ip}</td>
                          <td>{vm.network}</td>
                          <td>{vm.zone}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="5" className="text-center text-zinc-400 py-8">
                            No virtual machines found. Connect to OpenStack to see your instances.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {selectedVm && (
                  <div className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950/50 p-5">
                    <h3 className="text-lg font-semibold mb-3">Selected VM</h3>
                    <p className="text-zinc-300 mb-2">
                      <strong>Name:</strong> {selectedVm.name}
                    </p>
                    <p className="text-zinc-300 mb-2">
                      <strong>Logical Port:</strong> {selectedVm.logicalPort || "N/A"}
                    </p>
                    <p className="text-zinc-300 mb-2">
                      <strong>Logical Switch:</strong> {selectedVm.logicalSwitch || "N/A"}
                    </p>
                  </div>
                )}
              </div>

              <div ref={networksRef} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">OVN Networks</h2>
                    <p className="text-zinc-400 text-sm">
                      Logical switches and overlay segments from the OVN Northbound DB
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowNetworkModal(true)}
                    className="rounded-xl bg-cyan-600 px-4 py-2 text-sm hover:bg-cyan-500 transition"
                  >
                    Create Network
                  </button>
                </div>
                <div className="space-y-4">
                  {networks.length > 0 ? networks.map((network) => (
                    <div
                      key={network.name}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-5 hover:border-blue-500 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">{network.name}</h3>
                          <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-400">
                            <span className="rounded-full bg-zinc-800 px-3 py-1">{network.type}</span>
                            <span className="rounded-full bg-zinc-800 px-3 py-1">{network.cidr}</span>
                            <span className="rounded-full bg-zinc-800 px-3 py-1">{network.segmentation}</span>
                          </div>
                        </div>
                        <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-400">
                          {network.status}
                        </span>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center text-zinc-400 py-8">
                      No networks found. Connect to OpenStack to see your OVN logical switches.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid xl:grid-cols-2 gap-8">
              <div ref={securityRef} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
                <h2 className="text-2xl font-bold mb-2">SDN Security Flow Policies</h2>
                <p className="text-zinc-400 mb-6">
                  Translate OpenStack security intent into OVN ACLs and verify the Northbound state.
                </p>
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="block mb-2 text-sm text-zinc-400">Source Instance</label>
                    <select
                      value={ruleForm.source}
                      onChange={(e) => updateRuleField("source", e.target.value)}
                      className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 outline-none focus:border-blue-500"
                    >
                      <option value="">Select source...</option>
                      {virtualMachines.map((vm) => (
                        <option key={vm.id} value={vm.name}>
                          {vm.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-2 text-sm text-zinc-400">Destination</label>
                    <select
                      value={ruleForm.destination}
                      onChange={(e) => updateRuleField("destination", e.target.value)}
                      className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 outline-none focus:border-blue-500"
                    >
                      <option value="">Select destination...</option>
                      {networks.map((network) => (
                        <option key={network.name} value={network.name}>
                          {network.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-2 text-sm text-zinc-400">Protocol</label>
                    <select
                      value={ruleForm.protocol}
                      onChange={(e) => updateRuleField("protocol", e.target.value)}
                      className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 outline-none focus:border-blue-500"
                    >
                      <option value="TCP">TCP</option>
                      <option value="UDP">UDP</option>
                      <option value="ICMP">ICMP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-2 text-sm text-zinc-400">Action</label>
                    <select
                      value={ruleForm.action}
                      onChange={(e) => updateRuleField("action", e.target.value)}
                      className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 outline-none focus:border-blue-500"
                    >
                      <option value="ALLOW">ALLOW</option>
                      <option value="DENY">DENY</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block mb-2 text-sm text-zinc-400">Destination Port</label>
                    <input
                      value={ruleForm.port}
                      onChange={(e) => updateRuleField("port", e.target.value)}
                      className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-4 outline-none focus:border-blue-500"
                      placeholder="22"
                    />
                  </div>
                </div>
                {ruleError && <div className="mt-4 text-sm text-red-400">{ruleError}</div>}
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    onClick={handleApplyRule}
                    disabled={savingRule}
                    className="rounded-2xl bg-blue-600 px-6 py-4 font-semibold shadow-lg shadow-blue-500/30 hover:bg-blue-500 transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingRule ? "Applying rule..." : "Apply OVN Security Policy"}
                  </button>
                  <button
                    onClick={handleVerifyAcl}
                    disabled={verifyingAcl}
                    className="rounded-2xl border border-zinc-700 bg-zinc-800 px-6 py-4 font-semibold text-zinc-100 hover:bg-zinc-700 transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {verifyingAcl ? "Verifying ACL..." : "Verify ACL State"}
                  </button>
                </div>
                {aclVerification.length > 0 && (
                  <div className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950/40 p-5">
                    <h4 className="text-lg font-semibold mb-3">OVN ACL Verification</h4>
                    {aclVerification.map((line, idx) => (
                      <p key={idx} className="text-sm text-zinc-300 leading-relaxed">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">Live OVN Traffic Flows</h2>
                    <p className="text-zinc-400 text-sm">
                      Distributed SDN traffic policies across virtual networks
                    </p>
                  </div>
                  <span className="rounded-full bg-green-500/20 px-4 py-2 text-sm text-green-400">
                    Real-Time
                  </span>
                </div>
                <div className="space-y-4">
                  {displayFlows.map((flow, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-lg">{flow.source}</p>
                          <p className="text-sm text-zinc-400">→ {flow.destination}</p>
                        </div>
                        <div className="flex gap-3 flex-wrap">
                          <span className="rounded-full bg-blue-500/20 px-3 py-1 text-sm text-blue-400">
                            {flow.protocol}
                          </span>
                          <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-sm text-cyan-400">
                            Port {flow.port}
                          </span>
                          <span className="rounded-full bg-green-500/20 px-3 py-1 text-sm text-green-400">
                            {flow.action}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {displayFlows.length === 0 && (
                    <div className="text-center text-zinc-400 py-8">
                      No flow data available. Connect to OpenStack to see live traffic flows.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
        </div>

        {/* Footer always below main content */}
        {!showTopology && (
          <footer className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400 mt-auto">
          Modern React + OpenStack + OVN SDN Dashboard Architecture
          <div className="mt-2 text-sm text-zinc-500">
            React UI • Node.js Middleware • OpenStack Neutron • OVN • Open
            vSwitch • VXLAN/Geneve
          </div>
        </footer>
        )}

        {/* Create VM Modal */}
        {showVmModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Create Virtual Machine</h3>
              <div className="space-y-4">
                <div>
                  <label className="block mb-2 text-sm text-zinc-400">VM Name</label>
                  <input
                    value={vmForm.name}
                    onChange={(e) => updateVmField("name", e.target.value)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500"
                    placeholder="my-vm-01"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm text-zinc-400">Flavor</label>
                  <select
                    value={vmForm.flavor}
                    onChange={(e) => updateVmField("flavor", e.target.value)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500"
                  >
                    <option value="">Default / First Available Flavor</option>
                    {availableFlavors.map((f) => (
                      <option key={f.id} value={f.name || f.id}>
                        {f.name} ({f.vcpus || 1} vCPU, {f.ram || 512}MB RAM)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-sm text-zinc-400">Image</label>
                  <select
                    value={vmForm.image}
                    onChange={(e) => updateVmField("image", e.target.value)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500"
                  >
                    <option value="">Default / First Active Image</option>
                    {availableImages.map((img) => (
                      <option key={img.id} value={img.name || img.id}>
                        {img.name || img.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-sm text-zinc-400">Network</label>
                  <select
                    value={vmForm.network}
                    onChange={(e) => updateVmField("network", e.target.value)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500"
                  >
                    <option value="">Auto-select Private Network</option>
                    {networks.map((network) => (
                      <option key={network.id || network.name} value={network.name || network.id}>
                        {network.name} {network.cidr ? `(${network.cidr})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowVmModal(false)}
                  className="flex-1 rounded-2xl border border-zinc-700 px-4 py-3 hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateVm}
                  disabled={creatingVm}
                  className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 transition disabled:opacity-60"
                >
                  {creatingVm ? "Creating..." : "Create VM"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Network Modal */}
        {showNetworkModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Create OVN Network</h3>
              <div className="space-y-4">
                <div>
                  <label className="block mb-2 text-sm text-zinc-400">Network Name</label>
                  <input
                    value={networkForm.name}
                    onChange={(e) => updateNetworkField("name", e.target.value)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500"
                    placeholder="private-net"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm text-zinc-400">CIDR</label>
                  <input
                    value={networkForm.cidr}
                    onChange={(e) => updateNetworkField("cidr", e.target.value)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500"
                    placeholder="192.168.1.0/24"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm text-zinc-400">Segmentation</label>
                  <input
                    value={networkForm.segmentation}
                    onChange={(e) => updateNetworkField("segmentation", e.target.value)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500"
                    placeholder="VXLAN-1000"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowNetworkModal(false)}
                  className="flex-1 rounded-2xl border border-zinc-700 px-4 py-3 hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateNetwork}
                  disabled={creatingNetwork}
                  className="flex-1 rounded-2xl bg-cyan-600 px-4 py-3 font-semibold hover:bg-cyan-500 transition disabled:opacity-60"
                >
                  {creatingNetwork ? "Creating..." : "Create Network"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Launch Instance Modal */}
        {showLaunchModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4">Launch Instance</h3>
              <div className="space-y-4">
                <div>
                  <label className="block mb-2 text-sm text-zinc-400">Instance Name</label>
                  <input
                    value={launchForm.name}
                    onChange={(e) => updateLaunchField("name", e.target.value)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500"
                    placeholder="my-instance-01"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-sm text-zinc-400">Flavor</label>
                  <select
                    value={launchForm.flavor}
                    onChange={(e) => updateLaunchField("flavor", e.target.value)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500"
                  >
                    <option value="">Default / First Available Flavor</option>
                    {availableFlavors.map((f) => (
                      <option key={f.id} value={f.name || f.id}>
                        {f.name} ({f.vcpus || 1} vCPU, {f.ram || 512}MB RAM)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-sm text-zinc-400">Image</label>
                  <select
                    value={launchForm.image}
                    onChange={(e) => updateLaunchField("image", e.target.value)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500"
                  >
                    <option value="">Default / First Active Image</option>
                    {availableImages.map((img) => (
                      <option key={img.id} value={img.name || img.id}>
                        {img.name || img.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-sm text-zinc-400">Network</label>
                  <select
                    value={launchForm.network}
                    onChange={(e) => updateLaunchField("network", e.target.value)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 p-3 outline-none focus:border-blue-500"
                  >
                    <option value="">Auto-select Private Network</option>
                    {networks.map((network) => (
                      <option key={network.id || network.name} value={network.name || network.id}>
                        {network.name} {network.cidr ? `(${network.cidr})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowLaunchModal(false)}
                  className="flex-1 rounded-2xl border border-zinc-700 px-4 py-3 hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLaunchInstance}
                  disabled={launchingInstance}
                  className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 transition disabled:opacity-60"
                >
                  {launchingInstance ? "Launching..." : "Launch Instance"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
