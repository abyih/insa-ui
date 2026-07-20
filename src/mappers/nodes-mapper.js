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

export const mapNodes = (rawData) => {
	const nodes = rawData["opendaylight-inventory:nodes"]?.node || [];

	return nodes.map((node) => {
		const connectors = mapNodeConnectors(node["node-connector"] || []);

		// Determine overall node status (based on its connectors)
		let status = "unknown";
		const allDown = connectors.every((c) => c.state.linkDown);
		const anyLive = connectors.some(
			(c) => c.state.live && !c.state.blocked
		);
		const anyBlocked = connectors.some((c) => c.state.blocked);

		if (allDown) status = "down";
		else if (anyLive) status = "up";
		else if (anyBlocked) status = "blocked";
 
		const id = node.id;
		const type = id.startsWith("host:") ? "Host" : "Switch";
		return {
			id: node.id,
			type,
			connectors,
			status,
		};
	});
};
