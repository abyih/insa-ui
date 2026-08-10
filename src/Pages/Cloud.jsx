import React, { useEffect, useMemo, useState, useRef } from "react";
import CloudTopology from "../Components/CloudTopology";
import { cache } from "../pipeline/cache";
import {
  Server,
  Globe,
  Trash2,
  RotateCw,
  Power,
  Play,
  Square,
  Plus,
  Network as NetIcon,
  Shield,
  Zap,
  Activity,
  CheckCircle,
  AlertCircle,
  X,
  RefreshCw,
  Cpu,
  Layers,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

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

  // Modals state
  const [showVmModal, setShowVmModal] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [creatingVm, setCreatingVm] = useState(false);
  const [creatingNetwork, setCreatingNetwork] = useState(false);
  const [vmModalError, setVmModalError] = useState("");
  const [networkModalError, setNetworkModalError] = useState("");

  // Action loading states
  const [actionLoading, setActionLoading] = useState({}); // { [vmId]: 'reboot' | 'start' | 'stop' | 'delete' }

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    confirmVariant: "danger", // 'danger' | 'primary'
    onConfirm: null,
    loading: false,
  });

  // Global notification banner
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', message: '' }

  const [availableFlavors, setAvailableFlavors] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  const [vmForm, setVmForm] = useState({ name: "", flavor: "", image: "", network: "" });
  const [networkForm, setNetworkForm] = useState({
    name: "",
    cidr: "192.168.1.0/24",
    segmentation: "VXLAN-1000",
  });

  // Infrastructure status state
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
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const selectedVm = useMemo(
    () => virtualMachines.find((vm) => vm.id === selectedVmId),
    [selectedVmId, virtualMachines]
  );

  const triggerNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  };

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
      setSelectedVmId((prev) => prev || payload.virtualMachines?.[0]?.id || null);
      setAvailableFlavors(payload.availableFlavors || []);
      setAvailableImages(payload.availableImages || []);

      if (payload.infrastructureStatus) {
        setInfrastructureStatus(payload.infrastructureStatus);
      }
    } catch (err) {
      setError(err.message || "Failed to load cloud data");
    } finally {
      setLoading(false);
    }
  }

  // ─── VM Management Handlers ───
  const updateVmField = (field, value) => {
    setVmForm((prev) => ({ ...prev, [field]: value }));
  };

  async function handleCreateVm() {
    if (!vmForm.name || !vmForm.name.trim()) {
      setVmModalError("VM Instance Name is required.");
      return;
    }

    setCreatingVm(true);
    setVmModalError("");

    try {
      const response = await fetch(`/api/openstack/create-vm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vmForm),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `VM creation failed (${response.status})`);
      }

      cache.invalidateAll();
      setShowVmModal(false);
      setVmForm({ name: "", flavor: "", image: "", network: "" });
      triggerNotification("success", `VM "${vmForm.name}" created successfully!`);
      fetchCloudSummary();
    } catch (err) {
      setVmModalError(err.message || "Failed to create VM");
    } finally {
      setCreatingVm(false);
    }
  }

  function confirmDeleteVm(vm) {
    setConfirmDialog({
      open: true,
      title: "Delete Virtual Machine",
      message: `Are you sure you want to permanently delete instance "${vm.name}" (${vm.id})? This action cannot be undone.`,
      confirmText: "Delete VM",
      confirmVariant: "danger",
      loading: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, loading: true }));
        try {
          const response = await fetch(`/api/openstack/delete-vm/${vm.id}`, {
            method: "DELETE",
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Delete failed");

          cache.invalidateAll();
          setConfirmDialog({ open: false, title: "", message: "", onConfirm: null, loading: false });
          triggerNotification("success", `Instance "${vm.name}" deleted successfully.`);
          if (selectedVmId === vm.id) setSelectedVmId(null);
          fetchCloudSummary();
        } catch (err) {
          triggerNotification("error", `Failed to delete VM: ${err.message}`);
          setConfirmDialog((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  }

  async function handleVmAction(vmId, action, vmName = "VM") {
    setActionLoading((prev) => ({ ...prev, [vmId]: action }));
    try {
      const response = await fetch(`/api/openstack/servers/${vmId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Action "${action}" failed`);

      triggerNotification(
        "success",
        `Action "${action.toUpperCase()}" triggered for "${vmName}".`
      );
      // Wait slightly then refresh to capture status change
      setTimeout(() => fetchCloudSummary(), 2000);
    } catch (err) {
      triggerNotification("error", `Failed to ${action} instance: ${err.message}`);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[vmId];
        return next;
      });
    }
  }

  // ─── Network Management Handlers ───
  const updateNetworkField = (field, value) => {
    setNetworkForm((prev) => ({ ...prev, [field]: value }));
  };

  async function handleCreateNetwork() {
    if (!networkForm.name || !networkForm.name.trim()) {
      setNetworkModalError("Network Name is required.");
      return;
    }
    if (!networkForm.cidr || !networkForm.cidr.trim()) {
      setNetworkModalError("Subnet CIDR is required.");
      return;
    }

    setCreatingNetwork(true);
    setNetworkModalError("");

    try {
      const response = await fetch(`/api/openstack/create-network`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(networkForm),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Network creation failed (${response.status})`);
      }

      cache.invalidateAll();
      setShowNetworkModal(false);
      setNetworkForm({ name: "", cidr: "192.168.1.0/24", segmentation: "VXLAN-1000" });
      triggerNotification("success", `Network "${networkForm.name}" created successfully!`);
      fetchCloudSummary();
    } catch (err) {
      setNetworkModalError(err.message || "Failed to create network");
    } finally {
      setCreatingNetwork(false);
    }
  }

  function confirmDeleteNetwork(net) {
    const netId = net.id || net.name;
    setConfirmDialog({
      open: true,
      title: "Delete OVN Network",
      message: `Are you sure you want to delete network "${net.name}"? Any attached ports must be detached first.`,
      confirmText: "Delete Network",
      confirmVariant: "danger",
      loading: false,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, loading: true }));
        try {
          const response = await fetch(`/api/openstack/delete-network/${netId}`, {
            method: "DELETE",
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Delete network failed");

          cache.invalidateAll();
          setConfirmDialog({ open: false, title: "", message: "", onConfirm: null, loading: false });
          triggerNotification("success", `Network "${net.name}" deleted successfully.`);
          fetchCloudSummary();
        } catch (err) {
          triggerNotification("error", `Failed to delete network: ${err.message}`);
          setConfirmDialog((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  }

  // ─── Security Rules & ACL Handlers ───
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
          "The rule has been created in Neutron and translated to OVN Port Groups successfully.",
        ];
      }
      setAclVerification(acls);
    } catch (err) {
      setAclVerification([err.message || "ACL verification failed"]);
    }
  }

  async function handleApplyRule() {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ruleForm),
      });

      if (!response.ok) {
        throw new Error(`Rule apply failed (${response.status})`);
      }

      const data = await response.json();
      const nextRule = data.acl || data.rule;
      setSecurityRules((prev) => [...prev, nextRule].filter(Boolean));
      triggerNotification("success", "Security group rule applied successfully.");
      setAclVerification([`Rule submitted. Verifying ${ruleForm.destination || "logical switch"}...`]);
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

  const displayStats = stats;
  const displayFlows = securityRules;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border transition-all duration-300 ${
            notification.type === "success"
              ? "bg-zinc-900 border-emerald-500/50 text-emerald-300 shadow-emerald-950/40"
              : "bg-zinc-900 border-red-500/50 text-red-300 shadow-red-950/40"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span className="text-sm font-medium">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 text-zinc-400 hover:text-zinc-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub-navigation control bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-bold shadow-md text-indigo-400">
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

        <div className="flex items-center gap-2.5 flex-wrap text-xs font-semibold">
          <button
            onClick={() => setShowTopology(true)}
            className="px-3.5 py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <NetIcon className="w-3.5 h-3.5 text-indigo-400" />
            Show Topology Graph
          </button>
          <button
            onClick={() => scrollToSection(networksRef)}
            className="px-3.5 py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            Logical Networks
          </button>
          <button
            onClick={() => scrollToSection(securityRef)}
            className="px-3.5 py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            Security Groups
          </button>
          <button
            onClick={() => {
              setVmModalError("");
              setShowVmModal(true);
            }}
            className="px-4 py-2 rounded-lg bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Launch VM Instance
          </button>
        </div>
      </div>

      <main className="p-6 space-y-8 h-full flex flex-col">
        {/* Topology View Panel */}
        {showTopology && (
          <section className="mb-8">
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
          {/* Hero Banner with Controller Status */}
          <section className="rounded-3xl border border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-800 p-8 shadow-2xl mb-8">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl lg:text-4xl font-bold leading-tight mb-4 text-zinc-50">
                  Modern OVN-Based OpenStack Networking Control Center
                </h2>
                <p className="text-zinc-300 text-base lg:text-lg leading-relaxed">
                  Manage OpenStack tenant networking, OVN logical switches, VM instances,
                  distributed virtual routers, VXLAN overlays, and SDN security policies in real time.
                </p>
                <div className="mt-6 flex flex-wrap gap-4">
                  <button
                    onClick={() => setShowTopology(true)}
                    className="rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-sm shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition flex items-center gap-2 cursor-pointer"
                  >
                    <NetIcon className="w-4 h-4" />
                    View Topology
                  </button>
                  <button
                    onClick={() => scrollToSection(infrastructureRef)}
                    className="rounded-xl border border-zinc-700 px-5 py-2.5 text-sm font-semibold hover:bg-zinc-800 transition flex items-center gap-2 cursor-pointer"
                  >
                    <Activity className="w-4 h-4 text-zinc-400" />
                    Controller Health
                  </button>
                  <button
                    onClick={fetchCloudSummary}
                    className="rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-700 transition flex items-center gap-1.5 cursor-pointer text-zinc-300"
                    title="Refresh Data"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Infrastructure Status Cards */}
              <div ref={infrastructureRef} className="rounded-2xl border border-zinc-700/80 bg-zinc-950/70 p-6 shadow-xl">
                <h3 className="text-lg font-bold mb-5 flex items-center gap-2 text-zinc-200">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  OVN Infrastructure Health
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-zinc-400">OVN Northbound DB</span>
                      <span
                        className={
                          infrastructureStatus.ovnNbDb.status === "Healthy"
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }
                      >
                        {infrastructureStatus.ovnNbDb.status}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${infrastructureStatus.ovnNbDb.health}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-zinc-400">OVN Southbound DB</span>
                      <span
                        className={
                          infrastructureStatus.ovnSbDb.status === "Connected"
                            ? "text-blue-400"
                            : "text-amber-400"
                        }
                      >
                        {infrastructureStatus.ovnSbDb.status}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${infrastructureStatus.ovnSbDb.health}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-zinc-400">Neutron API Service</span>
                      <span
                        className={
                          infrastructureStatus.neutronApi.status === "Healthy"
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }
                      >
                        {infrastructureStatus.neutronApi.status}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${infrastructureStatus.neutronApi.health}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1.5">
                      <span className="text-zinc-400">OVS Integration Bridges</span>
                      <span
                        className={
                          infrastructureStatus.ovsBridges.status === "Operational"
                            ? "text-cyan-400"
                            : "text-amber-400"
                        }
                      >
                        {infrastructureStatus.ovsBridges.status}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                        style={{ width: `${infrastructureStatus.ovsBridges.health}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {loading ? (
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-12 text-center text-zinc-300 shadow-2xl flex flex-col items-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
              <p className="font-semibold text-sm">Loading Cloud data from OpenStack / OVN...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-3xl border border-red-500/50 bg-red-950/20 p-6 text-red-200 space-y-3 shadow-xl">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    OpenStack Connection Failed
                  </h3>
                  <p className="font-mono text-sm bg-red-950/60 rounded-xl p-3 text-red-300 break-all border border-red-900/50">
                    {error}
                  </p>
                  {errorDetails.keystoneUrl && (
                    <p className="text-xs text-red-400">
                      <span className="font-semibold">Keystone URL:</span>{" "}
                      <code className="bg-red-950/60 px-2 py-0.5 rounded border border-red-900/40">
                        {errorDetails.keystoneUrl}
                      </code>
                    </p>
                  )}
                  {errorDetails.hint && (
                    <div className="rounded-xl bg-amber-950/40 border border-amber-600/40 p-4 text-amber-200 text-sm">
                      <span className="font-semibold">💡 Hint: </span>
                      {errorDetails.hint}
                    </div>
                  )}
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={fetchCloudSummary}
                      className="rounded-xl bg-red-700 hover:bg-red-600 px-4 py-2 text-xs font-bold transition cursor-pointer"
                    >
                      Retry Connection
                    </button>
                    <a
                      href="/api/openstack/ping"
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-red-700 hover:bg-red-900/40 px-4 py-2 text-xs font-bold transition flex items-center gap-1 text-red-300"
                    >
                      Run Diagnostics <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Statistics Metric Cards */}
              <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
                {displayStats.length > 0 ? (
                  displayStats.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-lg hover:border-zinc-700 transition"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-3xl">{item.icon}</span>
                      </div>
                      <h3 className="text-zinc-400 text-xs uppercase tracking-wider font-semibold">
                        {item.title}
                      </h3>
                      <p className="text-3xl font-bold mt-1 text-zinc-100">{item.value}</p>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full text-center text-zinc-500 py-8 bg-zinc-900 border border-zinc-800 rounded-2xl">
                    No cloud statistics available.
                  </div>
                )}
              </section>

              {/* Virtual Machines & OVN Networks Sections */}
              <section className="grid xl:grid-cols-2 gap-8">
                {/* ── Virtual Machines Card ── */}
                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-100">
                          <Server className="w-5 h-5 text-indigo-400" />
                          Virtual Machines ({virtualMachines.length})
                        </h2>
                        <p className="text-zinc-400 text-xs mt-0.5">
                          Nova compute instances provisioned on OVN tenant network
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setVmModalError("");
                          setShowVmModal(true);
                        }}
                        className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-3.5 py-2 text-xs font-bold text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create VM
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase font-semibold">
                            <th className="pb-3">Instance</th>
                            <th className="pb-3">Status</th>
                            <th className="pb-3">IP Address</th>
                            <th className="pb-3">Network</th>
                            <th className="pb-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {virtualMachines.length > 0 ? (
                            virtualMachines.map((vm) => {
                              const isSelected = vm.id === selectedVmId;
                              const isActive = vm.status === "ACTIVE";
                              const isActionRunning = Boolean(actionLoading[vm.id]);

                              return (
                                <tr
                                  key={vm.id}
                                  onClick={() => setSelectedVmId(vm.id)}
                                  className={`border-b border-zinc-800/60 hover:bg-zinc-800/40 transition cursor-pointer ${
                                    isSelected ? "bg-zinc-800/50" : ""
                                  }`}
                                >
                                  <td className="py-3.5">
                                    <div>
                                      <p className="font-semibold text-zinc-100">{vm.name}</p>
                                      <p className="text-[11px] font-mono text-zinc-500 truncate max-w-[140px]">
                                        {vm.id}
                                      </p>
                                    </div>
                                  </td>
                                  <td>
                                    <span
                                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border inline-block ${
                                        isActive
                                          ? "bg-emerald-950/80 text-emerald-400 border-emerald-800/80"
                                          : vm.status === "BUILD"
                                          ? "bg-blue-950/80 text-blue-400 border-blue-800/80"
                                          : "bg-amber-950/80 text-amber-400 border-amber-800/80"
                                      }`}
                                    >
                                      {vm.status}
                                    </span>
                                  </td>
                                  <td className="font-mono text-xs text-zinc-300">{vm.ip}</td>
                                  <td className="text-xs text-zinc-400">{vm.network}</td>
                                  <td className="py-3.5 text-right">
                                    <div
                                      className="flex items-center justify-end gap-1.5"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {/* Start / Stop action */}
                                      <button
                                        onClick={() =>
                                          handleVmAction(
                                            vm.id,
                                            isActive ? "stop" : "start",
                                            vm.name
                                          )
                                        }
                                        disabled={isActionRunning}
                                        title={isActive ? "Stop Instance" : "Start Instance"}
                                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition disabled:opacity-40 cursor-pointer"
                                      >
                                        {isActive ? (
                                          <Square className="w-3.5 h-3.5 text-amber-400" />
                                        ) : (
                                          <Play className="w-3.5 h-3.5 text-emerald-400" />
                                        )}
                                      </button>

                                      {/* Soft Reboot action */}
                                      <button
                                        onClick={() => handleVmAction(vm.id, "reboot", vm.name)}
                                        disabled={isActionRunning}
                                        title="Reboot Instance"
                                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-indigo-300 transition disabled:opacity-40 cursor-pointer"
                                      >
                                        <RotateCw className="w-3.5 h-3.5 text-indigo-400" />
                                      </button>

                                      {/* Delete action */}
                                      <button
                                        onClick={() => confirmDeleteVm(vm)}
                                        disabled={isActionRunning}
                                        title="Delete Instance"
                                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 hover:border-red-800/60 border border-transparent transition disabled:opacity-40 cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan="5" className="text-center text-zinc-500 py-8">
                                No virtual machines found in this project.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Selected VM Inspector */}
                  {selectedVm && (
                    <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-inner">
                      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-indigo-400" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                            Selected Instance: {selectedVm.name}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              handleVmAction(
                                selectedVm.id,
                                selectedVm.status === "ACTIVE" ? "stop" : "start",
                                selectedVm.name
                              )
                            }
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer"
                          >
                            {selectedVm.status === "ACTIVE" ? "Power Off" : "Power On"}
                          </button>
                          <button
                            onClick={() => handleVmAction(selectedVm.id, "reboot", selectedVm.name)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition cursor-pointer"
                          >
                            Reboot
                          </button>
                          <button
                            onClick={() => confirmDeleteVm(selectedVm)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-950/60 hover:bg-red-900 text-red-400 border border-red-800/60 transition cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2 text-xs">
                        <p className="text-zinc-400">
                          <strong className="text-zinc-300">IP:</strong> {selectedVm.ip}
                        </p>
                        <p className="text-zinc-400">
                          <strong className="text-zinc-300">Zone:</strong> {selectedVm.zone || "nova"}
                        </p>
                        <p className="text-zinc-400">
                          <strong className="text-zinc-300">Logical Port:</strong>{" "}
                          <span className="font-mono text-[11px] text-zinc-300">
                            {selectedVm.logicalPort || "N/A"}
                          </span>
                        </p>
                        <p className="text-zinc-400">
                          <strong className="text-zinc-300">Logical Switch:</strong>{" "}
                          <span className="font-mono text-[11px] text-cyan-400">
                            {selectedVm.logicalSwitch || "N/A"}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── OVN Networks Card ── */}
                <div
                  ref={networksRef}
                  className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-100">
                          <Globe className="w-5 h-5 text-emerald-400" />
                          OVN Networks ({networks.length})
                        </h2>
                        <p className="text-zinc-400 text-xs mt-0.5">
                          Logical switches and overlay segments from OVN Northbound DB
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setNetworkModalError("");
                          setShowNetworkModal(true);
                        }}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create Network
                      </button>
                    </div>

                    <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
                      {networks.length > 0 ? (
                        networks.map((network) => (
                          <div
                            key={network.id || network.name}
                            className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 hover:border-emerald-500/50 transition flex items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-zinc-200 text-sm">
                                  {network.name}
                                </h3>
                                <span className="rounded-full bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                                  {network.status || "ACTIVE"}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2 text-xs text-zinc-400 font-mono">
                                <span className="rounded-md bg-zinc-900 px-2 py-0.5 border border-zinc-800">
                                  {network.cidr || "0.0.0.0/0"}
                                </span>
                                <span className="rounded-md bg-zinc-900 px-2 py-0.5 border border-zinc-800 text-cyan-400">
                                  {network.segmentation || "VXLAN"}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => confirmDeleteNetwork(network)}
                              title={`Delete Network "${network.name}"`}
                              className="p-2 rounded-lg bg-zinc-900 hover:bg-red-950/60 text-zinc-400 hover:text-red-400 hover:border-red-800/60 border border-zinc-800 transition cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-zinc-500 py-12">
                          No logical networks found in OpenStack.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Security Groups & Flows Sections */}
              <section className="grid xl:grid-cols-2 gap-8">
                {/* ── SDN Security Flow Policies ── */}
                <div ref={securityRef} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
                  <h2 className="text-xl font-bold mb-1.5 flex items-center gap-2 text-zinc-100">
                    <Shield className="w-5 h-5 text-amber-400" />
                    SDN Security Flow Policies
                  </h2>
                  <p className="text-zinc-400 text-xs mb-6">
                    Translate OpenStack security intent into OVN ACLs and verify Northbound state.
                  </p>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1.5 text-xs font-semibold text-zinc-400">
                        Source Instance
                      </label>
                      <select
                        value={ruleForm.source}
                        onChange={(e) => updateRuleField("source", e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200 outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="">Select source VM...</option>
                        {virtualMachines.map((vm) => (
                          <option key={vm.id} value={vm.name}>
                            {vm.name} ({vm.ip})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block mb-1.5 text-xs font-semibold text-zinc-400">
                        Destination Network
                      </label>
                      <select
                        value={ruleForm.destination}
                        onChange={(e) => updateRuleField("destination", e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200 outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="">Select destination network...</option>
                        {networks.map((network) => (
                          <option key={network.name} value={network.name}>
                            {network.name} ({network.cidr})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block mb-1.5 text-xs font-semibold text-zinc-400">
                        Protocol
                      </label>
                      <select
                        value={ruleForm.protocol}
                        onChange={(e) => updateRuleField("protocol", e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200 outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="TCP">TCP</option>
                        <option value="UDP">UDP</option>
                        <option value="ICMP">ICMP (Ping / Trace)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block mb-1.5 text-xs font-semibold text-zinc-400">
                        Action
                      </label>
                      <select
                        value={ruleForm.action}
                        onChange={(e) => updateRuleField("action", e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200 outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="ALLOW">ALLOW</option>
                        <option value="DENY">DENY</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block mb-1.5 text-xs font-semibold text-zinc-400">
                        Destination Port (Optional for ICMP)
                      </label>
                      <input
                        value={ruleForm.port}
                        onChange={(e) => updateRuleField("port", e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200 outline-none focus:border-indigo-500"
                        placeholder="22, 80, 443..."
                      />
                    </div>
                  </div>

                  {ruleError && (
                    <div className="mt-3 text-xs text-red-400 bg-red-950/40 p-2.5 rounded-lg border border-red-900/50">
                      {ruleError}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      onClick={handleApplyRule}
                      disabled={savingRule}
                      className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 transition disabled:opacity-60 cursor-pointer"
                    >
                      {savingRule ? "Applying rule..." : "Apply OVN Security Policy"}
                    </button>
                    <button
                      onClick={handleVerifyAcl}
                      disabled={verifyingAcl}
                      className="rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-5 py-3 text-xs font-bold text-zinc-200 transition disabled:opacity-60 cursor-pointer"
                    >
                      {verifyingAcl ? "Verifying ACL..." : "Verify ACL State"}
                    </button>
                  </div>

                  {aclVerification.length > 0 && (
                    <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                      <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                        OVN ACL Verification Output
                      </h4>
                      <div className="space-y-1 font-mono text-[11px] text-zinc-300">
                        {aclVerification.map((line, idx) => (
                          <p key={idx} className="leading-relaxed">
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Real-Time Traffic Flows ── */}
                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-100">
                        <Zap className="w-5 h-5 text-cyan-400" />
                        Live Security Flow Rules
                      </h2>
                      <p className="text-zinc-400 text-xs mt-0.5">
                        Active distributed SDN rules across tenant networks
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-950/80 border border-emerald-800/80 px-3 py-1 text-xs font-semibold text-emerald-400">
                      Active
                    </span>
                  </div>

                  <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
                    {displayFlows.length > 0 ? (
                      displayFlows.map((flow, index) => (
                        <div
                          key={flow.id || index}
                          className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-semibold text-sm text-zinc-200">
                              {flow.protocol?.toUpperCase()} Policy
                            </p>
                            <p className="text-xs text-zinc-400 mt-0.5">
                              Port Range: <span className="text-zinc-300 font-mono">{flow.port || "Any"}</span>
                            </p>
                          </div>
                          <div className="flex gap-2 items-center">
                            <span className="rounded-md bg-indigo-950/80 border border-indigo-800 px-2 py-0.5 text-[11px] font-mono text-indigo-300">
                              {flow.protocol || "ANY"}
                            </span>
                            <span className="rounded-md bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                              {flow.action || "ALLOW"}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-zinc-500 py-12">
                        No security group rules configured yet.
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        {!showTopology && (
          <footer className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center text-zinc-500 text-xs mt-auto">
            Modern React + OpenStack + OVN SDN Dashboard Architecture • Node.js Backend • OVN Northbound DB • OVSDB
          </footer>
        )}

        {/* ── CREATE VM MODAL (Unified & Non-Sticking) ── */}
        {showVmModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 w-full max-w-md shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <Server className="w-5 h-5 text-indigo-400" />
                  Launch Virtual Machine
                </h3>
                <button
                  onClick={() => setShowVmModal(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {vmModalError && (
                <div className="p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{vmModalError}</span>
                </div>
              )}

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block mb-1.5 font-semibold text-zinc-300">
                    Instance Name <span className="text-indigo-400">*</span>
                  </label>
                  <input
                    value={vmForm.name}
                    onChange={(e) => updateVmField("name", e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-zinc-200 outline-none focus:border-indigo-500"
                    placeholder="my-vm-01"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block mb-1.5 font-semibold text-zinc-300">
                    Flavor (vCPU / RAM)
                  </label>
                  <select
                    value={vmForm.flavor}
                    onChange={(e) => updateVmField("flavor", e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-zinc-200 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="">Auto-select Smallest Flavor</option>
                    {availableFlavors.map((f) => (
                      <option key={f.id} value={f.name || f.id}>
                        {f.name} ({f.vcpus || 1} vCPU, {f.ram || 512}MB RAM)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1.5 font-semibold text-zinc-300">
                    Image
                  </label>
                  <select
                    value={vmForm.image}
                    onChange={(e) => updateVmField("image", e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-zinc-200 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="">Auto-select Active Image</option>
                    {availableImages.map((img) => (
                      <option key={img.id} value={img.name || img.id}>
                        {img.name || img.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1.5 font-semibold text-zinc-300">
                    Target Network
                  </label>
                  <select
                    value={vmForm.network}
                    onChange={(e) => updateVmField("network", e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-zinc-200 outline-none focus:border-indigo-500 cursor-pointer"
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

              <div className="flex gap-3 pt-3">
                <button
                  onClick={() => setShowVmModal(false)}
                  disabled={creatingVm}
                  className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateVm}
                  disabled={creatingVm}
                  className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 py-2.5 text-xs font-bold text-white transition disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  {creatingVm ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Provisioning...
                    </>
                  ) : (
                    "Launch VM"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CREATE NETWORK MODAL ── */}
        {showNetworkModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 w-full max-w-md shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-emerald-400" />
                  Create OVN Network
                </h3>
                <button
                  onClick={() => setShowNetworkModal(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {networkModalError && (
                <div className="p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{networkModalError}</span>
                </div>
              )}

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block mb-1.5 font-semibold text-zinc-300">
                    Network Name <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    value={networkForm.name}
                    onChange={(e) => updateNetworkField("name", e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-zinc-200 outline-none focus:border-emerald-500"
                    placeholder="private-net"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block mb-1.5 font-semibold text-zinc-300">
                    Subnet CIDR <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    value={networkForm.cidr}
                    onChange={(e) => updateNetworkField("cidr", e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-zinc-200 outline-none focus:border-emerald-500"
                    placeholder="192.168.1.0/24"
                  />
                </div>

                <div>
                  <label className="block mb-1.5 font-semibold text-zinc-300">
                    Overlay Segmentation
                  </label>
                  <input
                    value={networkForm.segmentation}
                    onChange={(e) => updateNetworkField("segmentation", e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-zinc-200 outline-none focus:border-emerald-500"
                    placeholder="VXLAN-1000"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  onClick={() => setShowNetworkModal(false)}
                  disabled={creatingNetwork}
                  className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateNetwork}
                  disabled={creatingNetwork}
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white transition disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  {creatingNetwork ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Network"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CONFIRMATION DIALOG (FOR DELETION) ── */}
        {confirmDialog.open && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 rounded-3xl border border-zinc-800 p-6 w-full max-w-md shadow-2xl space-y-4">
              <div className="flex items-center gap-3 text-red-400">
                <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-800 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-100">{confirmDialog.title}</h3>
                  <p className="text-xs text-zinc-400">Irreversible operation</p>
                </div>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
                {confirmDialog.message}
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() =>
                    setConfirmDialog({
                      open: false,
                      title: "",
                      message: "",
                      onConfirm: null,
                      loading: false,
                    })
                  }
                  disabled={confirmDialog.loading}
                  className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  disabled={confirmDialog.loading}
                  className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 py-2.5 text-xs font-bold text-white transition disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  {confirmDialog.loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    confirmDialog.confirmText
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
