// const BASE_URL = "http://localhost:8181/restconf/data";
const AUTH_HEADER = {
  Authorization: "Basic " + btoa("admin:admin"), // Encode credentials
  "Content-Type": "application/json",
  Accept: "application/json",
};

// Fetch nodes
export const getNodes = async () => {
  try {
    // const response = await fetch(`${BASE_URL}/example-network:network/node`, {
        // const response = await fetch(`${BASE_URL}/example-network:network/node`, {
         const response=await fetch("/restconf/data/example-network:network/node",{
      method: "GET",
      headers: AUTH_HEADER,
    });
    return response.ok ? await response.json() : null;
  } catch (error) {
    console.error("Error fetching nodes:", error);
    return null;
  }
};

// Add node
export const addNode = async (node) => {
  try {
    const response = await fetch(`${BASE_URL}/example-network:network/node`, {
      method: "POST",
      headers: AUTH_HEADER,
      body: JSON.stringify({ node }),
    });
    return response.ok;
  } catch (error) {
    console.error("Error adding node:", error);
    return false;
  }
};

// Update node status
export const updateNode = async (id, status) => {
  try {
    const response = await fetch(`${BASE_URL}/example-network:network/node/${id}`, {
      method: "PUT",
      headers: AUTH_HEADER,
      body: JSON.stringify({ status }),
    });
    return response.ok;
  } catch (error) {
    console.error("Error updating node:", error);
    return false;
  }
};

// Delete node
export const deleteNode = async (id) => {
  try {
    const response = await fetch(`${BASE_URL}/example-network:network/node/${id}`, {
      method: "DELETE",
      headers: AUTH_HEADER,
    });
    return response.ok;
  } catch (error) {
    console.error("Error deleting node:", error);
    return false;
  }
};

// WebSocket connection (if needed)
export const connectWebSocket = (onMessage) => {
  const socket = new WebSocket("ws://localhost:8181/websocket");
  socket.onmessage = (event) => onMessage(JSON.parse(event.data));
  return socket;
};
