import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prevent server process from crashing on unhandled promise rejections / network errors
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection in ONOS server:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception in ONOS server:", err?.message || err);
});

const app = express();
const port = process.env.ONOS_SERVER_PORT || 5001;

// ONOS Controller Configuration
const ONOS_URL = process.env.ONOS_URL || "http://localhost:8181";
const ONOS_USERNAME = process.env.ONOS_USERNAME || "onos";
const ONOS_PASSWORD = process.env.ONOS_PASSWORD || "rocks";
const ONOS_AUTH = "Basic " + Buffer.from(`${ONOS_USERNAME}:${ONOS_PASSWORD}`).toString("base64");

app.use(
  cors({
    origin: true,
    methods: "GET,POST,PUT,DELETE,OPTIONS",
    allowedHeaders: "Content-Type, Authorization",
  }),
);

app.use(express.json());

// Helper: ONOS REST Fetch
const onosFetch = async (apiPath, options = {}) => {
  const headers = {
    Authorization: ONOS_AUTH,
    Accept: "application/json",
    ...(options.headers || {}),
  };
  const resp = await fetch(`${ONOS_URL}${apiPath}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ONOS request ${apiPath} failed (${resp.status}): ${text}`);
  }
  return resp.json();
};

/* ==============================================================================
   DIAGNOSTIC: PING ENDPOINT
   ============================================================================== */
app.get(["/api/onos/ping", "/api/ping"], async (req, res) => {
  try {
    const data = await onosFetch("/onos/v1/info");
    res.json({
      ok: true,
      onosUrl: ONOS_URL,
      version: data?.version || "ONOS REST v1",
      name: data?.name || "ONOS",
      status: "CONNECTED",
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      onosUrl: ONOS_URL,
      error: err.message,
      status: "DISCONNECTED",
      hint: "Ensure ONOS is running at http://localhost:8181 and credentials are onos:rocks",
    });
  }
});

/* ==============================================================================
   SUMMARY ENDPOINT: DISCOVERED MININET TOPOLOGY, HOSTS, DEVICES, FLOWS, QoS
   ============================================================================== */
app.get(["/api/onos/summary", "/api/onos/cloud-summary"], async (req, res) => {
  try {
    const [hostsRes, devicesRes, linksRes, flowsRes, metersRes, clusterRes] =
      await Promise.allSettled([
        onosFetch("/onos/v1/hosts"),
        onosFetch("/onos/v1/devices"),
        onosFetch("/onos/v1/links"),
        onosFetch("/onos/v1/flows"),
        onosFetch("/onos/v1/meters"),
        onosFetch("/onos/v1/cluster/nodes"),
      ]);

    const rawHosts = hostsRes.status === "fulfilled" ? hostsRes.value?.hosts || [] : [];
    const rawDevices = devicesRes.status === "fulfilled" ? devicesRes.value?.devices || [] : [];
    const rawLinks = linksRes.status === "fulfilled" ? linksRes.value?.links || [] : [];
    const rawFlows = flowsRes.status === "fulfilled" ? flowsRes.value?.flows || [] : [];
    const rawMeters = metersRes.status === "fulfilled" ? metersRes.value?.meters || [] : [];
    const clusterNodes = clusterRes.status === "fulfilled" ? clusterRes.value?.nodes || [] : [];

    const hosts = rawHosts.map((h) => {
      const loc = h.locations?.[0] || {};
      return {
        id: h.id,
        name: h.id,
        mac: h.mac,
        ip: h.ipAddresses?.[0] || "N/A",
        ipAddresses: h.ipAddresses || [],
        status: h.suspended ? "SUSPENDED" : "ACTIVE",
        network: h.vlan && h.vlan !== "None" ? `VLAN-${h.vlan}` : "Default",
        zone: loc.elementId || loc.deviceId || "Mininet",
        logicalPort: loc.port || null,
        logicalSwitch: loc.elementId || loc.deviceId || null,
        configured: h.configured,
      };
    });

    const devices = rawDevices.map((d) => ({
      id: d.id,
      name: d.annotations?.datapathDescription || d.id,
      type: d.type || "SWITCH",
      available: d.available,
      role: d.role || "MASTER",
      hw: d.hw,
      sw: d.sw,
      serial: d.serial,
      chassisId: d.chassisId,
      status: d.available ? "ACTIVE" : "INACTIVE",
    }));

    const stats = [
      { title: "Discovered Hosts", value: hosts.length, icon: "🖥️" },
      { title: "OpenFlow Switches", value: devices.length, icon: "🌐" },
      { title: "Active Links", value: rawLinks.length, icon: "🔗" },
      { title: "Flow Rules", value: rawFlows.length, icon: "⚡" },
      { title: "Active Meters", value: rawMeters.length, icon: "📊" },
    ];

    const isConnected = hostsRes.status === "fulfilled" || devicesRes.status === "fulfilled";

    const infrastructureStatus = {
      onosCore: {
        status: isConnected ? "Healthy" : "Unreachable",
        health: isConnected ? 98 : 0,
        nodes: clusterNodes.length || 1,
      },
      openflowApp: {
        status: isConnected ? "Active" : "Down",
        health: isConnected ? 95 : 0,
      },
      restApi: {
        status: isConnected ? "Connected" : "Failed",
        health: isConnected ? 100 : 0,
      },
      connectedDevices: {
        status: `${devices.filter((d) => d.available).length} Online`,
        health: devices.length > 0 ? 92 : 40,
      },
    };

    const qosPolicy = {
      enabled: true,
      highPriorityQueue: {
        queueId: 0,
        dscp: 46,
        description: "URLLC / Expedited Forwarding",
        guaranteedRate: "60 Mbps",
        priority: 1,
      },
      standardQueue: {
        queueId: 1,
        dscp: "Unmarked",
        description: "Standard / Best Effort",
        guaranteedRate: "15 Mbps",
        priority: 2,
      },
      totalLinkCeiling: "80 Mbps",
    };

    res.json({
      success: true,
      stats,
      hosts,
      devices,
      links: rawLinks,
      flows: rawFlows,
      meters: rawMeters,
      infrastructureStatus,
      qosPolicy,
    });
  } catch (err) {
    console.error("ONOS summary error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch ONOS summary" });
  }
});

