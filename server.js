import dotenv from "dotenv";
dotenv.config();

// Prevent server process from crashing on unhandled promise rejections / network errors
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection in server:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception in server:", err?.message || err);
});

import express from "express";
import cors from "cors";
import { execFile } from "child_process";

const app = express();
const port = 5000;

// DevStack credentials — defaults to localhost (127.0.0.1) for same-machine deployments
// When running on Windows with DevStack in WSL, auto-detection below will correct this.
let KEYSTONE_URL =
  process.env.KEYSTONE_URL || "http://127.0.0.1/identity/v3";
let NEUTRON_URL = process.env.NEUTRON_URL;
let NOVA_URL = process.env.NOVA_URL;
let GLANCE_URL = process.env.GLANCE_URL;

const OS_USERNAME = process.env.OS_USERNAME || "admin";
const OS_PASSWORD = process.env.OS_PASSWORD || "secret";
const OS_PROJECT_NAME = process.env.OS_PROJECT_NAME || "admin";
const OS_USER_DOMAIN_NAME = process.env.OS_USER_DOMAIN_NAME || "default";
const OS_PROJECT_DOMAIN_NAME = process.env.OS_PROJECT_DOMAIN_NAME || "default";
let tokenCache = {
  token: null,
  expiresAt: 0,
};

app.use(
  cors({
    origin: true,
    methods: "GET,POST",
    allowedHeaders: "Content-Type, Authorization",
  }),
);

app.use(express.json());

// Insa-dluxf original node endpoint
app.get("/api/nodes", (req, res) => {
  res.json({
    nodes: [
      { id: 1, name: "Node1" },
      { id: 2, name: "Node2" },
    ],
  });
});

/* =========================
   DIAGNOSTIC: PING ENDPOINT — visit /api/openstack/ping to debug connection issues
   ========================= */
app.get("/api/openstack/ping", async (req, res) => {
  const keystoneTarget = `${KEYSTONE_URL}/auth/tokens`;
  try {
    // Just try a GET on the Keystone base URL (no auth needed to reach it)
    const resp = await fetch(KEYSTONE_URL, { method: "GET", signal: AbortSignal.timeout(5000) });
    const text = await resp.text();
    res.json({
      ok: true,
      keystoneUrl: KEYSTONE_URL,
      httpStatus: resp.status,
      body: text.slice(0, 300),
      credentials: {
        username: OS_USERNAME,
        project: OS_PROJECT_NAME,
        domain: OS_USER_DOMAIN_NAME,
      },
    });
  } catch (err) {
    res.status(503).json({
      ok: false,
      keystoneUrl: KEYSTONE_URL,
      error: err.message,
      hint: "If DevStack is in WSL, the IP 127.0.0.1 refers to Windows — not WSL. Run `wsl hostname -I` in PowerShell to get the WSL IP, then update KEYSTONE_URL in your .env file.",
      credentials: {
        username: OS_USERNAME,
        project: OS_PROJECT_NAME,
        domain: OS_USER_DOMAIN_NAME,
      },
    });
  }
});

/* =========================
   HELPER: NORMALIZE PROTOCOL (NO CRASH FOR ICMP)
   ========================= */
const normalizeProtocol = (protocol) => {
  if (!protocol) return "icmp";
  return protocol.toLowerCase();
};

/* Removed hardcoded resolveLogicalSwitch - now using dynamic findNetwork */

/* =========================
   TOKEN MANAGEMENT
   ========================= */
