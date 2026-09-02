/**
 * Network Slicing Service — Host-Based Slicing with End-to-End Multi-Switch Routing
 *
 * A network slice is a group of hosts that form an isolated virtual network.
 * Hosts within the same slice can communicate seamlessly across any topology.
 * Hosts in different slices are strictly isolated.
 *
 * Implementation:
 *   - Each slice is assigned a unique VLAN ID and bandwidth limit.
 *   - Multi-switch path computation dynamically installs OpenFlow rules (Priority 40000)
 *     across ingress, spine, and egress switches between all slice peers.
 *   - Slice-aware ARP broadcast routing ensures instant peer discovery only within the slice.
 *   - Priority 39000 Drop Boundary ensures complete cross-slice isolation.
 *
 * Slice data is persisted in localStorage.
 */
import {
  getMeters,
  createMeter,
  deleteMeter,
  getDevices,
  getLinks,
  getHosts,
  installOnosFlow,
  deleteOnosFlow,
  getOnosFlows,
} from "./api-controller";

const STORAGE_KEY = "onos-network-slices";
const VLAN_COUNTER_KEY = "onos-slice-vlan-counter";

// ─── Predefined slice templates ──────────────────────────────────────────────
export const SLICE_TEMPLATES = [
  {
    id: "embb",
    name: "eMBB (Enhanced Mobile Broadband)",
    description: "High bandwidth for video, streaming, and downloads",
    bandwidth: 50000,
    burstSize: 10000,
    unit: "KB_PER_SEC",
    color: "#6366f1",
    type: "broadband",
  },
  {
    id: "urllc",
    name: "URLLC (Ultra-Reliable Low-Latency)",
    description: "Mission-critical low latency with DSCP 46 and Queue 0 priority scheduling (60 Mbps guaranteed)",
    bandwidth: 60000,
    burstSize: 10000,
    unit: "KB_PER_SEC",
    color: "#ef4444",
    type: "low-latency",
    dscp: 46,
    queueId: 0,
    guaranteedRate: "60 Mbps",
  },
  {
    id: "mmtc",
    name: "mMTC (Massive Machine-Type Comms)",
    description: "High-density IoT sensors and telemetry",
    bandwidth: 2000,
    burstSize: 500,
    unit: "KB_PER_SEC",
    color: "#22c55e",
    type: "iot",
  },
  {
    id: "best-effort",
    name: "Best Effort",
    description: "Default traffic with no guaranteed QoS",
    bandwidth: 1000,
    burstSize: 200,
    unit: "KB_PER_SEC",
    color: "#a1a1aa",
    type: "standard",
  },
];

// ─── Network Capacity & Admission Control ───────────────────────────────────
export const DEFAULT_TOTAL_CAPACITY_KBPS = 100000; // 100 MB/s (800 Mbps) default physical capacity

export function getNetworkCapacity() {
  const saved = localStorage.getItem("onos-slice-total-capacity");
  if (saved) {
    const parsed = Number(saved);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TOTAL_CAPACITY_KBPS;
}

export function setNetworkCapacity(kbps) {
  if (kbps && kbps > 0) {
    localStorage.setItem("onos-slice-total-capacity", String(kbps));
  }
}

// ─── VLAN ID management ──────────────────────────────────────────────────────

function getNextVlanId() {
  const slices = loadSlices();
  const usedVlans = new Set(slices.map((s) => s.vlanId).filter(Boolean));
  let candidate = parseInt(localStorage.getItem(VLAN_COUNTER_KEY) || "100", 10);
  while (usedVlans.has(candidate)) {
    candidate++;
  }
  localStorage.setItem(VLAN_COUNTER_KEY, String(candidate + 1));
  return candidate;
}

// ─── Local persistence ───────────────────────────────────────────────────────

export function loadSlices() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSlices(slices) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slices));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get all saved slices, enriched with live meter stats from ONOS.
 */
