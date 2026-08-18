// apiController.js
import axios from "axios";

// ==== Configuration ====
const ODL_CONFIG = {
	baseURL: "/api/rests/data/",
	username: "admin",
	password: "admin",
};

const ONOS_CONFIG = {
	baseURL: "/api/onos/v1",
	username: "onos",
	password: "rocks",
};

const AUTH = { username: ODL_CONFIG.username, password: ODL_CONFIG.password };
const HEADERS = { "Content-Type": "application/json", Accept: "application/json" };

const odlApi = axios.create({
	baseURL: ODL_CONFIG.baseURL,
	timeout: 5000,
	headers: HEADERS,
	auth: AUTH,
});

const onosApi = axios.create({
	baseURL: ONOS_CONFIG.baseURL,
	timeout: 5000,
	headers: {
		...HEADERS,
		Authorization: "Basic " + btoa(`${ONOS_CONFIG.username}:${ONOS_CONFIG.password}`),
	},
});

let detectedController = null; // 'onos' | 'odl'

async function detectController() {
	if (detectedController) return detectedController;
	try {
		const res = await onosApi.get("/devices");
		if (res.data?.devices) {
			detectedController = "onos";
			return "onos";
		}
	} catch {
		// not onos
	}
	detectedController = "odl";
	return "odl";
}

/**
 * Try RFC-8040 endpoint, fall back to legacy /restconf/operational/ on 404/409.
 */
async function getWithFallback(rfc8040Path, legacyPath) {
	try {
		const res = await odlApi.get(rfc8040Path);
		return res.data;
	} catch (err) {
		const status = err.response?.status;
		if (status === 404 || status === 409) {
			try {
				const legacyApi = axios.create({
					baseURL: "/api/restconf/operational/",
					timeout: 5000,
					headers: HEADERS,
					auth: AUTH,
				});
				const res = await legacyApi.get(legacyPath);
				return res.data;
			} catch (legacyErr) {
				handleError(legacyErr);
			}
		}
		handleError(err);
	}
}

// ==== Error Handling ====
function handleError(error) {
	if (error.response) {
		console.error(
			`Controller API Error: ${error.response.status}`,
			error.response.data
		);
		throw new Error(
			`Controller API Error: ${error.response.status} ${JSON.stringify(
				error.response.data
			)}`
		);
	} else {
		console.error("Controller API Network Error:", error.message);
		throw new Error(`Controller API Error: ${error.message}`);
	}
}

// ==== Inventory & Topology ====

export async function getNodes() {
	const cType = await detectController();
	if (cType === "onos") {
		try {
			const [devRes, flowsRes] = await Promise.all([
				onosApi.get("/devices").catch(() => ({ data: { devices: [] } })),
				onosApi.get("/flows").catch(() => ({ data: { flows: [] } })),
			]);

			const devices = devRes.data?.devices || [];
			const flows = flowsRes.data?.flows || [];

			// Fetch ports for each device in parallel
			const portsList = await Promise.all(
				devices.map((d) =>
					onosApi
						.get(`/devices/${encodeURIComponent(d.id)}/ports`)
						.then((r) => r.data?.ports || [])
						.catch(() => [])
				)
			);

			const nodeArray = devices.map((d, idx) => {
				const ports = portsList[idx] || [];
				const devFlows = flows.filter((f) => f.deviceId === d.id);
				return {
					id: d.id,
					"flow-node-inventory:ip-address":
						d.annotations?.managementAddress ||
						d.annotations?.ipaddress ||
						"127.0.0.1",
					"flow-node-inventory:hardware": d.hw || d.type || "OpenFlow Switch",
					"flow-node-inventory:description":
						d.annotations?.datapathDescription || d.id,
					"flow-node-inventory:manufacturer": d.mfr || "ONOS Managed Device",
					"flow-node-inventory:serial-number": d.serial || d.chassisId || "N/A",
					"flow-node-inventory:software": d.sw ? `ONOS (${d.sw})` : "ONOS",
					"node-connector": ports.map((p) => ({
						id: `${d.id}:${p.port}`,
						"flow-node-inventory:name":
							p.annotations?.portName || `${d.id}:${p.port}`,
						"flow-node-inventory:port-number": p.port,
						"flow-node-inventory:hardware-address":
							p.annotations?.portMac || "N/A",
						"flow-node-inventory:current-speed": p.portSpeed || 10000,
						"flow-node-inventory:maximum-speed": p.portSpeed || 10000,
						"flow-node-inventory:state": {
							"link-down": !p.isEnabled,
							live: p.isEnabled,
							blocked: false,
						},
						"opendaylight-port-statistics:flow-capable-node-connector-statistics": {
							packets: { transmitted: 0, received: 0 },
							bytes: { transmitted: 0, received: 0 },
							duration: { second: 0, nanosecond: 0 },
						},
					})),
					"flow-node-inventory:table": [
						{
							id: 0,
							flow: devFlows.map((f) => ({
								id: f.id,
								priority: f.priority,
								table_id: f.tableId ?? 0,
								"opendaylight-flow-statistics:flow-statistics": {
									"packet-count": f.packets || 0,
									"byte-count": f.bytes || 0,
									duration: { second: f.life || 0, nanosecond: 0 },
								},
							})),
						},
					],
				};
			});

			return {
				"opendaylight-inventory:nodes": {
					node: nodeArray,
				},
			};
		} catch (err) {
			console.error("[ONOS] Error getting nodes:", err);
			return { "opendaylight-inventory:nodes": { node: [] } };
		}
	}

	try {
		const data = await getWithFallback(
			"opendaylight-inventory:nodes?content=nonconfig",
			"opendaylight-inventory:nodes"
		);
		return data;
	} catch (err) {
		handleError(err);
	}
}

