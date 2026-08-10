import axios from "axios";
import NetworkTopologySvc from "../Pages/Topology/TopologyService";

const authHeader = () => ({
  Authorization: "Basic " + btoa("admin:admin"),
});

const flowManagerApi = axios.create({
  baseURL: "/api/rests/data",
  timeout: 10000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...authHeader(),
  },
  auth: {
    username: "admin",
    password: "admin",
  },
});

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

const formatUrl = (path) => `/api/rests/data/${path}`;

export async function getInventoryNodes() {
  const url = "opendaylight-inventory:nodes?content=nonconfig";
  try {
    const [invRes, topoRes] = await Promise.all([
      flowManagerApi.get(url).catch(() => null),
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
    throw new Error(getErrorBody(error));
  }
}

export async function getNodeTables(nodeId) {
  const url = `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}?content=nonconfig`;
  try {
    const { data } = await flowManagerApi.get(url);
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
  const url = `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}?content=config`;
  try {
    const { data } = await flowManagerApi.get(url);
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
  const url = `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}/flow-node-inventory:flow=${encodeURIComponent(flowId)}`;
  console.log(`[FlowManager] DELETE ${formatUrl(url)}`);

  try {
    const response = await flowManagerApi.delete(url, {
      headers: authHeader(),
    });
    console.log(`[FlowManager] DELETE ${formatUrl(url)} -> ${response.status}`, response.data ?? "");
    return true;
  } catch (error) {
    console.log(`[FlowManager] DELETE ${formatUrl(url)} failed -> ${error.response?.status ?? "network"}`, getErrorBody(error));
    throw new Error(getErrorBody(error));
  }
}

export async function putFlow(nodeId, tableId, flowId, flowBody) {
  const url = `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}/flow-node-inventory:flow=${encodeURIComponent(flowId)}`;
  console.log(`[FlowManager] PUT ${formatUrl(url)}`);

  try {
    const response = await flowManagerApi.put(url, flowBody, {
      headers: authHeader(),
    });
    console.log(`[FlowManager] PUT ${formatUrl(url)} -> ${response.status}`, response.data ?? "");
    return true;
  } catch (error) {
    console.log(`[FlowManager] PUT ${formatUrl(url)} failed -> ${error.response?.status ?? "network"}`, getErrorBody(error));
    throw new Error(getErrorBody(error));
  }
}