export async function getSlices() {
  const slices = loadSlices();

  const enriched = await Promise.all(
    slices.map(async (slice) => {
      try {
        const updatedHosts = await Promise.all(
          (slice.hosts || []).map(async (host) => {
            if (!host.deviceId || !host.meterId) return host;
            try {
              const meters = await getMeters(host.deviceId);
              const liveMeter = meters.find(
                (m) => String(m.id) === String(host.meterId)
              );
              return {
                ...host,
                meterStats: liveMeter
                  ? {
                      packets: liveMeter.packets || 0,
                      bytes: liveMeter.bytes || 0,
                      life: liveMeter.life || 0,
                      state: liveMeter.state || "UNKNOWN",
                    }
                  : null,
              };
            } catch {
              return host;
            }
          })
        );
        return { ...slice, hosts: updatedHosts, status: "ACTIVE" };
      } catch {
        return { ...slice, status: "ERROR" };
      }
    })
  );
  return enriched;
}

/**
 * Extract integer switch index/number from device description or ID.
 */
export function getSwitchNumber(d) {
  if (!d) return 999;
  const desc = (d.annotations?.datapathDescription || d.label || "").toLowerCase();
  const descMatch = desc.match(/s(\d+)/);
  if (descMatch) return parseInt(descMatch[1], 10);

  const parts = String(d.id || "").split(":");
  const last = parts[parts.length - 1];
  const num = parseInt(last, 16);
  if (!isNaN(num)) return num;

  const idMatch = String(d.id || "").match(/(\d+)/g);
  if (idMatch) return parseInt(idMatch[idMatch.length - 1], 10);
  return 999;
}

/**
 * Get network topology info (devices, links, hosts) from ONOS.
 */
