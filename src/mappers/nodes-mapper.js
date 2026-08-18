import { toMbps, formatDuration } from "../utils/helper";

// export const mapNodes = (rawData) => {
// 	const nodes = rawData?.["network-topology"]?.topology?.[0]?.node || [];

// 	return nodes.map((node) => ({
// 		id: node["node-id"],
// 		type: node["host-tracker-service:addresses"] ? "host" : "switch",
// 		addresses: node["host-tracker-service:addresses"] || [],
// 		terminationPoints: node["termination-point"] || [],
// 	}));
// };

export const mapNodeConnectors = (connectors = []) => {
	console.log(connectors);
	return connectors.map((conn) => {
		const stats =
			conn[
				"opendaylight-port-statistics:flow-capable-node-connector-statistics"
			] || {};
		const state = conn["flow-node-inventory:state"] || {};

		return {
			id: conn.id,
			name: conn["flow-node-inventory:name"],
			portNumber: conn["flow-node-inventory:port-number"],
			mac: conn["flow-node-inventory:hardware-address"],
			currentSpeedMbps: toMbps(
				conn["flow-node-inventory:current-speed"] || 0
			),
			maxSpeedMbps: toMbps(
				conn["flow-node-inventory:maximum-speed"] || 0
			),
			currentFeature: conn["flow-node-inventory:current-feature"],
			state: {
				linkDown: state["link-down"],
				blocked: state["blocked"],
				live: state["live"],
			},
			stpStatus:
				conn["stp-status-aware-node-connector:status"] || "unknown",
			packetStats: {
				tx: stats.packets?.transmitted ?? 0,
				rx: stats.packets?.received ?? 0,
				txBytes: stats.bytes?.transmitted ?? 0,
				rxBytes: stats.bytes?.received ?? 0,
			},
			uptime: formatDuration(stats.duration),
		};
	});
};

export const mapNodes = (rawData, topologyData) => {
	const inventoryNodes = rawData?.["opendaylight-inventory:nodes"]?.node || [];
	const mappedNodes = [];
	const nodeMap = new Map();

	// 1. Map OpenFlow inventory nodes
	inventoryNodes.forEach((node) => {
		const connectors = mapNodeConnectors(node["node-connector"] || []);

		let status = "unknown";
		const allDown = connectors.length > 0 && connectors.every((c) => c.state.linkDown);
		const anyLive = connectors.some((c) => c.state.live && !c.state.blocked);
		const anyBlocked = connectors.some((c) => c.state.blocked);

		if (allDown) status = "down";
		else if (anyLive) status = "up";
		else if (anyBlocked) status = "blocked";
		else status = "up";

		const id = node.id;
		const hw = node["flow-node-inventory:hardware"] || "";
		const hasBrInt = connectors.some(
			(c) =>
				c.name === "br-int" ||
				c.name?.startsWith("tap") ||
				c.name?.startsWith("patch-br-int")
		);
		const isOvsdb = id.includes("ovsdb") || hw.includes("Host");
		const isBridge = hasBrInt || hw.includes("Bridge") || id.includes("br-int");

		const type = isBridge
			? "Integration Bridge"
			: isOvsdb
			? "OVS Host"
			: id.startsWith("host:")
			? "Host"
			: "OpenFlow Switch";

		const mapped = {
			id,
			type,
			connectors,
			status,
		};
		nodeMap.set(id, mapped);
		mappedNodes.push(mapped);
	});

	// 2. Map DevStack / OVSDB / Network Topology nodes
	const topoNodes = topologyData?.nodes || [];
	topoNodes.forEach((tn) => {
		if (!tn || !tn.id) return;

		const nodeDetails = tn.nodeDetails || {};
		const type =
			nodeDetails.type ||
			(tn.group === "ovs-host"
				? "OVS Host"
				: tn.group === "vm"
				? "Virtual Machine"
				: tn.group === "bridge-int"
				? "Integration Bridge"
				: tn.group === "bridge-ex"
				? "External Bridge"
				: tn.group === "host"
				? "Host"
				: "OpenFlow Switch");

		let status = "up";
		if (type === "Virtual Machine" && nodeDetails.ifaceStatus) {
			status = nodeDetails.ifaceStatus.toLowerCase() === "active" ? "up" : "down";
		}

		let connectors = [];
		if (nodeDetails.tps && Array.isArray(nodeDetails.tps)) {
			connectors = nodeDetails.tps.map((tp) => ({
				id: tp.tpId,
				name: tp.tpId + (tp.ifaceType ? ` (${tp.ifaceType})` : ""),
				mac: tp.mac || "N/A",
				state: { live: true },
			}));
		} else if (nodeDetails.tapPort) {
			connectors = [
				{
					id: nodeDetails.tapPort,
					name: `${nodeDetails.tapPort} (MAC: ${nodeDetails.mac || "N/A"})`,
					mac: nodeDetails.mac || "N/A",
					state: { live: status === "up" },
				},
			];
		} else if (tn.id) {
			connectors = [
				{
					id: tn.id,
					name: tn.label || tn.id,
					state: { live: true },
				},
			];
		}

		if (nodeMap.has(tn.id)) {
			const existing = nodeMap.get(tn.id);
			if (type !== "OpenFlow Switch") {
				existing.type = type;
			}
			existing.nodeDetails = { ...existing.nodeDetails, ...nodeDetails };
			if (connectors.length > existing.connectors.length) {
				existing.connectors = connectors;
			}
		} else {
			const newNode = {
				id: tn.id,
				type,
				connectors,
				status,
				nodeDetails,
			};
			nodeMap.set(tn.id, newNode);
			mappedNodes.push(newNode);
		}
	});

	return mappedNodes;
};
