function parseTimestamp(ts) {
	return new Date(ts).toLocaleString(); // Human-readable timestamp
}

export const extractDevices = (topologyData) => {
	const nodes = topologyData.topology[0].node;
	const readableNodes = [];

	for (const node of nodes) {
		const nodeId = node["node-id"];

		if (nodeId.startsWith("host:")) {
			const address = node["host-tracker-service:addresses"]?.[0];
			const attachment =
				node["host-tracker-service:attachment-points"]?.[0];

			readableNodes.push({
				type: "host",
				id: nodeId,
				macAddress: address?.mac || "N/A",
				ipAddress: address?.ip || "N/A",
				firstSeen: address?.["first-seen"]
					? parseTimestamp(address["first-seen"])
					: "N/A",
				lastSeen: address?.["last-seen"]
					? parseTimestamp(address["last-seen"])
					: "N/A",
				connectedTo:
					attachment?.["tp-id"]?.split(":")?.slice(0, 2)?.join(":") ||
					"N/A",
				port: attachment?.["tp-id"] || "N/A",
			});
		} else if (nodeId.startsWith("openflow:")) {
			const ports =
				node["termination-point"]?.map((tp) => tp["tp-id"]) || [];

			readableNodes.push({
				type: "switch",
				id: nodeId,
				ports,
			});
		}
	}

	return readableNodes;
};
// const TOPOLOGY_CONST = {
// 	HT_SERVICE_ID: "host-tracker-service:id",
// 	IP: "ip",
// 	HT_SERVICE_ATTPOINTS: "host-tracker-service:attachment-points",
// 	HT_SERVICE_TPID: "host-tracker-service:tp-id",
// 	NODE_ID: "node-id",
// 	SOURCE_NODE: "source-node",
// 	DEST_NODE: "dest-node",
// 	SOURCE_TP: "source-tp",
// 	DEST_TP: "dest-tp",
// 	ADDRESSES: "addresses",
// 	HT_SERVICE_ADDS: "host-tracker-service:addresses",
// 	HT_SERVICE_IP: "host-tracker-service:ip",
// };
const TOPOLOGY_CONST = {
	NODE_ID: "node-id",
	ADDRESSES: "host-tracker-service:addresses",
	HT_SERVICE_ADDS: "host-tracker-service:addresses",
	IP: "ip",
	MAC: "mac",
	FIRST_SEEN: "first-seen",
	LAST_SEEN: "last-seen",
	ATTACHMENT_POINTS: "host-tracker-service:attachment-points",
	SOURCE_NODE: "source-node",
	SOURCE_TP: "source-tp",
	DEST_NODE: "dest-node",
	DEST_TP: "dest-tp",
};

