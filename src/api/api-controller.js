// apiController.js
import axios from "axios";

// ==== Configuration ====
const ODL_CONFIG = {
	baseURL: "/api/rests/data/",
	username: "admin",
	password: "admin",
};

const AUTH = { username: ODL_CONFIG.username, password: ODL_CONFIG.password };
const HEADERS = { "Content-Type": "application/json", Accept: "application/json" };

const odlApi = axios.create({
	baseURL: ODL_CONFIG.baseURL,
	timeout: 5000,
	headers: HEADERS,
	auth: AUTH,
});

/**
 * Try RFC-8040 endpoint, fall back to legacy /restconf/operational/ on 404/409.
 * Legacy path kept in case of older ODL versions.
 */
async function getWithFallback(rfc8040Path, legacyPath) {
	try {
		const res = await odlApi.get(rfc8040Path);
		return res.data;
	} catch (err) {
		const status = err.response?.status;
		if (status === 404 || status === 409) {
			console.warn(`[ODL] RFC-8040 failed (${status}), trying legacy endpoint: ${legacyPath}`);
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
			`ODL API Error: ${error.response.status}`,
			error.response.data
		);
		throw new Error(
			`ODL API Error: ${error.response.status} ${JSON.stringify(
				error.response.data
			)}`
		);
	} else {
		console.error("ODL API Network Error:", error.message);
		throw new Error(`ODL API Error: ${error.message}`);
	}
}

// ==== Inventory & Topology ====

export async function getNodes() {
	try {
		const data = await getWithFallback(
			"opendaylight-inventory:nodes?content=nonconfig",
			"opendaylight-inventory:nodes"
		);
		console.log(data);
		return data;
	} catch (err) {
		handleError(err);
	}
}

export async function getTopology() {
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
	try {
		const res = await odlApi.get(
			`opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}?content=nonconfig`
		);
		console.log(res.data);
		return res.data;
	} catch (err) {
		handleError(err);
	}
}

// ==== Flow Tables and Entries ====

export async function getNodeTables(nodeId) {
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
      getWithFallback(
        "opendaylight-inventory:nodes?content=nonconfig",
        "opendaylight-inventory:nodes"
      ),
      getWithFallback(
        "network-topology:network-topology?content=nonconfig",
        "network-topology:network-topology"
      ).catch(() => null),
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

    // Real host connections: nodes of type "host" in the host-tracker topology
    let hostConnections = 0;
    if (topoData) {
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
