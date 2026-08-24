/**
 * Network Slicing Service — Host-Based Slicing with VLAN Isolation
 *
 * A network slice is a group of hosts that form an isolated virtual network.
 * Hosts within the same slice can communicate. Hosts in different slices cannot.
 *
 * Implementation:
 *   - Each slice is assigned a unique VLAN ID
 *   - On each host's ingress switch: push VLAN tag + apply meter
 *   - On each host's egress switch: match VLAN + pop tag + deliver
 *   - Isolation is inherent: only hosts with matching VLAN rules can communicate
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
  // Start from VLAN 100, skip any in-use
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
        // Gather meter stats per host
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
 * ONOS host objects have a `locations` array with {elementId, port}.
 */
function getHostLocation(host) {
  if (host.locations && host.locations.length > 0) {
    return {
      deviceId: host.locations[0].elementId,
      port: String(host.locations[0].port),
    };
  }
  // Fallback for older ONOS versions
  if (host.location) {
    return {
      deviceId: host.location.elementId,
      port: String(host.location.port),
    };
  }
  return null;
}

/**
 * Create a new network slice.
 *
 * A slice is a group of hosts connected via a shared VLAN.
 * For each host in the slice:
 *   1. Create a meter on the host's switch (bandwidth cap)
 *   2. Install ingress flow: match traffic FROM host → push VLAN → apply meter → forward
 *   3. Install egress flow: match VLAN → pop VLAN → deliver to host port
 *
 * Isolation: only hosts with matching VLAN flow rules can exchange traffic.
 */
export async function createSlice(sliceConfig) {
  const {
    name,
    description = "",
    bandwidth,
    burstSize = Math.round(bandwidth * 0.2),
    unit = "KB_PER_SEC",
    color = "#6366f1",
    selectedHosts = [], // Array of ONOS host objects
    vlanId: manualVlanId = null,
  } = sliceConfig;

  if (!name) throw new Error("Slice name is required");
  if (!bandwidth || bandwidth <= 0) throw new Error("Bandwidth must be > 0");
  if (selectedHosts.length === 0)
    throw new Error("At least one host must be assigned to the slice");

  const sliceId = `slice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const vlanId = manualVlanId || getNextVlanId();

  // Track all installed resources for cleanup
  const installedHosts = [];

  for (const host of selectedHosts) {
    const mac = host.mac;
    const ips = host.ipAddresses || [];
    const location = getHostLocation(host);

    if (!location) {
      console.warn(`[Slicing] Host ${mac} has no known location, skipping`);
      continue;
    }

    const { deviceId, port } = location;

    // 1. Create meter on this host's switch
    const meterBody = {
      deviceId,
      unit,
      bands: [{ type: "DROP", rate: bandwidth, burstSize }],
    };

    let meterId = null;
    try {
      const meterRes = await createMeter(deviceId, meterBody);
      if (meterRes?.meters?.[0]?.id) {
        meterId = meterRes.meters[0].id;
      } else if (meterRes?.id) {
        meterId = meterRes.id;
      } else {
        // Fetch latest meter
        const allMeters = await getMeters(deviceId);
        if (allMeters.length > 0) {
          meterId = allMeters[allMeters.length - 1].id;
        }
      }
    } catch (err) {
      console.error(`[Slicing] Failed to create meter on ${deviceId}:`, err);
    }

    const flowIds = [];

    // 2. Install intra-slice peer forwarding rules (Priority 40000)
    // For each other host in the SAME slice, allow traffic and apply meter
    const peerHosts = selectedHosts.filter((h) => h.mac !== host.mac);

    for (const peer of peerHosts) {
      const peerLoc = getHostLocation(peer);
      if (!peerLoc) continue;

      const instructions = [];
      if (meterId) {
        instructions.push({ type: "METER", meterId: Number(meterId) });
      }

      // If peer is on the same switch, output directly to peer's port
      // If peer is on another switch, output to NORMAL/uplink
      if (peerLoc.deviceId === deviceId) {
        instructions.push({ type: "OUTPUT", port: String(peerLoc.port) });
      } else {
        instructions.push({ type: "OUTPUT", port: "NORMAL" });
      }

      // Allow all traffic (both ARP 0x0806 and IPv4 0x0800) between slice peers
      const peerFlow = {
        appId: "org.onosproject.rest",
        priority: 40000,
        timeout: 0,
        isPermanent: true,
        deviceId,
        tableId: 0,
        treatment: { instructions },
        selector: {
          criteria: [
            { type: "IN_PORT", port: Number(port) },
            { type: "ETH_SRC", mac },
            { type: "ETH_DST", mac: peer.mac },
          ],
        },
      };

      try {
        const res = await installOnosFlow(deviceId, peerFlow);
        if (res?.flows?.[0]?.id) flowIds.push(res.flows[0].id);
      } catch (err) {
        console.error(`[Slicing] Failed peer flow on ${deviceId}:`, err);
      }
    }

    // 3. Install strict Isolation Boundary (Priority 39000 Drop Rule)
    // Any packet from this host port NOT destined to a peer in the slice is DROPPED.
    // This overrides ONOS reactive forwarding (priority 10) and blocks cross-slice traffic.
    const dropFlow = {
      appId: "org.onosproject.rest",
      priority: 39000,
      timeout: 0,
      isPermanent: true,
      deviceId,
      tableId: 0,
      treatment: {
        instructions: [], // Empty instructions = DROP in OpenFlow
      },
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
      if (res?.flows?.[0]?.id) dropFlowId = res.flows[0].id;
    } catch (err) {
      console.error(`[Slicing] Failed drop boundary on ${deviceId}:`, err);
    }

    installedHosts.push({
      mac,
      ipAddresses: ips,
      deviceId,
      port,
      meterId,
      flowIds,
      dropFlowId,
      hostId: host.id || `${mac}/None`,
    });
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
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  const slices = loadSlices();
  slices.push(slice);
  saveSlices(slices);

  return slice;
}

/**
 * Delete a slice — removes all its meters and flow rules, freeing hosts.
 */
export async function deleteSlice(sliceId) {
  const slices = loadSlices();
  const slice = slices.find((s) => s.id === sliceId);
  if (!slice) throw new Error(`Slice not found: ${sliceId}`);

  const errors = [];

  for (const host of slice.hosts || []) {
    // Delete peer forwarding flows
    const allFlowIds = [
      ...(host.flowIds || []),
      ...(host.dropFlowId ? [host.dropFlowId] : []),
      ...(host.ingressFlowId ? [host.ingressFlowId] : []),
      ...(host.egressFlowId ? [host.egressFlowId] : []),
    ];

    for (const fid of allFlowIds) {
      try {
        await deleteOnosFlow(host.deviceId, fid);
      } catch (err) {
        errors.push(`Flow ${fid} on ${host.deviceId}: ${err.message}`);
      }
    }

    // Delete meter
    if (host.meterId) {
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