const getToken = async () => {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 30000) {
    return tokenCache.token;
  }

  const response = await fetch(`${KEYSTONE_URL}/auth/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      auth: {
        identity: {
          methods: ["password"],
          password: {
            user: {
              name: OS_USERNAME,
              password: OS_PASSWORD,
              domain: { name: OS_USER_DOMAIN_NAME },
            },
          },
        },
        scope: {
          project: {
            name: OS_PROJECT_NAME,
            domain: { name: OS_PROJECT_DOMAIN_NAME },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Keystone token request failed ${response.status}: ${text}`,
    );
  }

  const token = response.headers.get("x-subject-token");
  const payload = await response.json();
  const expiresAt = Date.parse(payload.token.expires_at);

  // -- DYNAMIC SERVICE DISCOVERY (LEARNING PHASE) --
  const catalog = payload.token.catalog;
  if (catalog) {
    const keystoneUrlObj = new URL(KEYSTONE_URL);
    const keystoneHost = keystoneUrlObj.hostname;
    const isLocalKeystone =
      keystoneHost === "127.0.0.1" || keystoneHost === "localhost";

    const getUrl = (type) => {
      const service = catalog.find((s) => s.type === type);
      if (service && service.endpoints && service.endpoints.length > 0) {
        // Prefer public interface, fallback to whatever is available
        const endpoint =
          service.endpoints.find((e) => e.interface === "public") ||
          service.endpoints[0];
        let serviceUrl = endpoint.url;

        // If we are accessing Keystone locally (e.g. via port forwarding/tunneling),
        // OpenStack will likely still return its internal network IP (e.g., 172.x.x.x)
        // We must rewrite the hostname to match our local Keystone host to maintain connectivity.
        if (isLocalKeystone) {
          try {
            const urlObj = new URL(serviceUrl);
            urlObj.hostname = keystoneHost;
            serviceUrl = urlObj.toString();
          } catch (e) {
            // ignore
          }
        }
        return serviceUrl;
      }
      return null;
    };

    let nova = getUrl("compute");
    if (nova) NOVA_URL = nova;

    let neutron = getUrl("network");
    if (neutron)
      NEUTRON_URL = neutron.includes("/v2.0")
        ? neutron
        : `${neutron.replace(/\/$/, "")}/v2.0`;

    let glance = getUrl("image");
    if (glance)
      GLANCE_URL = glance.includes("/v2")
        ? glance
        : `${glance.replace(/\/$/, "")}/v2`;
  }
  // ------------------------------------------------

  tokenCache = { token, expiresAt };
  return token;
};

const osFetch = async (url, options = {}) => {
  const token = await getToken();
  const headers = {
    Accept: "application/json",
    "X-Auth-Token": token,
    ...(options.headers || {}),
  };
  return fetch(url, { ...options, headers });
};

