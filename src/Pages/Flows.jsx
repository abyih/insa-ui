import React, { useEffect, useMemo, useState } from "react";
import { getInventoryNodes, getNodeTables, getFlows, deleteFlow, putFlow } from "../api/flowService";

const emptyForm = {
  flowId: "",
  priority: 1000,
  match: "",
  instructions: "",
  idleTimeout: "",
  hardTimeout: "",
};

function Flows() {
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState("");
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    const loadNodes = async () => {
      try {
        const inventoryNodes = await getInventoryNodes();
        setNodes(inventoryNodes || []);
        const firstNode = inventoryNodes?.[0]?.id || inventoryNodes?.[0]?.["id"] || "";
        if (firstNode) {
          setSelectedNode(firstNode);
        }
      } catch (error) {
        setMessage(error.message || "Unable to load nodes.");
      }
    };

    loadNodes();
  }, []);

  useEffect(() => {
    if (!selectedNode) return;

    const loadTablesForNode = async () => {
      try {
        const tableList = await getNodeTables(selectedNode);
        const normalizedTables = (tableList || []).map((table) => ({
          id: table.id ?? table["id"] ?? table["flow-node-inventory:table-id"],
          data: table,
        }));
        setTables(normalizedTables);
        if (normalizedTables.length) {
          setSelectedTable((current) => (normalizedTables.some((table) => table.id === current) ? current : normalizedTables[0].id));
        } else {
          setSelectedTable("");
        }
      } catch (error) {
        setMessage(error.message || "Unable to load tables.");
      }
    };

    loadTablesForNode();
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode || !selectedTable) {
      setFlows([]);
      return;
    }

    const loadFlows = async () => {
      setLoading(true);
      setMessage("");
      try {
        const rawFlows = await getFlows(selectedNode, selectedTable);
        const parsedFlows = (rawFlows || []).map((flow, index) => ({
          id: flow.id || flow["flow-id"] || `flow-${index + 1}`,
          priority: flow.priority ?? flow["priority"] ?? 0,
          match: summarizeMatch(flow.match),
          instructions: summarizeInstructions(flow.instructions),
          idleTimeout: flow["idle-timeout"] ?? flow.idleTimeout ?? "-",
          hardTimeout: flow["hard-timeout"] ?? flow.hardTimeout ?? "-",
          raw: flow,
        }));
        setFlows(parsedFlows);
      } catch (error) {
        setMessage(error.message || "Unable to load flows.");
        setFlows([]);
      } finally {
        setLoading(false);
      }
    };

    loadFlows();
  }, [selectedNode, selectedTable]);

  const selectedNodeLabel = useMemo(() => {
    const node = nodes.find((candidate) => candidate.id === selectedNode || candidate["id"] === selectedNode);
    return node?.id || node?.["id"] || selectedNode;
  }, [nodes, selectedNode]);

  const openCreateModal = () => {
    setEditingFlow(null);
    setFormData({ ...emptyForm, flowId: `flow-${Date.now()}` });
    setIsModalOpen(true);
  };

  const openEditModal = (flow) => {
    setEditingFlow(flow);
    setFormData({
      flowId: flow.id,
      priority: flow.priority ?? 1000,
      match: flow.raw?.match ? JSON.stringify(flow.raw.match, null, 2) : "",
      instructions: flow.raw?.instructions ? JSON.stringify(flow.raw.instructions, null, 2) : "",
      idleTimeout: flow.idleTimeout === "-" ? "" : flow.idleTimeout,
      hardTimeout: flow.hardTimeout === "-" ? "" : flow.hardTimeout,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingFlow(null);
    setFormData(emptyForm);
  };

  const handleDelete = async (flow) => {
    try {
      await deleteFlow(selectedNode, selectedTable, flow.id);
      setFlows((current) => current.filter((candidate) => candidate.id !== flow.id));
      setMessage(`Flow ${flow.id} deleted.`);
    } catch (error) {
      setMessage(error.message || "Delete failed.");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      const parsedMatch = parseJson(formData.match, {});
      const parsedInstructions = parseJson(formData.instructions, { instruction: [] });

      const flowBody = {
        "flow-node-inventory:flow": [
          {
            id: formData.flowId,
            priority: Number(formData.priority || 0),
            "table_id": Number(selectedTable),
            ...(Object.keys(parsedMatch).length ? { match: parsedMatch } : {}),
            ...(Object.keys(parsedInstructions).length ? { instructions: parsedInstructions } : {}),
            ...(formData.idleTimeout ? { "idle-timeout": Number(formData.idleTimeout) } : {}),
            ...(formData.hardTimeout ? { "hard-timeout": Number(formData.hardTimeout) } : {}),
          },
        ],
      };

      await putFlow(selectedNode, selectedTable, formData.flowId, flowBody);
      await refreshFlows();
      closeModal();
      setMessage(editingFlow ? `Flow ${formData.flowId} updated.` : `Flow ${formData.flowId} created.`);
    } catch (error) {
      setMessage(error.message || "Flow save failed.");
    }
  };

  const refreshFlows = async () => {
    if (!selectedNode || !selectedTable) return;
    setLoading(true);
    try {
      const rawFlows = await getFlows(selectedNode, selectedTable);
      const parsedFlows = (rawFlows || []).map((flow, index) => ({
        id: flow.id || flow["flow-id"] || `flow-${index + 1}`,
        priority: flow.priority ?? flow["priority"] ?? 0,
        match: summarizeMatch(flow.match),
        instructions: summarizeInstructions(flow.instructions),
        idleTimeout: flow["idle-timeout"] ?? flow.idleTimeout ?? "-",
        hardTimeout: flow["hard-timeout"] ?? flow.hardTimeout ?? "-",
        raw: flow,
      }));
      setFlows(parsedFlows);
    } catch (error) {
      setMessage(error.message || "Unable to refresh flows.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 text-slate-800">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Flows</h1>
          <p className="text-sm text-slate-500">Browse and manage OpenDaylight flows for a selected node and table.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Create Flow
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 rounded border border-slate-200 bg-white p-3 shadow-sm">
        <label className="flex flex-col text-sm font-medium text-slate-600">
          Switch
          <select
            className="mt-1 rounded border border-slate-300 bg-white px-3 py-2"
            value={selectedNode}
            onChange={(event) => setSelectedNode(event.target.value)}
          >
            {nodes.map((node) => {
              const nodeId = node.id || node["id"];
              return (
                <option key={nodeId} value={nodeId}>
                  {nodeId}
                </option>
              );
            })}
          </select>
        </label>

        <label className="flex flex-col text-sm font-medium text-slate-600">
          Table
          <select
            className="mt-1 rounded border border-slate-300 bg-white px-3 py-2"
            value={selectedTable}
            onChange={(event) => setSelectedTable(event.target.value)}
          >
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message ? <div className="mb-4 rounded border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          Viewing flows for {selectedNodeLabel || "select a switch"} / table {selectedTable || "-"}
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading flows…</div>
        ) : flows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No flows were returned for the selected switch and table.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Flow ID</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Match</th>
                  <th className="px-4 py-3 font-medium">Instructions</th>
                  <th className="px-4 py-3 font-medium">Timeouts</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {flows.map((flow) => (
                  <tr key={flow.id} className="align-top">
                    <td className="px-4 py-3 font-semibold text-slate-800">{flow.id}</td>
                    <td className="px-4 py-3">{flow.priority}</td>
                    <td className="px-4 py-3 max-w-xs text-slate-600">{flow.match}</td>
                    <td className="px-4 py-3 max-w-xs text-slate-600">{flow.instructions}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>Idle: {flow.idleTimeout}</div>
                      <div>Hard: {flow.hardTimeout}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openEditModal(flow)}
                          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(flow)}
                          className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingFlow ? `Edit ${editingFlow.id}` : "Create Flow"}</h2>
              <button onClick={closeModal} className="text-sm text-slate-500 hover:text-slate-700">
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Flow ID
                  <input
                    required
                    className="mt-1 rounded border border-slate-300 px-3 py-2"
                    value={formData.flowId}
                    onChange={(event) => setFormData((current) => ({ ...current, flowId: event.target.value }))}
                  />
                </label>

                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Priority
                  <input
                    type="number"
                    className="mt-1 rounded border border-slate-300 px-3 py-2"
                    value={formData.priority}
                    onChange={(event) => setFormData((current) => ({ ...current, priority: event.target.value }))}
                  />
                </label>
              </div>

              <label className="flex flex-col text-sm font-medium text-slate-600">
                Match JSON
                <textarea
                  rows={6}
                  className="mt-1 rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                  value={formData.match}
                  onChange={(event) => setFormData((current) => ({ ...current, match: event.target.value }))}
                  placeholder='{"ipv4-source":"10.0.0.0/24"}'
                />
              </label>

              <label className="flex flex-col text-sm font-medium text-slate-600">
                Instructions JSON
                <textarea
                  rows={6}
                  className="mt-1 rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                  value={formData.instructions}
                  onChange={(event) => setFormData((current) => ({ ...current, instructions: event.target.value }))}
                  placeholder='{"instruction":[{"order":0,"apply-actions":{"action":[{"order":0,"output-action":{"output-node-connector":"1"}}]}}]}'
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Idle Timeout
                  <input
                    type="number"
                    className="mt-1 rounded border border-slate-300 px-3 py-2"
                    value={formData.idleTimeout}
                    onChange={(event) => setFormData((current) => ({ ...current, idleTimeout: event.target.value }))}
                  />
                </label>
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Hard Timeout
                  <input
                    type="number"
                    className="mt-1 rounded border border-slate-300 px-3 py-2"
                    value={formData.hardTimeout}
                    onChange={(event) => setFormData((current) => ({ ...current, hardTimeout: event.target.value }))}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
                >
                  Save Flow
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function summarizeMatch(match) {
  if (!match) return "—";
  if (typeof match === "string") return match;
  if (Array.isArray(match)) return match.map((item) => JSON.stringify(item)).join(", ");
  return Object.entries(match)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("; ");
}

function summarizeInstructions(instructions) {
  if (!instructions) return "—";
  if (typeof instructions === "string") return instructions;
  const instructionList = Array.isArray(instructions.instruction)
    ? instructions.instruction
    : Array.isArray(instructions)
      ? instructions
      : [];
  return instructionList
    .slice(0, 2)
    .map((item) => {
      if (item?.["apply-actions"]?.action) return "apply-actions";
      if (item?.instruction) return "instruction";
      return JSON.stringify(item);
    })
    .join(", ");
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default Flows;