export const extractDeviceData = (topology) => {
	const nodes = [];
	const links = [];
	const linksMap = {};
	// Process Nodes
	if (Array.isArray(topology.node)) {
		topology.node.forEach((nodeData) => {
			let groupType = "";
			let nodeTitle = "";
			const nodeId = nodeData[TOPOLOGY_CONST.NODE_ID];

			if (nodeId && nodeId.includes("host")) {
				groupType = "host";
				nodeTitle += `ID: <b>${nodeId}</b><br>`;

				const addresses =
					nodeData[TOPOLOGY_CONST.ADDRESSES] ||
					nodeData[TOPOLOGY_CONST.HT_SERVICE_ADDS];

				if (Array.isArray(addresses)) {
					const addr = addresses[0]; // assuming one address per host
					if (addr) {
						const ip =
							addr[TOPOLOGY_CONST.IP] ||
							addr[TOPOLOGY_CONST.HT_SERVICE_IP];
						const mac = addr[TOPOLOGY_CONST.MAC] || "N/A";
						const firstSeen = addr[TOPOLOGY_CONST.FIRST_SEEN];
						const lastSeen = addr[TOPOLOGY_CONST.LAST_SEEN];
						nodeTitle += `IP: <b>${ip}</b><br>`;
						nodeTitle += `MAC: <b>${mac}</b><br>`;
						nodeTitle += `First Seen: <b>${new Date(
							firstSeen
						).toLocaleString()}</b><br>`;
						nodeTitle += `Last Seen: <b>${new Date(
							lastSeen
						).toLocaleString()}</b><br>`;
					}
				}

				const attachments =
					nodeData[TOPOLOGY_CONST.ATTACHMENT_POINTS] || [];
				if (attachments.length > 0) {
					nodeTitle += `Connected Ports:<br>`;
					attachments.forEach((ap, i) => {
						const port = ap["tp-id"];
						const active = ap["active"] ? "✅" : "❌";
						nodeTitle += `&nbsp;&nbsp;• ${port} ${active}<br>`;
					});
				}

				nodeTitle += "Type: Host";
			} else {
				groupType = "switch";
				nodeTitle += `Name: <b>${nodeId}</b><br>Type: Switch<br>Ports:<br>`;

				const tps = nodeData["termination-point"] || [];
				tps.forEach((tp) => {
					const tpId = tp["tp-id"];
					nodeTitle += `&nbsp;&nbsp;• ${tpId}<br>`;
				});
			}

			// Push node
			nodes.push({
				id: nodeId,
				label: nodeId,
				group: groupType,
				value: 20,
				title: nodeTitle,
			});
		});
	}

	// Process Links
	if (Array.isArray(topology.link)) {
		topology.link.forEach((linkData) => {
			const srcId = linkData.source[TOPOLOGY_CONST.SOURCE_NODE];
			const dstId = linkData.destination[TOPOLOGY_CONST.DEST_NODE];
			const srcPort = linkData.source[TOPOLOGY_CONST.SOURCE_TP];
			const dstPort = linkData.destination[TOPOLOGY_CONST.DEST_TP];

			if (
				!linksMap[`${srcId}:${dstId}`] &&
				!linksMap[`${dstId}:${srcId}`]
			) {
				links.push({
					from: srcId,
					to: dstId,
					srcPort: srcPort,
					dstPort: dstPort,
					title: `Source Port: <b>${srcPort}</b><br>Dest Port: <b>${dstPort}</b>`,
				});
				linksMap[`${srcId}:${dstId}`] = true;
			}
		});
	}
	console.log(topology.link);

	return { nodes, links };
};

export const generatePortDots = (topologyLinks, inventoryNodes) => {
	const portDots = [];

	// Build a map of all node-connectors by ID
	const connectorMap = {}; // { "openflow:3:1": { mac, port, nodeId } }

	inventoryNodes.forEach((node) => {
		const nodeId = node["id"];
		const connectors = node["node-connector"] || [];

		connectors.forEach((conn) => {
			const connectorId = conn["id"]; // e.g., "openflow:3:1"
			const mac = conn["flow-node-inventory:hardware-address"];
			const portName = conn["flow-node-inventory:name"];
			if (mac && !connectorId.includes("LOCAL")) {
				connectorMap[connectorId] = {
					mac,
					// port: connectorId.split(":").pop(), // just the port number
					port: portName.split("-")[1], // just the port number
					nodeId,
				};
			}
		});
	});
	console.log(connectorMap);

	// Generate one dot per endpoint (source and destination)
	topologyLinks.forEach((link, index) => {
		const srcPortId = link.srcPort;
		const dstPortId = link.dstPort;

		const srcConnectorId = srcPortId;
		const dstConnectorId = dstPortId;

		console.log(srcConnectorId);
		console.log(dstConnectorId);

		if (connectorMap[srcConnectorId]) {
			portDots.push({
				id: `dot-${index}-src`,
				source: link.from,
				target: link.to,
				mac: connectorMap[srcConnectorId].mac,
				port: connectorMap[srcConnectorId].port,
			});
		}

		if (connectorMap[dstConnectorId]) {
			portDots.push({
				id: `dot-${index}-dst`,
				source: link.to,
				target: link.from,
				mac: connectorMap[dstConnectorId].mac,
				port: connectorMap[dstConnectorId].port,
			});
		}
	});

	return portDots;
};
