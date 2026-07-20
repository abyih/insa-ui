import axios from "axios";
import ENV from "./env";

const BASE_URL = ENV.getBaseURL("MD_SAL");

const NodeInventoryService = {
	getAllNodes: async () => {
		try {
			const response = await fetch(
				"http://localhost:8181/restconf/operational/opendaylight-inventory:nodes",
				{
					headers: {
						Authorization: "Basic " + btoa("admin:admin"), // Replace with correct credentials if necessary
					},
				}
			);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();
			console.log("Raw API Response:", data);
			return data;
		} catch (error) {
			console.error("Error fetching nodes:", error);
		}
	},

	getNode: async (nodeId) => {
		try {
			// const response = await axios.get(`http:127.0.0.1:8181/restconf/operational/opendaylight-inventory:nodes/node/${nodeId}`);
			const response = await axios.get(
				`${BASE_URL}/restconf/operational/opendaylight-inventory:nodes/node/${nodeId}`,
				{
					headers: {
						Authorization: "Basic " + btoa("admin:admin"), // Replace with correct credentials if necessary
					},
				}
			);
			console.log(response.data.node[0]);
			// console.log(response.data.nodes.node[0]);
			return response.data.node[0];
		} catch (error) {
			console.error(
				"Error fetching node:",
				error.response || error.message
			);
			throw error;
		}
	},
};

export default NodeInventoryService;