export async function getTopology() {
	const cType = await detectController();
	if (cType === "onos") {
		try {
			const [devRes, linkRes, hostRes] = await Promise.all([
				onosApi.get("/devices").catch(() => ({ data: { devices: [] } })),
				onosApi.get("/links").catch(() => ({ data: { links: [] } })),
				onosApi.get("/hosts").catch(() => ({ data: { hosts: [] } })),
			]);
			return {
				devices: devRes.data?.devices || [],
				links: linkRes.data?.links || [],
				hosts: hostRes.data?.hosts || [],
			};
		} catch (err) {
			handleError(err);
		}
	}

	try {
		const data = await getWithFallback(
			"network-topology:network-topology?content=nonconfig",
			"network-topology:network-topology"
		);
		return data;
	} catch (err) {
		handleError(err);
	}
}

export async function getNodeConnectors(nodeId) {
	const cType = await detectController();
	if (cType === "onos") {
		try {
			const [devRes, portRes, flowsRes] = await Promise.all([
				onosApi.get(`/devices/${encodeURIComponent(nodeId)}`).catch(() => null),
				onosApi.get(`/devices/${encodeURIComponent(nodeId)}/ports`).catch(() => ({ data: { ports: [] } })),
				onosApi.get(`/flows/${encodeURIComponent(nodeId)}`).catch(() => ({ data: { flows: [] } })),
			]);
			const d = devRes?.data || { id: nodeId };
			const ports = portRes.data?.ports || [];
			const flows = flowsRes.data?.flows || [];

			return {
				"opendaylight-inventory:node": [
					{
						id: d.id || nodeId,
						"flow-node-inventory:ip-address":
							d.annotations?.managementAddress || d.annotations?.ipaddress || "127.0.0.1",
						"flow-node-inventory:hardware": d.hw || d.type || "OpenFlow Switch",
						"flow-node-inventory:description": d.annotations?.datapathDescription || d.id || nodeId,
						"flow-node-inventory:manufacturer": d.mfr || "ONOS Managed Device",
						"flow-node-inventory:serial-number": d.serial || d.chassisId || "N/A",
						"flow-node-inventory:software": d.sw ? `ONOS (${d.sw})` : "ONOS",
						"node-connector": ports.map((p) => ({
							id: `${nodeId}:${p.port}`,
							"flow-node-inventory:name": p.annotations?.portName || `${nodeId}:${p.port}`,
							"flow-node-inventory:port-number": p.port,
							"flow-node-inventory:hardware-address": p.annotations?.portMac || "N/A",
							"flow-node-inventory:current-speed": p.portSpeed || 10000,
							"flow-node-inventory:maximum-speed": p.portSpeed || 10000,
							"flow-node-inventory:state": {
								"link-down": !p.isEnabled,
								live: p.isEnabled,
								blocked: false,
							},
						})),
						"flow-node-inventory:table": [
							{
								id: 0,
								flow: flows.map((f) => ({
									id: f.id,
									priority: f.priority,
									table_id: f.tableId ?? 0,
									"opendaylight-flow-statistics:flow-statistics": {
										"packet-count": f.packets || 0,
										"byte-count": f.bytes || 0,
										duration: { second: f.life || 0, nanosecond: 0 },
									},
								})),
							},
						],
					},
				],
			};
		} catch (err) {
			handleError(err);
		}
	}

	try {
		const res = await odlApi.get(
			`opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}?content=nonconfig`
		);
		return res.data;
	} catch (err) {
		handleError(err);
	}
}

// ==== Flow Tables and Entries ====

export async function getNodeTables(nodeId) {
	const cType = await detectController();
	if (cType === "onos") {
		return { "flow-node-inventory:table": [{ id: 0 }] };
	}
	try {
		const res = await odlApi.get(
			`opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table?content=nonconfig`
		);
		return res.data;
	} catch (err) {
		handleError(err);
	}
}

