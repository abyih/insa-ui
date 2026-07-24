import axios from "axios";

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
    const { data } = await flowApi.get(
      "opendaylight-inventory:nodes?content=nonconfig"
    );
    const nodeList = data?.["opendaylight-inventory:nodes"]?.node || [];
    return nodeList;
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
    return node["flow-node-inventory:table"] || [];
  } catch (error) {
    if (error?.response?.status === 404 || error?.response?.status === 409) {
      return [];
    }
    throw new Error(getErrorMessage(error));
  }
}

export async function getFlows(nodeId, tableId) {
  try {
    const { data } = await flowApi.get(
      `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}?content=nonconfig`
    );
    const tableList = data?.["flow-node-inventory:table"] || [];
    const table = tableList.find(t => String(t.id) === String(tableId)) || tableList[0] || {};
    return table.flow || [];
  } catch (error) {
    if (error?.response?.status === 404 || error?.response?.status === 409) {
      return [];
    }
    throw new Error(getErrorMessage(error));
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
