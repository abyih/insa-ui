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

export const extractOvsdbData = (topology) => {
	const nodes = [];
	const links = [];
	const linksMap = {};
	const topologyNodes = Array.isArray(topology?.node) ? topology.node : [];

	if (topologyNodes.length === 0) {
		return { nodes, links };
	}

	const bridgeMap = {};
	const hostMap = {};
	const patchPorts = [];

	// Phase 1: Identify Host Nodes and Bridge Nodes
	topologyNodes.forEach((nodeData) => {
		const nodeId = nodeData[TOPOLOGY_CONST.NODE_ID];
		if (!nodeId) return;

		const isBridge = nodeId.includes("/bridge/");

		if (!isBridge) {
			// OVS Host Node
			const extIdsArray = nodeData["ovsdb:openvswitch-external-ids"] || [];
			const extIds = {};
			extIdsArray.forEach((item) => {
				if (item["external-id-key"]) {
					extIds[item["external-id-key"]] = item["external-id-value"];
				}
			});

			const hostname = extIds["hostname"] || nodeId.split("/").pop() || "OVS Host";
			const ovsVersion = nodeData["ovsdb:ovs-version"] || "N/A";
			const dbVersion = nodeData["ovsdb:db-version"] || "N/A";

			let title = `OVS Host: <b>${hostname}</b><br>`;
			title += `OVS Version: <b>${ovsVersion}</b><br>`;
			if (extIds["ovn-remote"]) title += `OVN Remote: <b>${extIds["ovn-remote"]}</b><br>`;
			if (extIds["ovn-encap-ip"]) title += `Encap IP: <b>${extIds["ovn-encap-ip"]}</b><br>`;

			const hostNode = {
				id: nodeId,
				label: hostname,
				group: "ovs-host",
				value: 30,
				title: title,
				nodeDetails: {
					type: "OVS Host",
					hostname,
					nodeId,
					ovsVersion,
					dbVersion,
					externalIds: extIds,
					connectionInfo: nodeData["ovsdb:connection-info"] || {},
				},
			};

			nodes.push(hostNode);
			hostMap[nodeId] = hostNode;
		} else {
			// Bridge Node
			const bridgeName = nodeData["ovsdb:bridge-name"] || nodeId.split("/").pop();
			const bridgeUuid = nodeData["ovsdb:bridge-uuid"] || "N/A";
			const datapathType = (nodeData["ovsdb:datapath-type"] || "").replace("ovsdb:datapath-type-", "");
			const failMode = (nodeData["ovsdb:fail-mode"] || "").replace("ovsdb:ovsdb-fail-mode-", "");

			const extIdsArray = nodeData["ovsdb:bridge-external-ids"] || [];
			const extIds = {};
			extIdsArray.forEach((item) => {
				if (item["bridge-external-id-key"]) {
					extIds[item["bridge-external-id-key"]] = item["bridge-external-id-value"];
				}
			});

			const isIntegration = bridgeName === "br-int" || bridgeName.includes("int");
			const groupType = isIntegration ? "bridge-int" : "bridge-ex";

			let title = `Bridge: <b>${bridgeName}</b><br>`;
			title += `Type: <b>${isIntegration ? "Integration Bridge (br-int)" : "External Bridge (br-ex)"}</b><br>`;
			if (datapathType) title += `Datapath: <b>${datapathType}</b><br>`;

			const managedBy = nodeData["ovsdb:managed-by"];
			let parentHostId = null;
			if (managedBy) {
				const match = managedBy.match(/node\[node-id='([^']+)'\]/);
				if (match) {
					parentHostId = match[1];
				}
			}

			const bridgeNode = {
				id: nodeId,
				label: bridgeName,
				group: groupType,
				value: 25,
				title: title,
				nodeDetails: {
					type: isIntegration ? "Integration Bridge" : "External Bridge",
					bridgeName,
					bridgeUuid,
					nodeId,
					datapathType,
					failMode,
					externalIds: extIds,
					managedBy: parentHostId,
					tps: [],
				},
			};

			nodes.push(bridgeNode);
			bridgeMap[nodeId] = bridgeNode;

			// Add Host -> Bridge Link
			if (parentHostId) {
				const linkKey = `${parentHostId}:${nodeId}`;
				if (!linksMap[linkKey]) {
					links.push({
						from: parentHostId,
						to: nodeId,
						title: `Host ↔ Bridge: <b>${bridgeName}</b>`,
						dashes: true,
						color: { color: "#71717a" },
						width: 1.5,
					});
					linksMap[linkKey] = true;
				}
			}

			// Phase 2: Process Termination Points on Bridge
			const tps = nodeData["termination-point"] || [];
			tps.forEach((tp) => {
				const tpId = tp["tp-id"];
				const ifaceType = tp["ovsdb:interface-type"] || "";

				bridgeNode.nodeDetails.tps.push({
					tpId,
					ofport: tp["ovsdb:ofport"],
					mac: tp["ovsdb:mac-in-use"],
					ifaceType: ifaceType.replace("ovsdb:interface-type-", ""),
				});

				// Check for TAP Port / VM
				const extIfaceIdsArray = tp["ovsdb:interface-external-ids"] || [];
				const extIfaceIds = {};
				extIfaceIdsArray.forEach((item) => {
					if (item["external-id-key"]) {
						extIfaceIds[item["external-id-key"]] = item["external-id-value"];
					}
				});

				const vmUuid =
					extIfaceIds["vm-uuid"] ||
					extIfaceIds["vm_uuid"] ||
					extIfaceIds["instance_id"] ||
					extIfaceIds["nova_instance_id"];
				const attachedMac =
					extIfaceIds["attached-mac"] ||
					extIfaceIds["attached_mac"] ||
					tp["ovsdb:mac-in-use"] ||
					"N/A";
				const ifaceId =
					extIfaceIds["iface-id"] ||
					extIfaceIds["iface_id"] ||
					extIfaceIds["port_id"] ||
					"N/A";
				const ifaceStatus =
					extIfaceIds["iface-status"] ||
					extIfaceIds["iface_status"] ||
					"active";

				// Strict VM detection: only count ports that are definitively
				// attached to a Nova compute instance via their OVSDB external-ids.
				// Exclude infrastructure ports: router (qr-/qg-), HA (ha-),
				// Linux bridge veth pairs (qvo/qvb), DHCP agent, and metadata ports.
				const isInfraPort =
					tpId.startsWith("qvo") ||
					tpId.startsWith("qvb") ||
					tpId.startsWith("qr-") ||
					tpId.startsWith("qg-") ||
					tpId.startsWith("ha-") ||
					tpId.startsWith("patch") ||
					tpId === bridgeName;

				const isVmPort =
					!isInfraPort && Boolean(vmUuid);

				if (isVmPort && !tpId.startsWith("patch") && tpId !== bridgeName) {
					const vmId = vmUuid ? `vm-${vmUuid}` : `vm-${tpId}`;
					const vmShortId = vmUuid ? vmUuid.slice(0, 8) : tpId;

					if (!nodes.some((n) => n.id === vmId)) {
						let vmTitle = `Virtual Machine: <b>${vmShortId}</b><br>`;
						if (vmUuid) vmTitle += `VM UUID: <b>${vmUuid}</b><br>`;
						vmTitle += `MAC: <b>${attachedMac}</b><br>`;
						vmTitle += `Status: <b>${ifaceStatus}</b><br>`;
						vmTitle += `Interface: <b>${tpId}</b>`;

						nodes.push({
							id: vmId,
							label: `VM (${vmShortId})`,
							group: "vm",
							value: 18,
							title: vmTitle,
							nodeDetails: {
								type: "Virtual Machine",
								vmUuid: vmUuid || "N/A",
								mac: attachedMac,
								ifaceId,
								ifaceStatus,
								tapPort: tpId,
								connectedBridge: bridgeName,
							},
						});
					}

					// Link VM -> Bridge
					const vmLinkKey = `${vmId}:${nodeId}`;
					if (!linksMap[vmLinkKey]) {
						const isActive = ifaceStatus.toLowerCase() === "active";
						links.push({
							from: vmId,
							to: nodeId,
							title: `Interface: <b>${tpId}</b><br>MAC: <b>${attachedMac}</b><br>Status: <b>${ifaceStatus}</b>`,
							color: { color: isActive ? "#10b981" : "#9ca3af" },
							width: 2,
						});
						linksMap[vmLinkKey] = true;
					}
				}

				// Check for Patch Port
				const isPatch = ifaceType.includes("patch") || tpId.startsWith("patch-");
				if (isPatch) {
					const options = tp["ovsdb:options"] || [];
					let peerValue = null;
					options.forEach((opt) => {
						if (opt["option"] === "peer") {
							peerValue = opt["value"];
						}
					});

					patchPorts.push({
						tpId,
						peer: peerValue,
						bridgeNodeId: nodeId,
						bridgeName,
					});
				}
			});
		}
	});

	// Phase 3: Match Patch Ports to create inter-bridge links
	patchPorts.forEach((p1) => {
		if (!p1.peer) return;
		const p2 = patchPorts.find((p) => p.tpId === p1.peer);
		if (p2 && p1.bridgeNodeId !== p2.bridgeNodeId) {
			const linkKey1 = `${p1.bridgeNodeId}:${p2.bridgeNodeId}`;
			const linkKey2 = `${p2.bridgeNodeId}:${p1.bridgeNodeId}`;
			if (!linksMap[linkKey1] && !linksMap[linkKey2]) {
				links.push({
					from: p1.bridgeNodeId,
					to: p2.bridgeNodeId,
					title: `Patch Link: <b>${p1.tpId}</b> &harr; <b>${p2.tpId}</b>`,
					color: { color: "#818cf8", highlight: "#6366f1" },
					width: 3.5,
				});
				linksMap[linkKey1] = true;
				linksMap[linkKey2] = true;
			}
		}
	});

	return { nodes, links };
};

