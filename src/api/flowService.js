import axios from "axios";
import NetworkTopologySvc from "../Pages/Topology/TopologyService";

const flowApi = axios.create({
  baseURL: "/api/rests/data",
  timeout: 10000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  auth: {
    username: "admin",
    password: "admin",
  },
});

const getErrorMessage = (error) => {
  if (error?.response?.data) {
    const data = error.response.data;
    if (typeof data === "string") return data;
    if (typeof data === "object") {
      return JSON.stringify(data);
    }
  }
  return error?.message || "Request failed";
};

export async function getInventoryNodes() {
  try {
    const [invRes, topoRes] = await Promise.all([
      flowApi.get("opendaylight-inventory:nodes?content=nonconfig").catch(() => null),
      NetworkTopologySvc.getNode("all").catch(() => null),
    ]);

    const inventoryNodes = invRes?.data?.["opendaylight-inventory:nodes"]?.node || [];
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
    throw new Error(getErrorMessage(error));
  }
}

export async function getNodeTables(nodeId) {
  try {
    const { data } = await flowApi.get(
      `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}?content=nonconfig`
    );
    const node = data?.["opendaylight-inventory:node"]?.[0] || {};
    const tables = node["flow-node-inventory:table"] || [];
    if (tables.length > 0) return tables;
    return [{ id: 0 }];
  } catch (error) {
    if (error?.response?.status === 404 || error?.response?.status === 409) {
      return [{ id: 0 }];
    }
    return [{ id: 0 }];
  }
}

export async function getFlows(nodeId, tableId) {
  try {
    const { data } = await flowApi.get(
      `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}?content=nonconfig`
    );
    const tableList = data?.["flow-node-inventory:table"] || [];
    const table = tableList.find((t) => String(t.id) === String(tableId)) || tableList[0] || {};
    return table.flow || [];
  } catch (error) {
    if (error?.response?.status === 404 || error?.response?.status === 409) {
      return [];
    }
    return [];
  }
}

export async function deleteFlow(nodeId, tableId, flowId) {
  try {
    await flowApi.delete(
      `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}/flow-node-inventory:flow=${encodeURIComponent(flowId)}`
    );
    return true;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function putFlow(nodeId, tableId, flowId, flowBody) {
  try {
    await flowApi.put(
      `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}/flow-node-inventory:flow=${encodeURIComponent(flowId)}`,
      flowBody
    );
    return true;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
