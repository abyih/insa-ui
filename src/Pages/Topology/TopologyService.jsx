import {
	extractDeviceData,
	extractOvsdbData,
	extractDevices,
	generatePortDots,
} from "./TopologyUtils";

const ODL_API_BASE = "/api/rests/data";
const ODL_LEGACY_BASE = "/api/restconf/operational";

const ENV = {
	getBaseURL: (serviceName) => {
		const baseUrls = {
			MD_SAL: "http://localhost:8181",
		};
		return baseUrls[serviceName] || "";
	},
};

const TOPOLOGY_CONST = {
	HT_SERVICE_ID: "host-tracker-service:id",
	IP: "ip",
	HT_SERVICE_ATTPOINTS: "host-tracker-service:attachment-points",
	HT_SERVICE_TPID: "host-tracker-service:tp-id",
	NODE_ID: "node-id",
	SOURCE_NODE: "source-node",
	DEST_NODE: "dest-node",
	SOURCE_TP: "source-tp",
	DEST_TP: "dest-tp",
	ADDRESSES: "addresses",
	HT_SERVICE_ADDS: "host-tracker-service:addresses",
	HT_SERVICE_IP: "host-tracker-service:ip",
};

const NetworkTopologySvc = {
	base() {
		return `${ENV.getBaseURL(
			"MD_SAL"
		)}/rests/data/network-topology:network-topology`;
	},

	async requestJson(paths) {
		for (const path of paths) {
			const response = await fetch(path, {
				method: "GET",
				headers: {
					Authorization: "Basic " + btoa("admin:admin"),
					Accept: "application/json",
				},
			});

			if (!response.ok) {
				if (response.status === 404 || response.status === 409) {
					continue;
				}

				const text = await response.text();
				throw new Error(`Request failed (${response.status}): ${text}`);
			}

			return response.json();
		}

		throw new Error("Topology endpoint not found on current ODL instance");
	},

	async getNode(targetTopology = "all") {
		try {
			const [topologies, inventory] = await Promise.all([
				this.fetchAllTopologies(),
				this.fetchInventory(),
			]);

			if (!topologies || topologies.length === 0) {
				throw new Error("Topology is undefined — check API response or node ID");
			}

			let allNodes = [];
			let allLinks = [];
			const addedNodeIds = new Set();
			const addedLinkKeys = new Set();

			// Filter topologies based on targetTopology ('all' | 'ovsdb:1' | 'flow:1')
			const targetTopos = topologies.filter((t) => {
				const topoId = t?.["topology-id"];
				if (targetTopology === "all" || targetTopology === "merged") return true;
				return topoId === targetTopology;
			});

			// If specific filter yielded no matching topologies, return empty
			const toProcess = targetTopos;

			toProcess.forEach((topology) => {
				const topoId = topology?.["topology-id"] || "";
				let result = { nodes: [], links: [] };

				if (topoId === "ovsdb:1" || topology?.node?.some((n) => n["node-id"]?.includes("ovsdb"))) {
					result = extractOvsdbData(topology);
				} else {
					result = extractDeviceData(topology, inventory);
				}

				// Deduplicate nodes
				result.nodes.forEach((n) => {
					if (!addedNodeIds.has(n.id)) {
						addedNodeIds.add(n.id);
						allNodes.push(n);
					}
				});

				// Deduplicate links (use || separator to avoid collision with node IDs containing colons)
				result.links.forEach((l) => {
					const key1 = `${l.from}||${l.to}`;
					const key2 = `${l.to}||${l.from}`;
					if (!addedLinkKeys.has(key1) && !addedLinkKeys.has(key2)) {
						addedLinkKeys.add(key1);
						addedLinkKeys.add(key2);
						allLinks.push(l);
					}
				});
			});

			const dots = generatePortDots(allLinks, inventory || []);
			console.log("Processed Nodes:", allNodes);
			console.log("Processed Links:", allLinks);
			console.log("Processed Dots:", dots);

			return { nodes: allNodes, links: allLinks, dots, rawTopologies: topologies };
		} catch (error) {
			console.error("Error in getNode:", error);
			throw error;
		}
	},

	async fetchAllTopologies() {
		try {
			const data = await this.requestJson([
				`${ODL_API_BASE}/network-topology:network-topology?content=nonconfig`,
				`${ODL_API_BASE}/network-topology:network-topology?content=operational`,
				`${ODL_API_BASE}/network-topology:network-topology`,
				`${ODL_LEGACY_BASE}/network-topology:network-topology/`,
			]);
			const topologies =
				data?.["network-topology:network-topology"]?.topology ||
				data?.["network-topology:topology"] ||
				data?.topology ||
				[];
			return Array.isArray(topologies) ? topologies : [topologies];
		} catch (err) {
			console.error("Topology fetch error:", err);
			throw err;
		}
	},

	async fetchTopology(node) {
		const topologies = await this.fetchAllTopologies();
		const topology = topologies.find((item) => item?.["topology-id"] === node) || topologies[0];
		if (!topology) {
			throw new Error("Topology payload did not contain network-topology:topology");
		}
		return topology;
	},
	async fetchInventory() {
		try {
			const invData = await this.requestJson([
				`${ODL_API_BASE}/opendaylight-inventory:nodes?content=nonconfig`,
				`${ODL_API_BASE}/opendaylight-inventory:nodes?content=operational`,
				`${ODL_API_BASE}/opendaylight-inventory:nodes`,
				`${ODL_LEGACY_BASE}/opendaylight-inventory:nodes/`,
			]);
			console.log(invData);
			return (
				invData?.["opendaylight-inventory:nodes"]?.node ||
				invData?.["opendaylight-inventory:nodes"]?.["opendaylight-inventory:node"] ||
				invData?.node ||
				[]
			);
		} catch (err) {
			console.error("Failed to fetch inventory:", err);
			return [];
		}
	},
};

export default NetworkTopologySvc;