/* ==============================================================================
   DIRECT ONOS INVENTORY PROXIES
   ============================================================================== */
app.get("/api/onos/devices", async (req, res) => {
  try {
    const data = await onosFetch("/onos/v1/devices");
    res.json(data?.devices || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/onos/hosts", async (req, res) => {
  try {
    const data = await onosFetch("/onos/v1/hosts");
    res.json(data?.hosts || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/onos/flows", async (req, res) => {
  try {
    const data = await onosFetch("/onos/v1/flows");
    res.json(data?.flows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/onos/meters", async (req, res) => {
  try {
    const data = await onosFetch("/onos/v1/meters");
    res.json(data?.meters || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==============================================================================
   MININET OVS HTB QoS QUEUE MANAGEMENT
   ============================================================================== */
app.post("/api/onos/qos/setup", (req, res) => {
  const { ports = [] } = req.body;
  const scriptPath = path.join(__dirname, "scripts", "setup_mininet_qos.sh");
  const args = ports.length > 0 ? ports : ["--auto"];

  execFile("sudo", [scriptPath, ...args], { timeout: 10000 }, (err, stdout, stderr) => {
    if (err) {
      console.error("[QoS] Setup failed:", stderr || err.message);
      return res.status(500).json({
        success: false,
        error: stderr || err.message,
        hint: "Ensure script has sudo permission and Open vSwitch is running",
      });
    }
    res.json({
      success: true,
      output: stdout,
      message: "OVS HTB queues (60M / 15M / 80M) configured successfully.",
    });
  });
});

app.get("/api/onos/qos/status", (req, res) => {
  execFile("ovs-vsctl", ["list", "qos"], { timeout: 5000 }, (err, stdout) => {
    if (err) {
      return res.json({
        configured: false,
        summary: "No OVS QoS records detected or ovs-vsctl not accessible.",
      });
    }
    res.json({
      configured: stdout.trim().length > 0,
      details: stdout,
    });
  });
});

/* ==============================================================================
   START SERVER
   ============================================================================== */
app.listen(port, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Dedicated ONOS & Mininet Backend listening on :${port}`);
  console.log(`📡 ONOS Target Controller: ${ONOS_URL}`);
  console.log(`⚡ Low-Latency QoS: Queue 0 (60 Mbps) + Queue 1 (15 Mbps)`);
  console.log(`======================================================\n`);
});
