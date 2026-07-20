import { useEffect, useState } from "react";
import { getNodes, addNode, updateNode, deleteNode, connectWebSocket } from "./Api";

export default function NodeManager() {
  const [nodes, setNodes] = useState([]);
  const [newNode, setNewNode] = useState({ id: "", ip: "", status: "up" });
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchNodes();
    const socket = connectWebSocket((data) => {
      console.log("Update received:", data);
      fetchNodes(); // Refresh data on WebSocket event
    });
    return () => socket.close();
  }, []);

  const fetchNodes = async () => {
    const data = await getNodes();
    if (data.node) setNodes(data.node);
  };

  const handleAddNode = async () => {
    if (!newNode.id || !newNode.ip) return setError("ID and IP are required!");
    const success = await addNode(newNode);
    if (success) {
      fetchNodes();
      setNewNode({ id: "", ip: "", status: "up" });
    } else {
      setError("Failed to add node.");
    }
  };

  const handleUpdateStatus = async (id, status) => {
    const success = await updateNode(id, status);
    if (!success) setError("Failed to update node.");
  };

  const handleDeleteNode = async (id) => {
    const success = await deleteNode(id);
    if (!success) setError("Failed to delete node.");
  };


  return (
    <div className="container mx-auto mt-4">
      <div className="card shadow p-4 max-w-md mx-auto">
        <h2 className="text-center mb-3">Node Manager</h2>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="mb-3">
          <div className="input-group mb-2">
            <input
              className="border p-2 rounded w-full"
              type="text"
              placeholder="Node ID"
              value={newNode.id}
              onChange={(e) => setNewNode({ ...newNode, id: e.target.value })}
            />
          </div>
          <div className="input-group mb-2">
            <input
              className="border p-2 rounded w-full"
              type="text"
              placeholder="IP Address"
              value={newNode.ip}
              onChange={(e) => setNewNode({ ...newNode, ip: e.target.value })}
            />
          </div>
          <button className="btn btn-primary w-100" onClick={handleAddNode}>
            Add Node
          </button>
        </div>

        <ul className="list-group">
          {nodes.length > 0 ? (
            nodes.map((node) => (
              <li key={node.id} className="list-group-item d-flex justify-content-between align-items-center">
                <div>
                  <strong>{node.id}</strong> - {node.ip} -{" "}
                  <span className={`badge ${node.status === "up" ? "bg-success" : "bg-danger"}`}>
                    {node.status}
                  </span>
                </div>
                <div>
                  <button
                    className="btn btn-warning btn-sm me-2"
                    onClick={() => handleUpdateStatus(node.id, node.status === "up" ? "down" : "up")}
                  >
                    Toggle
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteNode(node.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))
          ) : (
            <li className="list-group-item text-muted text-center">No nodes available</li>
          )}
        </ul>
      </div>
    </div>
  );

}