export const extractDeviceData = (topology) => {
	const nodes = [];
	const links = [];
	const linksMap = {};
	const topoId = topology?.["topology-id"] || "";
	const topologyNodes = Array.isArray(topology?.node) ? topology.node : [];
	const topologyLinks = Array.isArray(topology?.link) ? topology.link : [];

	// If this is an OVSDB topology, delegate to extractOvsdbData
	if (topoId === "ovsdb:1" || topologyNodes.some((n) => n["node-id"]?.includes("ovsdb"))) {
		return extractOvsdbData(topology);
	}

	// Process OpenFlow / Host Nodes
	if (topologyNodes.length > 0) {
		topologyNodes.forEach((nodeData) => {
			let groupType = "";
			let nodeTitle = "";
			const nodeId = nodeData[TOPOLOGY_CONST.NODE_ID];

			if (!nodeId) {
				return;
			}

			if (nodeId && nodeId.includes("host")) {
				groupType = "host";
				nodeTitle += `ID: <b>${nodeId}</b><br>`;

				const addresses =
					nodeData[TOPOLOGY_CONST.ADDRESSES] ||
					nodeData[TOPOLOGY_CONST.HT_SERVICE_ADDS];

				let ip = "N/A";
				let mac = "N/A";
				let firstSeen = "N/A";
				let lastSeen = "N/A";

				if (Array.isArray(addresses)) {
					const addr = addresses[0];
					if (addr) {
						ip = addr[TOPOLOGY_CONST.IP] || addr[TOPOLOGY_CONST.HT_SERVICE_IP] || "N/A";
						mac = addr[TOPOLOGY_CONST.MAC] || "N/A";
						firstSeen = addr[TOPOLOGY_CONST.FIRST_SEEN];
						lastSeen = addr[TOPOLOGY_CONST.LAST_SEEN];
						nodeTitle += `IP: <b>${ip}</b><br>`;
						nodeTitle += `MAC: <b>${mac}</b><br>`;
						nodeTitle += `First Seen: <b>${firstSeen ? new Date(firstSeen).toLocaleString() : "N/A"}</b><br>`;
						nodeTitle += `Last Seen: <b>${lastSeen ? new Date(lastSeen).toLocaleString() : "N/A"}</b><br>`;
					}
				}

				const attachments = nodeData[TOPOLOGY_CONST.ATTACHMENT_POINTS] || [];
				if (attachments.length > 0) {
					nodeTitle += `Connected Ports:<br>`;
					attachments.forEach((ap) => {
						const port = ap["tp-id"];
						const active = ap["active"] ? "✅" : "❌";
						nodeTitle += `&nbsp;&nbsp;• ${port} ${active}<br>`;
					});
				}

				nodeTitle += "Type: Host";

				nodes.push({
					id: nodeId,
					label: nodeId.replace("host:", "Host: "),
					group: groupType,
					value: 20,
					title: nodeTitle,
					nodeDetails: {
						type: "Host",
						nodeId,
						ip,
						mac,
						firstSeen,
						lastSeen,
						attachments,
					},
				});
			} else {
				groupType = "switch";
				nodeTitle += `Name: <b>${nodeId}</b><br>Type: Switch<br>Ports:<br>`;

				const tps = nodeData["termination-point"] || [];
				tps.forEach((tp) => {
					const tpId = tp["tp-id"];
					nodeTitle += `&nbsp;&nbsp;• ${tpId}<br>`;
				});

				nodes.push({
					id: nodeId,
					label: nodeId,
					group: groupType,
					value: 20,
					title: nodeTitle,
					nodeDetails: {
						type: "OpenFlow Switch",
						nodeId,
						ports: tps.map((tp) => tp["tp-id"]),
					},
				});
			}
		});
	}

	// Process Links
	if (topologyLinks.length > 0) {
		topologyLinks.forEach((linkData) => {
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
			if (mac && connectorId && !connectorId.includes("LOCAL")) {
				const portSuffix =
					portName?.split("-")?.[1] || connectorId.split(":").pop() || connectorId;
				connectorMap[connectorId] = {
					mac,
					port: portSuffix,
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

		if (srcConnectorId && connectorMap[srcConnectorId]) {
			portDots.push({
				id: `dot-${index}-src`,
				source: link.from,
				target: link.to,
				mac: connectorMap[srcConnectorId].mac,
				port: connectorMap[srcConnectorId].port,
			});
		}

		if (dstConnectorId && connectorMap[dstConnectorId]) {
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