export async function getTopologyInfo() {
  const [rawDevices, rawLinks, hosts] = await Promise.all([
    getDevices(true).catch(() => []),
    getLinks().catch(() => []),
    getHosts().catch(() => []),
  ]);

  const devices = (rawDevices || []).filter((d) => d.available === true || d.available === "true");

  // If no switches are active in the network (e.g. Mininet is closed), clear topology
  if (devices.length === 0) {
    return { devices: [], links: [], hosts: [] };
  }

  const activeDeviceIds = new Set(devices.map((d) => d.id));
  const links = (rawLinks || []).filter(
    (l) => activeDeviceIds.has(l.src?.device) && activeDeviceIds.has(l.dst?.device)
  );

  // Set of all inter-switch trunk ports (links between switches).
  // Hosts can NEVER be connected to trunk ports.
  const interSwitchPorts = new Set();
  for (const l of links) {
    if (l.src?.device && l.src?.port) interSwitchPorts.add(`${l.src.device}:${l.src.port}`);
    if (l.dst?.device && l.dst?.port) interSwitchPorts.add(`${l.dst.device}:${l.dst.port}`);
  }

  // Layered Host Aggregation: Live ONOS -> Saved Slices -> Complementary Leaf Endpoints
  const allHosts = [];
  const knownMacs = new Set();
  const knownIps = new Set();
  const knownLocations = new Set();

  // 1. Live ONOS Hosts attached to active switches (filtering out transit trunk ports)
  const liveHosts = (hosts || []).filter((h) => {
    const loc = getHostLocation(h, links);
    return loc && activeDeviceIds.has(loc.deviceId);
  });

  for (const h of liveHosts) {
    const mac = (h.mac || h.id || "").toLowerCase();
    const ip = ((h.ipAddresses || [])[0] || "").toLowerCase();
    const loc = getHostLocation(h, links);
    const locKey = loc ? `${loc.deviceId}:${loc.port}` : null;

    if (mac) knownMacs.add(mac);
    if (ip) knownIps.add(ip);
    if (locKey) knownLocations.add(locKey);

    allHosts.push({
      ...h,
      id: h.id || `${h.mac}/None`,
      mac: h.mac,
      ipAddresses: h.ipAddresses || [],
      locations: loc ? [{ elementId: loc.deviceId, port: loc.port }] : h.locations || [],
      location: loc ? { elementId: loc.deviceId, port: loc.port } : h.location,
      deviceId: loc?.deviceId,
      port: loc?.port,
    });
  }

  // 2. Add any hosts defined in saved slices (if not already captured from live ONOS)
  const slices = loadSlices();
  for (const s of slices) {
    for (const sh of s.hosts || []) {
      if (sh.deviceId && !activeDeviceIds.has(sh.deviceId)) continue;
      const mac = (sh.mac || "").toLowerCase();
      const ip = ((sh.ipAddresses || [])[0] || "").toLowerCase();
      const locKey = sh.deviceId && sh.port ? `${sh.deviceId}:${sh.port}` : null;
      const isKnown =
        (mac && knownMacs.has(mac)) ||
        (ip && knownIps.has(ip)) ||
        (locKey && knownLocations.has(locKey));

      if (!isKnown) {
        if (mac) knownMacs.add(mac);
        if (ip) knownIps.add(ip);
        if (locKey) knownLocations.add(locKey);

        allHosts.push({
          id: sh.hostId || `${sh.mac}/None`,
          mac: sh.mac,
          ipAddresses: sh.ipAddresses || [],
          locations: sh.deviceId ? [{ elementId: sh.deviceId, port: String(sh.port || "1") }] : [],
          location: sh.deviceId ? { elementId: sh.deviceId, port: String(sh.port || "1") } : null,
          deviceId: sh.deviceId,
          port: String(sh.port || "1"),
        });
      }
    }
  }

  // 3. Complement with leaf switch standard endpoints (e.g. s2: h1, h2; s3: h3, h4)
  if (devices.length > 0) {
    const leafSwitches = devices.filter((d) => {
      if (devices.length <= 1) return true;
      const desc = (d.annotations?.datapathDescription || "").toLowerCase();
      if (desc === "s1" || desc.includes("core") || desc.includes("spine")) return false;
      const num = getSwitchNumber(d);
      return num !== 1;
    });
    const targetSwitches = leafSwitches.length > 0 ? leafSwitches : devices;
    const sortedSwitches = [...targetSwitches].sort((a, b) => getSwitchNumber(a) - getSwitchNumber(b));

    sortedSwitches.forEach((sw, swIdx) => {
      for (let i = 1; i <= 2; i++) {
        const count = swIdx * 2 + i;
        const mac = `00:00:00:00:00:0${count}`;
        const ip = `10.0.0.${count}`;
        const locKey = `${sw.id}:${i}`;
        const isKnown =
          (mac && knownMacs.has(mac.toLowerCase())) ||
          (ip && knownIps.has(ip.toLowerCase())) ||
          knownLocations.has(locKey);

        if (!isKnown) {
          if (mac) knownMacs.add(mac.toLowerCase());
          if (ip) knownIps.add(ip.toLowerCase());
          knownLocations.add(locKey);

          allHosts.push({
            id: `host:h${count}`,
            mac,
            ipAddresses: [ip],
            locations: [{ elementId: sw.id, port: String(i) }],
            location: { elementId: sw.id, port: String(i) },
            deviceId: sw.id,
            port: String(i),
          });
        }
      }
    });
  }

  return { devices, links, hosts: allHosts };
}

/**
 * Find which device and port a host is connected to, filtering out inter-switch trunk ports.
 */
export function getHostLocation(host, links = []) {
  if (!host) return null;

  const interSwitchPorts = new Set();
  for (const l of links) {
    if (l.src?.device && l.src?.port) interSwitchPorts.add(`${l.src.device}:${l.src.port}`);
    if (l.dst?.device && l.dst?.port) interSwitchPorts.add(`${l.dst.device}:${l.dst.port}`);
  }

  // 1. Check locations array from ONOS (filtering out inter-switch trunk ports)
  if (host.locations && host.locations.length > 0) {
    const edgeLoc = host.locations.find(
      (loc) => loc?.elementId && loc?.port && !interSwitchPorts.has(`${loc.elementId}:${loc.port}`)
    );
    if (edgeLoc) {
      return {
        deviceId: edgeLoc.elementId,
        port: String(edgeLoc.port),
      };
    }
  }

  // 2. Check location object
  if (host.location?.elementId && host.location?.port) {
    const locKey = `${host.location.elementId}:${host.location.port}`;
    if (!interSwitchPorts.has(locKey)) {
      return {
        deviceId: host.location.elementId,
        port: String(host.location.port),
      };
    }
  }

  // 3. Check direct deviceId / port properties
  if (host.deviceId && host.port) {
    const locKey = `${host.deviceId}:${host.port}`;
    if (!interSwitchPorts.has(locKey)) {
      return {
        deviceId: host.deviceId,
        port: String(host.port),
      };
    }
  }

  // 4. Fallback: if deviceId is present
  if (host.deviceId) {
    return {
      deviceId: host.deviceId,
      port: String(host.port || "1"),
    };
  }

  if (host.locations && host.locations.length > 0) {
    return {
      deviceId: host.locations[0].elementId,
      port: String(host.locations[0].port || "1"),
    };
  }

  return null;
}

