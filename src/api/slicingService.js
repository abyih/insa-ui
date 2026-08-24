/**
 * Network Slicing Service
 *
 * Orchestrates meter + flow rule management to create, monitor,
 * and remove network slices on ONOS-controlled switches.
 *
 * Slice data is persisted in localStorage so it survives page reloads.
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

// ─── Predefined slice templates ──────────────────────────────────────────────
export const SLICE_TEMPLATES = [
  {
    id: "embb",
    name: "eMBB (Enhanced Mobile Broadband)",
    description: "High bandwidth for video, streaming, and downloads",
    bandwidth: 50000,
    burstSize: 10000,
    unit: "KB_PER_SEC",
    priority: 40000,
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
    priority: 50000,
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
    priority: 30000,
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
    priority: 10000,
    color: "#a1a1aa",
    icon: "📦",
  },
];

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
 * Get all saved slice definitions (local state + live meter stats from ONOS).
 */
export async function getSlices() {
  const slices = loadSlices();

  // Enrich with live meter stats
  const enriched = await Promise.all(
    slices.map(async (slice) => {
      try {
        const updatedDevices = await Promise.all(
          (slice.devices || []).map(async (dev) => {
            const meters = await getMeters(dev.deviceId);
            const liveMeter = meters.find(
              (m) => String(m.id) === String(dev.meterId)
            );
            return {
              ...dev,
              meterStats: liveMeter
                ? {
                    packets: liveMeter.packets || 0,
                    bytes: liveMeter.bytes || 0,
                    life: liveMeter.life || 0,
                    bandRate: liveMeter.bands?.[0]?.rate || 0,
                    state: liveMeter.state || "UNKNOWN",
                  }
                : null,
            };
          })
        );
        return { ...slice, devices: updatedDevices, status: "ACTIVE" };
      } catch {
        return { ...slice, status: "ERROR" };
      }
    })
  );
  return enriched;
}

/**
 * Get network topology info needed for slice creation.
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
 * Create a new network slice.
 *
 * For each target device:
 *   1. Create a meter with the specified bandwidth
 *   2. Install a flow rule that matches the traffic selector and applies the meter
 *   3. Record the slice metadata locally
 */