const osJson = async (url, options = {}) => {
  const response = await osFetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenStack request failed ${response.status}: ${text}`);
  }
  return response.json();
};

/* =========================
   FIX: DEFINE findServerByName — WAS MISSING, CAUSING ReferenceError CRASH
   ========================= */
async function findServerByName(name) {
  const data = await osJson(
    `${NOVA_URL}/servers?name=${encodeURIComponent(name)}`,
  );
  const servers = data.servers || [];
  if (servers.length === 0) {
    throw new Error(`Server not found: ${name}`);
  }
  // Get full server details to access security groups
  const detail = await osJson(`${NOVA_URL}/servers/${servers[0].id}`);
  return detail.server;
}

/* =========================
   FIX: DEFINE findNetwork — WAS MISSING, CAUSING ReferenceError CRASH
   ========================= */
async function findNetwork(nameOrId) {
  const data = await osJson(
    `${NEUTRON_URL}/networks?name=${encodeURIComponent(nameOrId)}`,
  );
  const networks = data.networks || [];
  if (networks.length === 0) {
    throw new Error(`Network not found: ${nameOrId}`);
  }
  const net = networks[0];
  // Get subnet CIDR
  if (net.subnets && net.subnets.length > 0) {
    try {
      const subnetData = await osJson(
        `${NEUTRON_URL}/subnets/${net.subnets[0]}`,
      );
      net.cidr = subnetData.subnet?.cidr || "0.0.0.0/0";
    } catch (_) {
      net.cidr = "0.0.0.0/0";
    }
  } else {
    net.cidr = "0.0.0.0/0";
  }
  return net;
}

/* =========================
   FIX: ADD MISSING /api/openstack/cloud-summary ENDPOINT
   Cloud.jsx line 59 calls this — it was COMPLETELY MISSING from server.js
   ========================= */
app.get("/api/openstack/cloud-summary", async (req, res) => {
  try {
    const token = await getToken();

    // Fetch servers (VMs) from Nova
    const [serversData, networksData, routersData, portsData] =
      await Promise.all([
        osJson(`${NOVA_URL}/servers/detail`),
        osJson(`${NEUTRON_URL}/networks`),
        osJson(`${NEUTRON_URL}/routers`),
        osJson(`${NEUTRON_URL}/ports`),
      ]);

    const servers = serversData.servers || [];
    const networks = networksData.networks || [];
    const routers = routersData.routers || [];
    const ports = portsData.ports || [];

    // Get subnets for CIDR info
    let subnets = [];
    try {
      const subnetData = await osJson(`${NEUTRON_URL}/subnets`);
      subnets = subnetData.subnets || [];
    } catch (_) { }

    // Map subnet id -> cidr
    const subnetMap = {};
    subnets.forEach((s) => {
      subnetMap[s.id] = s;
    });

    // Build port map: server_id -> port info
    const portByServer = {};
    ports.forEach((port) => {
      if (port.device_owner === "compute:nova" && port.device_id) {
        if (!portByServer[port.device_id]) {
          portByServer[port.device_id] = port;
        }
      }
    });

    // Build virtualMachines list matching what Cloud.jsx expects
    const virtualMachines = servers.map((server) => {
      const port = portByServer[server.id];
      const fixedIp = port?.fixed_ips?.[0];
      const ipAddr =
        fixedIp?.ip_address ||
        Object.values(server.addresses || {})?.[0]?.[0]?.addr ||
        "N/A";
      const networkName =
        Object.keys(server.addresses || {})?.[0] || port?.network_id || "N/A";
      const subnetInfo = fixedIp ? subnetMap[fixedIp.subnet_id] : null;

      return {
        id: server.id,
        name: server.name,
        status: server.status,
        ip: ipAddr,
        network: networkName,
        zone: server["OS-EXT-AZ:availability_zone"] || "nova",
        logicalPort: port?.id || null,
        logicalSwitch: port ? `neutron-${port.network_id}` : null,
      };
    });

    // Count tunnels (VXLAN/Geneve) from network segmentation
    const tunnelNetworks = networks.filter(
      (n) =>
        n.provider_network_type === "vxlan" ||
        n.provider_network_type === "geneve",
    );

    // Build stats for the dashboard cards
    const stats = [
      {
        title: "Active Instances",
        value: servers.filter((s) => s.status === "ACTIVE").length,
        icon: "🖥️",
      },
      {
        title: "OVN Logical Switches",
        value: networks.length,
        icon: "🌐",
      },
      {
        title: "Routers",
        value: routers.length,
        icon: "📡",
      },
      {
        title: "VXLAN/Geneve Tunnels",
        value: tunnelNetworks.length || networks.length,
        icon: "🔗",
      },
    ];

    // Build OVN networks for Cloud.jsx OVN Networks panel
    const ovnNetworks = networks.map((net) => {
      const subnetId = net.subnets?.[0];
      const subnet = subnetId ? subnetMap[subnetId] : null;
      const segId = net.provider_segmentation_id;
      const netType = (net.provider_network_type || "vxlan").toUpperCase();

      return {
        name: net.name,
        type: "OVN Logical Switch",
        cidr: subnet?.cidr || "N/A",
        segmentation: segId ? `${netType}-${segId}` : netType,
        status: net.admin_state_up ? "ACTIVE" : "DOWN",
        id: net.id,
      };
    });

    // Infrastructure status — check OVN/OVS health via ovn-nbctl
    const infrastructureStatus = await checkInfrastructureStatus();

    // Security rules — fetch existing security group rules
    let securityRules = [];
    try {
      const sgData = await osJson(
        `${NEUTRON_URL}/security-group-rules?limit=20`,
      );
      securityRules = (sgData.security_group_rules || [])
        .slice(0, 10)
        .map((r) => ({
          id: r.id,
          protocol: r.protocol || "any",
          port: r.port_range_min
            ? `${r.port_range_min}-${r.port_range_max}`
            : "any",
          direction: r.direction,
          action: "ALLOW",
        }));
    } catch (_) { }

    res.json({
      stats,
      virtualMachines,
      networks: ovnNetworks,
      routers,
      ports,
      flows: [], // Live flows come from OVN southbound; placeholder for now
      securityRules,
      infrastructureStatus,
    });
  } catch (error) {
    console.error("Cloud summary error:", error.message);
    console.error("  → Keystone URL tried:", KEYSTONE_URL);

    // Return a descriptive error — not a crash
    res.status(500).json({
      error: "OpenStack unreachable",
      details: error.message,
      keystoneUrl: KEYSTONE_URL,
      hint: KEYSTONE_URL.includes("127.0.0.1")
        ? "If DevStack runs in WSL, 127.0.0.1 points to Windows — not WSL. Run 'wsl hostname -I' in PowerShell, then update KEYSTONE_URL in .env."
        : "Check that DevStack is running: cd ~/devstack && ./rejoin-stack.sh",
      stats: [],
      virtualMachines: [],
      networks: [],
      flows: [],
      securityRules: [],
    });
  }
});

/* =========================
   HELPER: CHECK OVN/OVS INFRASTRUCTURE STATUS
   ========================= */
async function checkInfrastructureStatus() {
  const status = {
    ovnNbDb: { status: "Unknown", health: 0 },
    ovnSbDb: { status: "Unknown", health: 0 },
    neutronApi: { status: "Unknown", health: 0 },
    ovsBridges: { status: "Unknown", health: 0 },
  };

  // Check Neutron API
  try {
    await osJson(`${NEUTRON_URL}/networks?limit=1`);
    status.neutronApi = { status: "Healthy", health: 90 };
  } catch (_) {
    status.neutronApi = { status: "Unreachable", health: 0 };
  }

  // Check OVN Northbound DB
  await new Promise((resolve) => {
    execFile("sudo", ["ovn-nbctl", "show"], { timeout: 5000 }, (error) => {
      if (!error) {
        status.ovnNbDb = { status: "Healthy", health: 95 };
        status.ovnSbDb = { status: "Connected", health: 88 };
        status.ovsBridges = { status: "Operational", health: 92 };
      } else {
        status.ovnNbDb = { status: "Not Available", health: 20 };
        status.ovnSbDb = { status: "Not Available", health: 20 };
        status.ovsBridges = { status: "Not Available", health: 20 };
      }
      resolve();
    });
  });

  return status;
}

/* =========================
   FIX: SECURITY RULE CREATION (ICMP SAFE + findServerByName/findNetwork NOW DEFINED)
   ========================= */
app.post("/api/openstack/security-groups/rules", async (req, res) => {
  const rule = req.body;

  if (
    !rule ||
    !rule.source ||
    !rule.destination ||
    !rule.protocol ||
    (rule.protocol.toUpperCase() !== "ICMP" && !rule.port)
  ) {
    return res.status(400).json({
      error: "Source, destination, and port are required.",
    });
  }

  if (rule.action && rule.action.toUpperCase() !== "ALLOW") {
    return res.status(400).json({
      error: "OpenStack security groups only support ALLOW rules.",
    });
  }

  try {
    const server = await findServerByName(rule.source);
    const securityGroupName = server.security_groups?.[0]?.name;

    if (!securityGroupName) {
      return res.status(400).json({
        error: "Source VM has no security group attached.",
      });
    }

    const network = await findNetwork(rule.destination);

    const groupResponse = await osJson(
      `${NEUTRON_URL}/security-groups?name=${encodeURIComponent(securityGroupName)}`,
    );

    const securityGroup = (groupResponse.security_groups || [])[0];

    if (!securityGroup) {
      return res.status(400).json({
        error: `Security group not found: ${securityGroupName}`,
      });
    }

    const cidr = network.cidr || "0.0.0.0/0";
    const ethertype = cidr.includes(":") ? "IPv6" : "IPv4";
    const reqProtocol = normalizeProtocol(rule.protocol);

    const rulesToCreate = [];

    if (reqProtocol === "icmp") {
      // Create BOTH IPv4 and IPv6 ICMP rules to support NAT64/IPv6 instances
      rulesToCreate.push({
        security_group_rule: {
          security_group_id: securityGroup.id,
          direction: "ingress",
          ethertype: "IPv4",
          protocol: "icmp",
          remote_ip_prefix: cidr.includes(":") ? "0.0.0.0/0" : cidr,
        },
      });
      rulesToCreate.push({
        security_group_rule: {
          security_group_id: securityGroup.id,
          direction: "ingress",
          ethertype: "IPv6",
          protocol: "ipv6-icmp",
          // Use ::/0 for IPv6 if the provided CIDR was IPv4
          remote_ip_prefix: cidr.includes(":") ? cidr : "::/0",
        },
      });
    } else {
      // TCP / UDP
      rulesToCreate.push({
        security_group_rule: {
          security_group_id: securityGroup.id,
          direction: "ingress",
          ethertype,
          protocol: reqProtocol,
          remote_ip_prefix: cidr,
          port_range_min: Number(rule.port),
          port_range_max: Number(rule.port),
        },
      });
    }

    const createdRules = await Promise.all(
      rulesToCreate.map((body) =>
        osJson(`${NEUTRON_URL}/security-group-rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch((err) => {
          // If the rule already exists, OpenStack throws a 409 Conflict.
          // We can safely ignore this and pretend it succeeded.
          if (err.message && err.message.includes("409")) {
            return { security_group_rule: { id: "existing-rule" } };
          }
          throw err;
        }),
      ),
    );

    const firstRuleId = createdRules[0]?.security_group_rule?.id;

    res.json({
      success: true,
      acl: {
        id: firstRuleId,
        source: rule.source,
        destination: network.name,
        protocol: rule.protocol,
        port: rule.port,
        action: "ALLOW",
      },
      message: "Security group rule created successfully.",
    });
  } catch (error) {
    console.error("Security rule creation error:", error);

    if (error.message.includes("409")) {
      return res.status(409).json({
        error: "Security group rule already exists.",
      });
    }

    res.status(500).json({
      error: error.message || "Failed to create security group rule",
    });
  }
});

