import axios from "axios";

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
  const url = "opendaylight-inventory:nodes";
  try {
    const { data } = await flowManagerApi.get(url);
    return data?.["opendaylight-inventory:nodes"]?.node || [];
  } catch (error) {
    throw new Error(getErrorBody(error));
  }
}

export async function getNodeTables(nodeId) {
  const url = `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table`;
  try {
    const { data } = await flowManagerApi.get(url);
    return data?.["flow-node-inventory:table"] || [];
  } catch (error) {
    throw new Error(getErrorBody(error));
  }
}

export async function getFlows(nodeId, tableId) {
  const url = `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}/flow`;
  try {
    const { data } = await flowManagerApi.get(url);
    return data?.["flow-node-inventory:flow"] || [];
  } catch (error) {
    throw new Error(getErrorBody(error));
  }
}

export async function deleteFlow(nodeId, tableId, flowId) {
  const url = `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}/flow=${encodeURIComponent(flowId)}`;
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
  const url = `opendaylight-inventory:nodes/node=${encodeURIComponent(nodeId)}/flow-node-inventory:table=${encodeURIComponent(tableId)}/flow=${encodeURIComponent(flowId)}`;
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