export async function createSlice(sliceConfig) {
  const {
    name,
    description = "",
    bandwidth,
    burstSize = Math.round(bandwidth * 0.2),
    unit = "KB_PER_SEC",
    priority = 40000,
    selectorType = "IPV4_DST",
    selectorValue = "10.0.0.0/24",
    color = "#6366f1",
    targetDevices = [],
    vlanId = null,
  } = sliceConfig;

  if (!name) throw new Error("Slice name is required");
  if (!bandwidth || bandwidth <= 0) throw new Error("Bandwidth must be > 0");
  if (targetDevices.length === 0) throw new Error("At least one target device is required");

  const sliceId = `slice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const createdDevices = [];

  for (const device of targetDevices) {
    const deviceId = device.id || device;

    // 1. Create meter
    const meterBody = {
      deviceId,
      unit,
      bands: [
        {
          type: "DROP",
          rate: bandwidth,
          burstSize,
        },
      ],
    };

    const meterRes = await createMeter(deviceId, meterBody);

    // ONOS returns the meter in the Location header or response body
    // Parse the meter ID from the response
    let meterId = null;
    if (meterRes?.meters?.[0]?.id) {
      meterId = meterRes.meters[0].id;
    } else if (meterRes?.id) {
      meterId = meterRes.id;
    } else {
      // Fetch all meters and find the latest one
      const allMeters = await getMeters(deviceId);
      if (allMeters.length > 0) {
        meterId = allMeters[allMeters.length - 1].id;
      }
    }

    // 2. Build flow rule with meter instruction
    const criteria = [{ type: "ETH_TYPE", ethType: "0x0800" }];

    if (vlanId) {
      criteria.push({ type: "VLAN_VID", vlanId });
    }

    if (selectorType === "IPV4_DST") {
      criteria.push({ type: "IPV4_DST", ip: selectorValue });
    } else if (selectorType === "IPV4_SRC") {
      criteria.push({ type: "IPV4_SRC", ip: selectorValue });
    } else if (selectorType === "IP_PROTO") {
      criteria.push({ type: "IP_PROTO", protocol: parseInt(selectorValue) });
    }

    const instructions = [];
    if (meterId) {
      instructions.push({ type: "METER", meterId: Number(meterId) });
    }
    // If VLAN tagging is requested, add VLAN push + set actions
    if (vlanId) {
      instructions.push({
        type: "L2MODIFICATION",
        subtype: "VLAN_PUSH",
        ethernetType: "0x8100",
      });
      instructions.push({
        type: "L2MODIFICATION",
        subtype: "VLAN_ID",
        vlanId: Number(vlanId),
      });
    }
    instructions.push({ type: "OUTPUT", port: "NORMAL" });

    const flowBody = {
      priority,
      timeout: 0,
      isPermanent: true,
      deviceId,
      treatment: { instructions },
      selector: { criteria },
    };

    const flowRes = await installOnosFlow(deviceId, flowBody);

    // Try to extract flow ID
    let flowId = null;
    if (flowRes?.flows?.[0]?.id) {
      flowId = flowRes.flows[0].id;
    }

    createdDevices.push({
      deviceId,
      meterId,
      flowId,
    });
  }

  const slice = {
    id: sliceId,
    name,
    description,
    bandwidth,
    burstSize,
    unit,
    priority,
    selectorType,
    selectorValue,
    vlanId,
    color,
    devices: createdDevices,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  const slices = loadSlices();
  slices.push(slice);
  saveSlices(slices);

  return slice;
}

/**
 * Delete a slice — removes its meters and flow rules from all devices.
 */
export async function deleteSlice(sliceId) {
  const slices = loadSlices();
  const slice = slices.find((s) => s.id === sliceId);
  if (!slice) throw new Error(`Slice not found: ${sliceId}`);

  const errors = [];

  for (const dev of slice.devices || []) {
    // Delete flow rule
    if (dev.flowId) {
      try {
        await deleteOnosFlow(dev.deviceId, dev.flowId);
      } catch (err) {
        errors.push(`Flow delete failed on ${dev.deviceId}: ${err.message}`);
      }
    }
    // Delete meter
    if (dev.meterId) {
      try {
        await deleteMeter(dev.deviceId, dev.meterId);
      } catch (err) {
        errors.push(`Meter delete failed on ${dev.deviceId}: ${err.message}`);
      }
    }
  }

  // Remove from local storage regardless of ONOS cleanup errors
  const remaining = slices.filter((s) => s.id !== sliceId);
  saveSlices(remaining);

  if (errors.length > 0) {
    return { success: true, warnings: errors };
  }
  return { success: true };
}

/**
 * Get live meter stats for all devices.
 */
export async function getAllMeterStats() {
  try {
    const devices = await getDevices();
    const allMeters = [];
    for (const d of devices) {
      const meters = await getMeters(d.id);
      meters.forEach((m) => {
        allMeters.push({ ...m, deviceId: d.id });
      });
    }
    return allMeters;
  } catch {
    return [];
  }
}

/**
 * Get all flow rules tagged by slice membership.
 */
export async function getSliceFlows(sliceId) {
  const slices = loadSlices();
  const slice = slices.find((s) => s.id === sliceId);
  if (!slice) return [];

  const flows = [];
  for (const dev of slice.devices || []) {
    try {
      const devFlows = await getOnosFlows(dev.deviceId);
      const matchingFlows = devFlows.filter(
        (f) => String(f.id) === String(dev.flowId)
      );
      flows.push(...matchingFlows);
    } catch {
      // Skip device if unreachable
    }
  }
  return flows;
}