/**
 * Find shortest path between two devices in the ONOS network topology.
 * Returns array of hops: [{ deviceId, inPort, outPort }]
 */
export function findSwitchPath(srcDev, dstDev, links = [], srcHostPort, dstHostPort) {
  if (srcDev === dstDev) {
    return [
      {
        deviceId: srcDev,
        inPort: Number(srcHostPort),
        outPort: Number(dstHostPort),
      },
    ];
  }

  // Build adjacency graph: dev -> [{ nextDev, outPort, inPortNext }]
  const adj = {};
  for (const link of links) {
    const u = link.src?.device;
    const v = link.dst?.device;
    const pOut = link.src?.port;
    const pIn = link.dst?.port;
    if (!u || !v) continue;
    if (!adj[u]) adj[u] = [];
    adj[u].push({ nextDev: v, outPort: pOut, inPortNext: pIn });
  }

  // BFS
  const queue = [[{ dev: srcDev, inPort: srcHostPort, outPort: null }]];
  const visited = new Set([srcDev]);

  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];

    if (current.dev === dstDev) {
      current.outPort = dstHostPort;
      return path.map((h) => ({
        deviceId: h.dev,
        inPort: Number(h.inPort),
        outPort: Number(h.outPort),
      }));
    }

    const neighbors = adj[current.dev] || [];
    for (const n of neighbors) {
      if (!visited.has(n.nextDev)) {
        visited.add(n.nextDev);
        current.outPort = n.outPort;
        queue.push([
          ...path.slice(0, -1),
          { ...current },
          { dev: n.nextDev, inPort: n.inPortNext, outPort: null },
        ]);
      }
    }
  }

  return null;
}

/**
 * Create a new network slice.
 *
 * For each host in the slice:
 *   1. Optionally create a bandwidth meter on the host's switch.
 *   2. Install end-to-end multi-switch forwarding rules (Priority 40000) for unicast IP & ARP.
 *   3. Install slice-aware ARP broadcast routing between peers (Priority 40000).
 *   4. Install strict isolation drop rule on ingress switches (Priority 39000).
 */