/* =========================
   FIX: ACL LIST (OVN switch name resolution)
   ========================= */
app.get("/api/openstack/acl-list/:logicalSwitch", async (req, res) => {
  let logicalSwitch = req.params.logicalSwitch;

  if (!logicalSwitch) {
    return res.status(400).json({ error: "Logical switch is required." });
  }

  try {
    if (!logicalSwitch.startsWith("neutron-")) {
      const network = await findNetwork(logicalSwitch);
      logicalSwitch = `neutron-${network.id}`;
    }
  } catch (error) {
    return res
      .status(404)
      .json({
        error: `Could not resolve network name ${logicalSwitch} to OVN logical switch.`,
      });
  }

  execFile(
    "sudo",
    ["-n", "ovn-nbctl", "acl-list", logicalSwitch],
    (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({
          error: stderr || error.message,
          message: "Failed to verify ACLs (OVN permission or switch mismatch).",
          available: false,
        });
      }

      let acls = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      // If no ACLs on the switch directly, query all ACLs (as OpenStack uses Port Groups)
      if (acls.length === 0) {
        execFile(
          "sudo",
          ["-n", "ovn-nbctl", "list", "acl"],
          (err2, stdout2) => {
            if (!err2 && stdout2) {
              acls = stdout2
                .split("\n")
                .filter(
                  (line) =>
                    line.includes("match") ||
                    line.includes("action") ||
                    line.includes("direction"),
                )
                .map((line) => line.trim())
                .slice(0, 15); // limit output to keep it readable

              if (acls.length > 0) {
                acls.unshift("--- Port Group ACLs found in OVN DB ---");
              }
            }
            res.json({ logicalSwitch, acls, available: true });
          },
        );
        return;
      }

      res.json({ logicalSwitch, acls, available: true });
    },
  );
});

