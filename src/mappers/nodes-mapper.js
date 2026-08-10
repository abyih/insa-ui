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
	const seenIds = new Set();

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
		const type = id.startsWith("host:") ? "Host" : "OpenFlow Switch";
		seenIds.add(id);

		mappedNodes.push({
			id,
			type,
			connectors,
			status,
		});
	});

	// 2. Map DevStack / OVSDB / Network Topology nodes
	const topoNodes = topologyData?.nodes || [];
	topoNodes.forEach((tn) => {
		if (!tn || !tn.id || seenIds.has(tn.id)) return;
		seenIds.add(tn.id);

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
				: "Switch");

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

		mappedNodes.push({
			id: tn.id,
			type,
			connectors,
			status,
			nodeDetails,
		});
	});

	return mappedNodes;
};
