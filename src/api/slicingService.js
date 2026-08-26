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
    icon: "📡",
  },
  {
    id: "urllc",
    name: "URLLC (Ultra-Reliable Low-Latency)",
    description: "Mission-critical, low-latency traffic (SCADA, remote surgery)",
    bandwidth: 10000,
    burstSize: 2000,
    unit: "KB_PER_SEC",
    color: "#ef4444",
    icon: "⚡",
  },
  {
    id: "mmtc",
    name: "mMTC (Massive Machine-Type Comms)",
    description: "High-density IoT sensors and telemetry",
    bandwidth: 2000,
    burstSize: 500,
    unit: "KB_PER_SEC",
    color: "#22c55e",
    icon: "🌐",
  },
  {
    id: "best-effort",
    name: "Best Effort",
    description: "Default traffic with no guaranteed QoS",
    bandwidth: 1000,
    burstSize: 200,
    unit: "KB_PER_SEC",
    color: "#a1a1aa",
    icon: "📦",
  },
];

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

function loadSlices() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSlices(slices) {
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
 * Get network topology info (devices, links, hosts) from ONOS.
 */
export async function getTopologyInfo() {
  const [devices, links, hosts] = await Promise.all([
    getDevices(),
    getLinks(),
    getHosts(),
  ]);
  return { devices, links, hosts };
}

/**
 * Find which device and port a host is connected to.
 */
export function getHostLocation(host) {
  if (host.locations && host.locations.length > 0) {
    return {
      deviceId: host.locations[0].elementId,
      port: String(host.locations[0].port),
    };
  }
  if (host.location) {
    return {
      deviceId: host.location.elementId,
      port: String(host.location.port),
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
    selectedHosts = [],
    vlanId: manualVlanId = null,
  } = sliceConfig;

  if (!name) throw new Error("Slice name is required");
  if (!bandwidth || bandwidth <= 0) throw new Error("Bandwidth must be > 0");
  if (selectedHosts.length === 0)
    throw new Error("At least one host must be assigned to the slice");

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
    const location = getHostLocation(host);

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

  // Step 2: Install end-to-end peer forwarding and ARP flows between all pairs of hosts
  for (let i = 0; i < selectedHosts.length; i++) {
    const hostA = selectedHosts[i];
    const locA = getHostLocation(hostA);
    if (!locA) continue;

    const hostAInstalled = installedHosts.find((h) => h.mac === hostA.mac);
    const meterIdA = hostAInstalled?.meterId;

    for (let j = 0; j < selectedHosts.length; j++) {
      if (i === j) continue;
      const hostB = selectedHosts[j];
      const locB = getHostLocation(hostB);
      if (!locB) continue;

      // Find path from switch of Host A to switch of Host B
      const hops = findSwitchPath(locA.deviceId, locB.deviceId, topologyLinks, locA.port, locB.port);
      if (!hops || hops.length === 0) {
        console.warn(`[Slicing] No path between ${locA.deviceId} and ${locB.deviceId}`);
        continue;
      }

      // Install forwarding flows along each hop
      for (let hopIdx = 0; hopIdx < hops.length; hopIdx++) {
        const hop = hops[hopIdx];
        const isIngress = hopIdx === 0;

        const instructions = [];
        if (isIngress && meterIdA) {
          instructions.push({ type: "METER", meterId: Number(meterIdA) });
        }
        instructions.push({ type: "OUTPUT", port: String(hop.outPort) });

        // Unicast traffic flow (both IPv4 and unicast ARP)
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

        // ARP Broadcast flow (0x0806) along the path so Host A's ARP requests reach Host B
        const arpFlow = {
          priority: 40000,
          timeout: 0,
          isPermanent: true,
          deviceId: hop.deviceId,
          tableId: 0,
          treatment: { instructions: [{ type: "OUTPUT", port: String(hop.outPort) }] },
          selector: {
            criteria: [
              { type: "IN_PORT", port: Number(hop.inPort) },
              { type: "ETH_TYPE", ethType: "0x0806" },
              { type: "ETH_SRC", mac: hostA.mac },
            ],
          },
        };

        try {
          const res = await installOnosFlow(hop.deviceId, arpFlow);
          const fid = res?.flowId || res?.id;
          if (fid) installedFlows.push({ deviceId: hop.deviceId, flowId: fid });
        } catch (err) {
          console.error(`[Slicing] Failed ARP flow on ${hop.deviceId}:`, err);
        }
      }
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

  const remaining = slices.filter((s) => s.id !== sliceId);
  saveSlices(remaining);

  return { success: true, warnings: errors.length > 0 ? errors : undefined };
}

/**
 * Check if a host is already assigned to a slice.
 */
export function isHostInAnySlice(hostMac) {
  const slices = loadSlices();
  for (const slice of slices) {
    for (const host of slice.hosts || []) {
      if (host.mac === hostMac) return slice;
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
