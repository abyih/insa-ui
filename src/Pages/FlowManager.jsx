import React, { useEffect, useMemo, useState } from "react";
import { getInventoryNodes, getNodeTables, getFlows, deleteFlow, putFlow } from "../api/flowManagerService";

const emptyForm = {
  flowId: "",
  priority: 1000,
  etherType: "2048",
  actionType: "drop",
  outputNodeConnector: "1",
  idleTimeout: "",
  hardTimeout: "",
};

function FlowManager() {
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
        if (firstNode) setSelectedNode(firstNode);
      } catch (error) {
        setMessage(error.message || "Unable to load nodes.");
      }
    };
    loadNodes();
  }, []);

  useEffect(() => {
    if (!selectedNode) return;
    const loadTables = async () => {
      try {
        const tableList = await getNodeTables(selectedNode);
        const normalized = (tableList || []).map((table) => ({
          id: table.id ?? table["id"] ?? table["flow-node-inventory:table-id"],
          data: table,
        }));
        setTables(normalized);
        if (normalized.length) {
          setSelectedTable((current) => (normalized.some((table) => table.id === current) ? current : normalized[0].id));
        } else {
          setSelectedTable("");
        }
      } catch (error) {
        setMessage(error.message || "Unable to load tables.");
      }
    };
    loadTables();
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode || !selectedTable) {
      setFlows([]);
      return;
    }
    const loadFlows = async () => {
      setLoading(true);
      try {
        const rawFlows = await getFlows(selectedNode, selectedTable);
        setFlows(normalizeFlows(rawFlows));
      } catch (error) {
        setMessage(error.message || "Unable to load config flows.");
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
    const ethMatch = flow.raw?.match?.["ethernet-match"]?.["ethernet-type"]?.type;
    const instructionList = flow.raw?.instructions?.instruction || [];
    const firstInstruction = instructionList[0] || {};
    const firstAction = firstInstruction?.["apply-actions"]?.action?.[0] || {};
    const actionType = firstAction["drop-action"] ? "drop" : firstAction["output-action"] ? "output" : "drop";
    const outputNodeConnector = firstAction["output-action"]?.["output-node-connector"] || "1";

    setFormData({
      flowId: flow.id,
      priority: flow.priority ?? 1000,
      etherType: ethMatch ?? "2048",
      actionType,
      outputNodeConnector,
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

  const refreshFlows = async () => {
    if (!selectedNode || !selectedTable) return;
    setLoading(true);
    try {
      const rawFlows = await getFlows(selectedNode, selectedTable);
      setFlows(normalizeFlows(rawFlows));
    } catch (error) {
      setMessage(error.message || "Unable to refresh flows.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (flow) => {
    try {
      await deleteFlow(selectedNode, selectedTable, flow.id);
      setFlows((current) => current.filter((candidate) => candidate.id !== flow.id));
      setMessage(`Deleted flow ${flow.id}.`);
    } catch (error) {
      setMessage(error.message || "Delete failed.");
    }
  };

  const handleSubmit = async (event) => {
    if (event?.preventDefault) event.preventDefault();

    try {
      const normalizedTableId = Number(selectedTable || 0);
      const flowBody = {
        "flow-node-inventory:flow": [
          {
            id: String(formData.flowId || ""),
            priority: Number(formData.priority || 0),
            table_id: normalizedTableId,
            match: {
              "ethernet-match": {
                "ethernet-type": {
                  type: Number(formData.etherType || 2048),
                },
              },
            },
            instructions: {
              instruction: [
                {
                  order: 0,
                  "apply-actions": {
                    action: [
                      {
                        order: 0,
                        ...(formData.actionType === "output"
                          ? { "output-action": { "output-node-connector": String(formData.outputNodeConnector || "1") } }
                          : { "drop-action": {} }),
                      },
                    ],
                  },
                },
              ],
            },
            ...(formData.idleTimeout ? { "idle-timeout": Number(formData.idleTimeout) } : {}),
            ...(formData.hardTimeout ? { "hard-timeout": Number(formData.hardTimeout) } : {}),
          },
        ],
      };

      if (!formData.flowId) {
        throw new Error("Please enter a flow ID.");
      }

      console.log("Submitting flow payload", flowBody);
      setMessage("Saving flow…");
      await putFlow(selectedNode, selectedTable || 0, formData.flowId, flowBody);
      await refreshFlows();
      closeModal();
      setMessage(editingFlow ? `Updated flow ${formData.flowId}.` : `Created flow ${formData.flowId}.`);
    } catch (error) {
      console.error("FlowManager save failed", error);
      setMessage(error.message || "Save failed.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 text-slate-800">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Flow Manager</h1>
          <p className="text-sm text-slate-500">Manage config-datastore flows for the selected node and table.</p>
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
              return <option key={nodeId} value={nodeId}>{nodeId}</option>;
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
              <option key={table.id} value={table.id}>{table.id}</option>
            ))}
          </select>
        </label>
      </div>

      {message ? <div className="mb-4 rounded border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
          Viewing config flows for {selectedNodeLabel || "select a switch"} / table {selectedTable || "-"}
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading config flows…</div>
        ) : flows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No config flows were returned for the selected switch and table.</div>
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
                        <button onClick={() => openEditModal(flow)} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Edit</button>
                        <button onClick={() => handleDelete(flow)} className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">Delete</button>
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
              <button onClick={closeModal} className="text-sm text-slate-500 hover:text-slate-700">Close</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Flow ID
                  <input required className="mt-1 rounded border border-slate-300 px-3 py-2" value={formData.flowId} onChange={(event) => setFormData((current) => ({ ...current, flowId: event.target.value }))} />
                </label>
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Priority
                  <input type="number" className="mt-1 rounded border border-slate-300 px-3 py-2" value={formData.priority} onChange={(event) => setFormData((current) => ({ ...current, priority: event.target.value }))} />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Ethernet Type
                  <input type="number" className="mt-1 rounded border border-slate-300 px-3 py-2" value={formData.etherType} onChange={(event) => setFormData((current) => ({ ...current, etherType: event.target.value }))} />
                </label>
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Action Type
                  <select className="mt-1 rounded border border-slate-300 bg-white px-3 py-2" value={formData.actionType} onChange={(event) => setFormData((current) => ({ ...current, actionType: event.target.value }))}>
                    <option value="drop">drop-action</option>
                    <option value="output">output-action</option>
                  </select>
                </label>
              </div>

              {formData.actionType === "output" ? (
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Output Node Connector
                  <input type="text" className="mt-1 rounded border border-slate-300 px-3 py-2" value={formData.outputNodeConnector} onChange={(event) => setFormData((current) => ({ ...current, outputNodeConnector: event.target.value }))} />
                </label>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Idle Timeout
                  <input type="number" className="mt-1 rounded border border-slate-300 px-3 py-2" value={formData.idleTimeout} onChange={(event) => setFormData((current) => ({ ...current, idleTimeout: event.target.value }))} />
                </label>
                <label className="flex flex-col text-sm font-medium text-slate-600">
                  Hard Timeout
                  <input type="number" className="mt-1 rounded border border-slate-300 px-3 py-2" value={formData.hardTimeout} onChange={(event) => setFormData((current) => ({ ...current, hardTimeout: event.target.value }))} />
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Cancel</button>
                <button type="button" onClick={handleSubmit} className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">Save Flow</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeFlows(rawFlows) {
  return (rawFlows || []).map((flow, index) => ({
    id: flow.id || flow["flow-id"] || `flow-${index + 1}`,
    priority: flow.priority ?? flow["priority"] ?? 0,
    match: summarizeMatch(flow.match),
    instructions: summarizeInstructions(flow.instructions),
    idleTimeout: flow["idle-timeout"] ?? flow.idleTimeout ?? "-",
    hardTimeout: flow["hard-timeout"] ?? flow.hardTimeout ?? "-",
    raw: flow,
  }));
}

function summarizeMatch(match) {
  if (!match) return "—";
  if (typeof match === "string") return match;
  if (Array.isArray(match)) return match.map((item) => JSON.stringify(item)).join(", ");
  return Object.entries(match).slice(0, 3).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("; ");
}

function summarizeInstructions(instructions) {
  if (!instructions) return "—";
  if (typeof instructions === "string") return instructions;
  const instructionList = Array.isArray(instructions.instruction) ? instructions.instruction : Array.isArray(instructions) ? instructions : [];
  return instructionList.slice(0, 2).map((item) => {
    if (item?.["apply-actions"]?.action) return "apply-actions";
    if (item?.instruction) return "instruction";
    return JSON.stringify(item);
  }).join(", ");
}

export default FlowManager;