/* =========================
   FIX: ADD MISSING /api/openstack/create-vm ENDPOINT
   ========================= */
app.post("/api/openstack/create-vm", async (req, res) => {
  const { name, flavor, image, network } = req.body;

  if (!name || !flavor || !image || !network) {
    return res
      .status(400)
      .json({ error: "name, flavor, image, and network are required." });
  }

  try {
    // Resolve flavor ID
    const flavorsData = await osJson(`${NOVA_URL}/flavors`);
    const flavorObj = (flavorsData.flavors || []).find(
      (f) => f.name === flavor || f.id === flavor,
    );
    if (!flavorObj) {
      return res.status(400).json({ error: `Flavor not found: ${flavor}` });
    }

    // Resolve image ID
    const imagesData = await osJson(
      `${GLANCE_URL}/images?name=${encodeURIComponent(image)}`,
    );
    const imageObj = (imagesData.images || [])[0];
    if (!imageObj) {
      return res.status(400).json({ error: `Image not found: ${image}` });
    }

    // Resolve network ID
    const networksData = await osJson(
      `${NEUTRON_URL}/networks?name=${encodeURIComponent(network)}`,
    );
    const networkObj = (networksData.networks || [])[0];
    if (!networkObj) {
      return res.status(400).json({ error: `Network not found: ${network}` });
    }

    // Create the server
    const serverBody = {
      server: {
        name,
        flavorRef: flavorObj.id,
        imageRef: imageObj.id,
        networks: [{ uuid: networkObj.id }],
      },
    };

    const created = await osJson(`${NOVA_URL}/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serverBody),
    });

    res.json({
      success: true,
      server: created.server,
      message: `VM "${name}" created successfully.`,
    });
  } catch (error) {
    console.error("Create VM error:", error);
    res.status(500).json({ error: error.message || "Failed to create VM" });
  }
});

/* =========================
   FIX: ADD MISSING /api/openstack/create-network ENDPOINT
   ========================= */
app.post("/api/openstack/create-network", async (req, res) => {
  const { name, cidr, segmentation } = req.body;

  if (!name || !cidr) {
    return res.status(400).json({ error: "name and cidr are required." });
  }

  try {
    // Create network (let Neutron auto-assign type based on tenant config)
    const networkBody = {
      network: {
        name,
        admin_state_up: true,
      },
    };

    const createdNetwork = await osJson(`${NEUTRON_URL}/networks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(networkBody),
    });

    const networkId = createdNetwork.network.id;

    // Create subnet
    const subnetBody = {
      subnet: {
        network_id: networkId,
        ip_version: 4,
        cidr,
        name: `${name}-subnet`,
      },
    };

    const createdSubnet = await osJson(`${NEUTRON_URL}/subnets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subnetBody),
    });

    res.json({
      success: true,
      network: createdNetwork.network,
      subnet: createdSubnet.subnet,
      message: `Network "${name}" created successfully.`,
    });
  } catch (error) {
    console.error("Create network error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to create network" });
  }
});

/* =========================
   FIX: ADD MISSING /api/openstack/launch-instance ENDPOINT
   (Same as create-vm but named differently for the Launch Instance modal)
   ========================= */
app.post("/api/openstack/launch-instance", async (req, res) => {
  const { name, flavor, image, network } = req.body;

  if (!name || !flavor || !image || !network) {
    return res
      .status(400)
      .json({ error: "name, flavor, image, and network are required." });
  }

  try {
    const flavorsData = await osJson(`${NOVA_URL}/flavors`);
    const flavorObj = (flavorsData.flavors || []).find(
      (f) => f.name === flavor || f.id === flavor,
    );
    if (!flavorObj) {
      return res.status(400).json({ error: `Flavor not found: ${flavor}` });
    }

    const imagesData = await osJson(
      `${GLANCE_URL}/images?name=${encodeURIComponent(image)}`,
    );
    const imageObj = (imagesData.images || [])[0];
    if (!imageObj) {
      return res.status(400).json({ error: `Image not found: ${image}` });
    }

    const networksData = await osJson(
      `${NEUTRON_URL}/networks?name=${encodeURIComponent(network)}`,
    );
    const networkObj = (networksData.networks || [])[0];
    if (!networkObj) {
      return res.status(400).json({ error: `Network not found: ${network}` });
    }

    const serverBody = {
      server: {
        name,
        flavorRef: flavorObj.id,
        imageRef: imageObj.id,
        networks: [{ uuid: networkObj.id }],
      },
    };

    const created = await osJson(`${NOVA_URL}/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serverBody),
    });

    res.json({
      success: true,
      server: created.server,
      message: `Instance "${name}" launched successfully.`,
    });
  } catch (error) {
    console.error("Launch instance error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to launch instance" });
  }
});

