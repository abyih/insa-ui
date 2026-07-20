import axios from "axios";
import {
	extractDeviceData,
	extractDevices,
	generatePortDots,
} from "./TopologyUtils";

const ODL_API_BASE = "/api/rests/data";

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

	async getNode(node) {
		try {
			const [topology, inventory] = await Promise.all([
				this.fetchTopology(node),
				this.fetchInventory(),
			]);
				if (!topology) {
			throw new Error("Topology is undefined — check API response or node ID");
		}
			const { nodes, links } = extractDeviceData(topology);
			const dots = generatePortDots(links, inventory);
			console.log("Processed Nodes:", nodes);
			console.log("Processed Links:", links);
			console.log("Processed Inventories:", inventory);
			console.log("Processed Dots:", dots);

			return { nodes, links, dots };
		} catch (error) {
			console.error("Error in getNode:", error);
			throw error;
		}
	},
	async fetchTopology(node) {
		try {
			const response = await fetch(
				`${ODL_API_BASE}/network-topology:network-topology/topology=${encodeURIComponent(node)}`,
				{
					method: "GET",
					headers: {
						Authorization: "Basic " + btoa("admin:admin"),
						Accept: "application/json",
					},
				}
			);
			if (!response.ok) {
				const text = await response.text();
				throw new Error(`Topology request failed (${response.status}): ${text}`);
			}
			const data = await response.json();
			const topology = data?.["network-topology:topology"]?.[0];
			if (!topology) {
				throw new Error("Topology payload did not contain network-topology:topology");
			}
			return topology;
		} catch (err) {
			console.error("Topology fetch error:", err);
			throw err;
		}
	},
	async fetchInventory() {
		try {
			const response = await fetch(
				`${ODL_API_BASE}/opendaylight-inventory:nodes`,
				{
					method: "GET",
					headers: {
						Authorization: "Basic " + btoa("admin:admin"),
						Accept: "application/json",
					},
				}
			);
			if (!response.ok) {
				const text = await response.text();
				throw new Error(`Inventory request failed (${response.status}): ${text}`);
			}
			const invData = await response.json();
			console.log(invData);
			return invData?.["opendaylight-inventory:nodes"]?.node || [];
		} catch (err) {
			console.error("Failed to fetch inventory:", err);
			return [];
		}
	},
};

export default NetworkTopologySvc;