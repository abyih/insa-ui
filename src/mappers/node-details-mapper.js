import { toMbps, formatDuration } from "../utils/helper";

export const mapNodeDetails = (rawData) => {
	const node = rawData["opendaylight-inventory:node"]?.[0];
	if (!node) return null;

	const mapConnectors = (connectors = []) =>
		connectors.map((c) => {
			const stats =
				c[
					"opendaylight-port-statistics:flow-capable-node-connector-statistics"
				] || {};
			const state = c["flow-node-inventory:state"] || {};

			return {
				id: c.id,
				name: c["flow-node-inventory:name"],
				portNumber: c["flow-node-inventory:port-number"],
				mac: c["flow-node-inventory:hardware-address"],
				currentSpeedMbps: toMbps(
					c["flow-node-inventory:current-speed"] || 0
				),
				maxSpeedMbps: toMbps(
					c["flow-node-inventory:maximum-speed"] || 0
				),
				currentFeature: c["flow-node-inventory:current-feature"],
				supportedFeatures: c["flow-node-inventory:supported"],
				peerFeatures: c["flow-node-inventory:peer-features"],
				advertisedFeatures:
					c["flow-node-inventory:advertised-features"],
				configuration: c["flow-node-inventory:configuration"],
				stpStatus: c["stp-status-aware-node-connector:status"] || null,
				state: {
					linkDown: state["link-down"],
					blocked: state["blocked"],
					live: state["live"],
				},
				packetStats: {
					tx: stats.packets?.transmitted ?? 0,
					rx: stats.packets?.received ?? 0,
					txBytes: stats.bytes?.transmitted ?? 0,
					rxBytes: stats.bytes?.received ?? 0,
				},
				errors: {
					receiveErrors: stats["receive-errors"] ?? 0,
					transmitErrors: stats["transmit-errors"] ?? 0,
					crcErrors: stats["receive-crc-error"] ?? 0,
					drops: {
						receive: stats["receive-drops"] ?? 0,
						transmit: stats["transmit-drops"] ?? 0,
					},
					collisions: stats["collision-count"] ?? 0,
					frameErrors: stats["receive-frame-error"] ?? 0,
					overrun: stats["receive-over-run-error"] ?? 0,
				},
				uptime: formatDuration(stats.duration),
			};
		});

	const mapFlowTables = (tables = []) =>
		tables.map((table) => {
			const stats =
				table[
					"opendaylight-flow-table-statistics:flow-table-statistics"
				] || {};
			const flows = table.flow || [];

			return {
				id: table.id,
				stats: {
					activeFlows: stats["active-flows"],
					packetsMatched: stats["packets-matched"],
					packetsLookedUp: stats["packets-looked-up"],
				},
				flows: flows.map((flow) => ({
					id: flow.id,
					priority: flow.priority,
					cookie: flow.cookie,
					match: flow.match,
					instructions: flow.instructions || null,
					stats: {
						packets:
							flow[
								"opendaylight-flow-statistics:flow-statistics"
							]?.["packet-count"] ?? 0,
						bytes:
							flow[
								"opendaylight-flow-statistics:flow-statistics"
							]?.["byte-count"] ?? 0,
						duration: formatDuration(
							flow["opendaylight-flow-statistics:flow-statistics"]
								?.duration
						),
					},
				})),
			};
		});

	return {
		id: node.id,
		metadata: {
			ip: node["flow-node-inventory:ip-address"],
			hardware: node["flow-node-inventory:hardware"],
			description: node["flow-node-inventory:description"],
			manufacturer: node["flow-node-inventory:manufacturer"],
			serial: node["flow-node-inventory:serial-number"],
			software: node["flow-node-inventory:software"],
		},
		connectors: mapConnectors(node["node-connector"]),
		flowTables: mapFlowTables(node["flow-node-inventory:table"]),
		groupFeatures: {
			capabilities:
				node["opendaylight-group-statistics:group-features"]?.[
					"group-capabilities-supported"
				] || [],
			types:
				node["opendaylight-group-statistics:group-features"]?.[
					"group-types-supported"
				] || [],
			maxGroups:
				node["opendaylight-group-statistics:group-features"]?.[
					"max-groups"
				] || [],
			actions:
				node["opendaylight-group-statistics:group-features"]?.[
					"actions"
				] || [],
		},
		snapshot: {
			start: node["flow-node-inventory:snapshot-gathering-status-start"]
				?.begin,
			end: node["flow-node-inventory:snapshot-gathering-status-end"]?.end,
			succeeded:
				node["flow-node-inventory:snapshot-gathering-status-end"]
					?.succeeded,
		},
		features: node["flow-node-inventory:switch-features"] || {},
	};
};
