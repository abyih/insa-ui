import {
  getNodes as fetchInventoryNodes,
  getNodeTables as fetchNodeTables,
  getFlows as fetchNodeFlows,
  deleteFlow as removeFlow,
  updateFlow as putNodeFlow,
  installFlow as postNodeFlow,
} from "./api-controller";
import NetworkTopologySvc from "../Pages/Topology/TopologyService";

const getErrorBody = (error) => {
  if (error?.response?.data) {
    if (typeof error.response.data === "string") return error.response.data;
    if (typeof error.response.data === "object") {
      try {
        return JSON.stringify(error.response.data, null, 2);
      } catch {
        return String(error.response.data);
      }
    }
  }
  return error?.message || "Request failed";
};

export async function getInventoryNodes() {
  try {
    const [invRes, topoRes] = await Promise.all([
      fetchInventoryNodes().catch(() => null),
      NetworkTopologySvc.getNode("all").catch(() => null),
    ]);

    const inventoryNodes = invRes?.["opendaylight-inventory:nodes"]?.node || [];
    const topoNodes = topoRes?.nodes || [];

    const nodesList = [];
    const seenIds = new Set();

    // 1. Process OpenFlow inventory nodes
    inventoryNodes.forEach((node) => {
      const id = node.id || node["id"];
      if (id) {
        seenIds.add(id);
        const type = id.startsWith("host:") ? "Host" : "OpenFlow Switch";
        nodesList.push({ id, type });
      }
    });

    // 2. Process DevStack OVSDB / Topology nodes
    topoNodes.forEach((tn) => {
      if (!tn || !tn.id || seenIds.has(tn.id)) return;
      seenIds.add(tn.id);
      const type =
        tn.nodeDetails?.type ||
        (tn.group === "ovs-host"
          ? "OVS Host"
          : tn.group === "vm"
          ? "Virtual Machine"
          : tn.group === "bridge-int"
          ? "Integration Bridge"
          : tn.group === "bridge-ex"
          ? "External Bridge"
          : "Switch");
      nodesList.push({ id: tn.id, type });
    });

    return nodesList;
  } catch (error) {
    throw new Error(getErrorBody(error));
  }
}

export async function getNodeTables(nodeId) {
  try {
    const res = await fetchNodeTables(nodeId);
    return res?.["flow-node-inventory:table"] || [{ id: 0 }];
  } catch (error) {
    return [{ id: 0 }];
  }
}

export async function getFlows(nodeId, tableId) {
  try {
    const flows = await fetchNodeFlows(nodeId, tableId);
    return flows || [];
  } catch (error) {
    return [];
  }
}

export async function deleteFlow(nodeId, tableId, flowId) {
  try {
    await removeFlow(nodeId, tableId, flowId);
    return true;
  } catch (error) {
    throw new Error(getErrorBody(error));
  }
}

export async function putFlow(nodeId, tableId, flowId, flowBody) {
  try {
    await postNodeFlow(nodeId, tableId, flowId, flowBody);
    return true;
  } catch (error) {
    throw new Error(getErrorBody(error));
  }
}