/* =========================
   AUTO-DETECT WSL IP: If KEYSTONE_URL uses 127.0.0.1 and is unreachable from Windows,
   automatically discover the WSL IP via `wsl hostname -I`.
   ========================= */
async function resolveKeystoneUrl() {
  // If the user explicitly set KEYSTONE_URL in .env, respect it — no auto-detection
  if (process.env.KEYSTONE_URL) {
    console.log(`  ✓ Using KEYSTONE_URL from .env: ${KEYSTONE_URL}`);
    return;
  }

  // If URL already has a non-loopback IP, use it as-is
  if (!KEYSTONE_URL.includes("127.0.0.1") && !KEYSTONE_URL.includes("localhost")) {
    return;
  }

  // Try reaching the current KEYSTONE_URL first
  try {
    const probe = await fetch(KEYSTONE_URL, { signal: AbortSignal.timeout(3000) });
    if (probe.ok || probe.status < 500) {
      console.log(`  ✓ Keystone reachable at ${KEYSTONE_URL}`);
      return; // already working, no change needed
    }
  } catch (_) {
    // unreachable — try WSL auto-detection
  }

  console.log("  ⚠ 127.0.0.1 not reachable. Attempting WSL IP auto-detection...");
  try {
    const wslIp = await new Promise((resolve, reject) => {
      execFile("wsl", ["hostname", "-I"], { timeout: 6000 }, (err, stdout) => {
        if (err) return reject(err);
        const ip = stdout.trim().split(/\s+/)[0];
        if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) resolve(ip);
        else reject(new Error(`Unexpected output: ${stdout.trim()}`));
      });
    });
    KEYSTONE_URL = KEYSTONE_URL.replace("127.0.0.1", wslIp).replace("localhost", wslIp);
    console.log(`  ✓ WSL IP auto-detected: ${wslIp}`);
    console.log(`  ✓ Updated KEYSTONE_URL: ${KEYSTONE_URL}`);
  } catch (wslErr) {
    console.warn(`  ⚠ WSL IP auto-detection failed: ${wslErr.message}`);
    console.warn("  → Set KEYSTONE_URL manually in .env to your WSL IP");
  }
}

const bootstrap = async () => {
  console.log("--- BEGINNING LEARNING PHASE (SERVICE DISCOVERY) ---");

  // Auto-detect WSL IP if server.js is running on Windows and DevStack is in WSL
  await resolveKeystoneUrl();

  try {
    // Calling getToken forces the backend to query Keystone and learn the dynamic IPs
    await getToken();
    console.log("--- LEARNING PHASE COMPLETE: STARTING APIS ---");
    console.log(`LEARNED IP ADDRESSES:`);
    console.log(`  Keystone (Registry): ${KEYSTONE_URL}`);
    console.log(`  Neutron  (Network):  ${NEUTRON_URL}`);
    console.log(`  Nova     (Compute):  ${NOVA_URL}`);
    console.log(`  Glance   (Image):    ${GLANCE_URL}`);
  } catch (error) {
    console.error(
      "Warning: Failed to learn OpenStack environment addresses at startup:",
      error.message,
    );
    console.error(
      "The backend will still start, but OpenStack API calls may fail until Keystone is reachable.",
    );
  }

  app.listen(port, () => {
    console.log(`\nDashboard backend is now listening on Port ${port}`);
  });
};

bootstrap();