export async function getFlows(nodeId, tableId = 0) {
	const cType = await detectController();
	if (cType === "onos") {
		try {
			const res = await onosApi.get(`/flows/${encodeURIComponent(nodeId)}`);
			return res.data?.flows || [];
		} catch (err) {
			handleError(err);
		}
	}
	try {
		const res = await odlApi.get(
			`opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${tableId}?content=nonconfig`
		);
		return res.data;
	} catch (err) {
		handleError(err);
	}
}

export async function getAllFlows(nodeId) {
	const cType = await detectController();
	if (cType === "onos") {
		try {
			const res = await onosApi.get(`/flows/${encodeURIComponent(nodeId)}`);
			const flows = res.data?.flows || [];
			return [
				{
					id: 0,
					flow: flows.map((f) => ({
						id: f.id,
						priority: f.priority,
						table_id: f.tableId ?? 0,
						"opendaylight-flow-statistics:flow-statistics": {
							"packet-count": f.packets || 0,
							"byte-count": f.bytes || 0,
							duration: { second: f.life || 0, nanosecond: 0 },
						},
					})),
				},
			];
		} catch (err) {
			handleError(err);
		}
	}
	try {
		const res = await odlApi.get(
			`opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}?content=nonconfig`
		);
		return res.data?.["opendaylight-inventory:node"]?.[0]?.["flow-node-inventory:table"] || [];
	} catch (err) {
		handleError(err);
	}
}

export async function installFlow(nodeId, tableId, flowId, flowData) {
	try {
		const res = await odlApi.put(
			`opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${tableId}/flow-node-inventory:flow=${flowId}`,
			flowData
		);
		return res.data;
	} catch (err) {
		handleError(err);
	}
}

export async function updateFlow(nodeId, tableId, flowId, data) {
  const flowBody = {
    "flow": [
      {
        id: String(flowId),
        priority: Number(data.priority),
        "table_id": Number(tableId),
      },
    ],
  };
  try {
    const res = await odlApi.put(
      `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}/flow-node-inventory:flow=${encodeURIComponent(flowId)}`,
      flowBody
    );
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

export async function deleteFlow(nodeId, tableId, flowId) {
  try {
    const res = await odlApi.delete(
      `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}/flow-node-inventory:flow=${encodeURIComponent(flowId)}`
    );
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

// ==== Statistics ====

export async function getNodeStatistics(nodeId) {
	try {
		const res = await odlApi.get(
			`opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/node-connector?content=nonconfig`
		);
		return res.data;
	} catch (err) {
		handleError(err);
	}
}

export async function getNodeConnectorStats(nodeId, connectorId) {
	try {
		const res = await odlApi.get(
			`opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/node-connector=${encodeURIComponent(connectorId)}?content=nonconfig`
		);
		return res.data;
	} catch (err) {
		handleError(err);
	}
}

// ==== Connection Stats ====

export async function getConnectionStats() {
  try {
    const [nodesData, topoData] = await Promise.all([
      getNodes().catch(() => null),
      getTopology().catch(() => null),
    ]);

    const nodes = nodesData?.["opendaylight-inventory:nodes"]?.node || [];

    let switchConnections = 0;
    let handshakesCompleted = 0;
    let flowsInstalled = 0;

    nodes.forEach(node => {
      if (node.id && !node.id.startsWith("host:")) {
        switchConnections++;

        // Handshakes: nodes with an IP address are fully negotiated
        if (node["flow-node-inventory:ip-address"]) handshakesCompleted++;

        // Flows installed: count all flows across all tables
        const tables = node["flow-node-inventory:table"] || [];
        tables.forEach(table => {
          flowsInstalled += (table.flow || []).length;
        });
      }
    });

    // Real host connections
    let hostConnections = 0;
    if (topoData) {
      if (Array.isArray(topoData.hosts)) {
        hostConnections = topoData.hosts.length;
      } else {
        const topologies =
          topoData?.["network-topology:network-topology"]?.topology || [];
        topologies.forEach(topo => {
          (topo.node || []).forEach(n => {
            const isHost =
              n["node-id"]?.startsWith("host:") ||
              n["host-tracker-service:attachment-points"] !== undefined;
            if (isHost) hostConnections++;
          });
        });
      }
    }

    return [
      { name: "Switch Connections", value: switchConnections, color: "#6366f1" },
      { name: "Handshakes Completed", value: handshakesCompleted, color: "#22c55e" },
      { name: "Flows Installed", value: flowsInstalled, color: "#f59e0b" },
      { name: "Host Connections", value: hostConnections, color: "#3b82f6" },
    ];
  } catch (err) {
    return [];
  }
}
// ==== Export Config & axios if needed ====
export { ODL_CONFIG, odlApi };