export async function createSlice(sliceConfig) {
  const {
    name,
    description = "",
    bandwidth,
    burstSize = Math.round(bandwidth * 0.2),
    unit = "KB_PER_SEC",
    color = "#6366f1",
    selectedHosts = sliceConfig.selectedHosts || sliceConfig.hosts || [],
    vlanId: manualVlanId = null,
  } = sliceConfig;

  if (!name) throw new Error("Slice name is required");
  if (!bandwidth || bandwidth <= 0) throw new Error("Bandwidth must be > 0");
  if (selectedHosts.length === 0)
    throw new Error("At least one host must be assigned to the slice");

  // Admission Control: Check if requested bandwidth fits within remaining capacity pool
  const existingSlices = loadSlices();
  const currentAllocated = existingSlices.reduce((sum, s) => sum + (Number(s.bandwidth) || 0), 0);
  const totalCapacity = getNetworkCapacity();
  const requestedBandwidth = Number(bandwidth) || 0;

  if (currentAllocated + requestedBandwidth > totalCapacity) {
    const remaining = Math.max(0, totalCapacity - currentAllocated);
    const reqStr = requestedBandwidth >= 1000 ? `${(requestedBandwidth / 1000).toFixed(1)} MB/s` : `${requestedBandwidth} KB/s`;
    const remStr = remaining >= 1000 ? `${(remaining / 1000).toFixed(1)} MB/s` : `${remaining} KB/s`;
    const capStr = `${(totalCapacity / 1000).toFixed(0)} MB/s`;
    throw new Error(
      `Admission Control Rejected: Requested ${reqStr} exceeds remaining available capacity (${remStr} free of ${capStr} total pool).`
    );
  }

  const sliceId = `slice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const vlanId = manualVlanId || getNextVlanId();

  // Fetch current topology links for path calculation
  const topologyLinks = await getLinks().catch(() => []);

  // Track all installed flow rules across all switches for cleanup: [{ deviceId, flowId }]
  const installedFlows = [];
  const installedHosts = [];

  // Step 1: Create meters & drop boundary rules for each host
  for (const host of selectedHosts) {
    const mac = host.mac;
    const ips = host.ipAddresses || [];
    const location = getHostLocation(host, topologyLinks);

    if (!location) {
      console.warn(`[Slicing] Host ${mac} has no known location, skipping`);
      continue;
    }

    const { deviceId, port } = location;

    // Create meter on this host's switch
    let meterId = null;
    try {
      const meterBody = {
        deviceId,
        unit,
        bands: [{ type: "DROP", rate: bandwidth, burstSize }],
      };
      const meterRes = await createMeter(deviceId, meterBody);
      if (meterRes?.id) {
        meterId = meterRes.id;
      }
    } catch (err) {
      console.warn(`[Slicing] Meter creation optional on ${deviceId}:`, err.message);
    }

    // Verify meter exists on switch before attaching to flows
    if (meterId) {
      try {
        const switchMeters = await getMeters(deviceId);
        const exists = switchMeters.some((m) => String(m.id) === String(meterId));
        if (!exists) {
          console.warn(`[Slicing] Meter ${meterId} not active yet on ${deviceId}, omitting from flow`);
          meterId = null;
        }
      } catch {
        meterId = null;
      }
    }

    // Install strict Isolation Boundary (Priority 39000 Drop Rule) on ingress switch
    const dropFlow = {
      priority: 39000,
      timeout: 0,
      isPermanent: true,
      deviceId,
      tableId: 0,
      treatment: { instructions: [] },
      selector: {
        criteria: [
          { type: "IN_PORT", port: Number(port) },
          { type: "ETH_SRC", mac },
        ],
      },
    };

    let dropFlowId = null;
    try {
      const res = await installOnosFlow(deviceId, dropFlow);
      dropFlowId = res?.flowId || res?.id;
      if (dropFlowId) installedFlows.push({ deviceId, flowId: dropFlowId });
    } catch (err) {
      console.error(`[Slicing] Failed drop boundary on ${deviceId}:`, err);
    }

    installedHosts.push({
      mac,
      ipAddresses: ips,
      deviceId,
      port,
      meterId,
      dropFlowId,
      hostId: host.id || `${mac}/None`,
    });
  }

  // Step 2: Install end-to-end peer unicast forwarding flows between all pairs of hosts
  // And collect ARP broadcast rules grouped by (deviceId, inPort, sourceMac)
  const arpRuleMap = new Map();

  for (let i = 0; i < selectedHosts.length; i++) {
    const hostA = selectedHosts[i];
    const locA = getHostLocation(hostA, topologyLinks);
    if (!locA) continue;

    const hostAInstalled = installedHosts.find((h) => h.mac === hostA.mac);
    const meterIdA = hostAInstalled?.meterId;

    for (let j = 0; j < selectedHosts.length; j++) {
      if (i === j) continue;
      const hostB = selectedHosts[j];
      const locB = getHostLocation(hostB, topologyLinks);
      if (!locB) continue;

      // Find path from switch of Host A to switch of Host B
      const hops = findSwitchPath(locA.deviceId, locB.deviceId, topologyLinks, locA.port, locB.port);
      if (!hops || hops.length === 0) {
        console.warn(`[Slicing] No path between ${locA.deviceId} and ${locB.deviceId}`);
        continue;
      }

      // Install unicast forwarding flows along each hop
      const isLowLatency = sliceConfig.type === "low-latency" || sliceConfig.template === "urllc";

      for (let hopIdx = 0; hopIdx < hops.length; hopIdx++) {
        const hop = hops[hopIdx];
        const isIngress = hopIdx === 0;

        // 1. If low-latency / URLLC slice: Install Priority 41000 Flow matching DSCP 46 -> Queue 0 (60 Mbps guaranteed)
        if (isLowLatency) {
          const dscp46Flow = {
            priority: 41000,
            timeout: 0,
            isPermanent: true,
            deviceId: hop.deviceId,
            tableId: 0,
            treatment: {
              instructions: [
                { type: "QUEUE", queueId: 0 },
                { type: "OUTPUT", port: String(hop.outPort) },
              ],
            },
            selector: {
              criteria: [
                { type: "ETH_TYPE", ethType: 2048 },
                { type: "IP_DSCP", ipDscp: 46 },
                { type: "IN_PORT", port: Number(hop.inPort) },
                { type: "ETH_SRC", mac: hostA.mac },
                { type: "ETH_DST", mac: hostB.mac },
              ],
            },
          };

          try {
            const res = await installOnosFlow(hop.deviceId, dscp46Flow);
            const fid = res?.flowId || res?.id;
            if (fid) installedFlows.push({ deviceId: hop.deviceId, flowId: fid });
          } catch (err) {
            console.error(`[Slicing] Failed DSCP 46 priority queue flow on ${hop.deviceId}:`, err);
          }
        }

        // 2. Standard traffic flow (Priority 40000): Ingress meter + Queue 1 (or standard forwarding)
        const instructions = [];
        if (isIngress && meterIdA) {
          instructions.push({ type: "METER", meterId: Number(meterIdA) });
        }
        if (isLowLatency) {
          instructions.push({ type: "QUEUE", queueId: 1 });
        }
        instructions.push({ type: "OUTPUT", port: String(hop.outPort) });

        // Unicast traffic flow (both IPv4 and unicast ARP replies)
        const unicastFlow = {
          priority: 40000,
          timeout: 0,
          isPermanent: true,
          deviceId: hop.deviceId,
          tableId: 0,
          treatment: { instructions },
          selector: {
            criteria: [
              { type: "IN_PORT", port: Number(hop.inPort) },
              { type: "ETH_SRC", mac: hostA.mac },
              { type: "ETH_DST", mac: hostB.mac },
            ],
          },
        };

        try {
          const res = await installOnosFlow(hop.deviceId, unicastFlow);
          const fid = res?.flowId || res?.id;
          if (fid) installedFlows.push({ deviceId: hop.deviceId, flowId: fid });
        } catch (err) {
          console.error(`[Slicing] Failed unicast flow on ${hop.deviceId}:`, err);
        }

        // Record ARP broadcast output requirement for this switch + inPort + hostA.mac
        const arpKey = `${hop.deviceId}__${hop.inPort}__${hostA.mac.toLowerCase()}`;
        if (!arpRuleMap.has(arpKey)) {
          arpRuleMap.set(arpKey, {
            deviceId: hop.deviceId,
            inPort: hop.inPort,
            mac: hostA.mac,
            outPorts: new Set(),
          });
        }
        arpRuleMap.get(arpKey).outPorts.add(Number(hop.outPort));
      }
    }
  }

  // Step 3: Install consolidated ARP Broadcast flows with multi-port output instructions
  for (const rule of arpRuleMap.values()) {
    const instructions = Array.from(rule.outPorts).map((p) => ({
      type: "OUTPUT",
      port: String(p),
    }));

    const arpFlow = {
      priority: 40000,
      timeout: 0,
      isPermanent: true,
      deviceId: rule.deviceId,
      tableId: 0,
      treatment: { instructions },
      selector: {
        criteria: [
          { type: "IN_PORT", port: Number(rule.inPort) },
          { type: "ETH_TYPE", ethType: 2054 },
          { type: "ETH_SRC", mac: rule.mac },
        ],
      },
    };

    try {
      const res = await installOnosFlow(rule.deviceId, arpFlow);
      const fid = res?.flowId || res?.id;
      if (fid) installedFlows.push({ deviceId: rule.deviceId, flowId: fid });
    } catch (err) {
      console.error(`[Slicing] Failed ARP flow on ${rule.deviceId}:`, err);
    }
  }

  const slice = {
    id: sliceId,
    name,
    description,
    bandwidth,
    burstSize,
    unit,
    vlanId,
    color,
    hosts: installedHosts,
    flows: installedFlows,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  const slices = loadSlices();
  slices.push(slice);
  saveSlices(slices);

  return slice;
}

/**
 * Delete a slice — removes all its meters and flow rules across all switches.
 */
export async function deleteSlice(sliceId) {
  const slices = loadSlices();
  const slice = slices.find((s) => s.id === sliceId);
  if (!slice) throw new Error(`Slice not found: ${sliceId}`);

  const errors = [];
  const hostMacs = new Set(
    (slice.hosts || []).map((h) => (h.mac || "").toLowerCase()).filter(Boolean)
  );

  // 1. Delete all tracked flow rules
  for (const item of slice.flows || []) {
    if (item.deviceId && item.flowId) {
      try {
        await deleteOnosFlow(item.deviceId, item.flowId);
      } catch (err) {
        errors.push(`Flow ${item.flowId} on ${item.deviceId}: ${err.message}`);
      }
    }
  }

  // 2. Delete drop rules and meters for each host
  for (const host of slice.hosts || []) {
    if (host.dropFlowId && host.deviceId) {
      try {
        await deleteOnosFlow(host.deviceId, host.dropFlowId);
      } catch (err) {
        errors.push(`Drop flow on ${host.deviceId}: ${err.message}`);
      }
    }

    if (host.meterId && host.deviceId) {
      try {
        await deleteMeter(host.deviceId, host.meterId);
      } catch (err) {
        errors.push(`Meter on ${host.deviceId}: ${err.message}`);
      }
    }
  }

  // 3. Deep network cleanup: Query all switches and delete any matching rules for this slice's hosts
  if (hostMacs.size > 0) {
    try {
      const devices = await getDevices().catch(() => []);
      for (const dev of devices) {
        const flows = await getOnosFlows(dev.id).catch(() => []);
        for (const f of flows) {
          const srcMac = f.selector?.criteria?.find((c) => c.type === "ETH_SRC")?.mac?.toLowerCase();
          const dstMac = f.selector?.criteria?.find((c) => c.type === "ETH_DST")?.mac?.toLowerCase();

          // If the flow rule was installed for these hosts (Priority 41000, 40000, 39000, or reactive forwarding)
          const isSliceFlow =
            (f.priority === 41000 || f.priority === 40000 || f.priority === 39000 || f.appId === "org.onosproject.fwd") &&
            ((srcMac && hostMacs.has(srcMac)) || (dstMac && hostMacs.has(dstMac)));

          if (isSliceFlow) {
            try {
              await deleteOnosFlow(dev.id, f.id);
            } catch (err) {
              errors.push(`Deep clean flow ${f.id} on ${dev.id}: ${err.message}`);
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Slicing] Deep clean error during slice deletion:", err);
    }
  }

  const remaining = slices.filter((s) => s.id !== sliceId);
  saveSlices(remaining);

  return { success: true, warnings: errors.length > 0 ? errors : undefined };
}

/**
 * Check if a host is already assigned to a slice.
 */
export function isHostInAnySlice(hostMac) {
  if (!hostMac) return null;
  const target = hostMac.toLowerCase();
  const slices = loadSlices();
  for (const slice of slices) {
    for (const host of slice.hosts || []) {
      if ((host.mac || "").toLowerCase() === target) return slice;
    }
  }
  return null;
}

/**
 * Get live meter stats across all devices.
 */
export async function getAllMeterStats() {
  try {
    const devices = await getDevices();
    const allMeters = [];
    for (const d of devices) {
      const meters = await getMeters(d.id);
      meters.forEach((m) => allMeters.push({ ...m, deviceId: d.id }));
    }
    return allMeters;
  } catch {
    return [];
  }
}
