import React, { useEffect, useMemo, useState, useCallback } from "react";
import { getInventoryNodes, getNodeTables, getFlows, deleteFlow, putFlow } from "../api/flowManagerService";


function MessageBanner({ message, clearMessage }) {
  if (!message) return null;

  let errorList = [];
  let isOdlError = false;
  let rawJson = null;

  if (typeof message === "string" && (message.trim().startsWith("{") || message.trim().startsWith("["))) {
    try {
      const parsed = JSON.parse(message);
      if (parsed?.errors?.error) {
        errorList = Array.isArray(parsed.errors.error) ? parsed.errors.error : [parsed.errors.error];
        isOdlError = true;
      } else {
        rawJson = parsed;
      }
    } catch {
      // Treat as plain text
    }
  } else if (typeof message === "object") {
    if (message?.errors?.error) {
      errorList = Array.isArray(message.errors.error) ? message.errors.error : [message.errors.error];
      isOdlError = true;
    } else {
      rawJson = message;
    }
  }

  const isSuccess = !isOdlError && !rawJson && 
    !message.toLowerCase().includes("fail") && 
    !message.toLowerCase().includes("error") && 
    !message.toLowerCase().includes("unable");

  const bg = isSuccess ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.15)";
  const border = isSuccess ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.3)";
  const color = isSuccess ? "#34d399" : "#f87171";

  return (
    <div style={{
      padding: "14px 20px", borderRadius: 12, background: bg,
      border: `1px solid ${border}`, color: color, fontSize: 13,
      marginBottom: 20, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700 }}>
          {isSuccess ? "✓ Status Update" : "⚠️ Configuration Warning"}
        </span>
        {clearMessage && (
          <button 
            type="button"
            onClick={clearMessage}
            style={{ background: "none", border: "none", color: "inherit", fontSize: 14, cursor: "pointer", padding: 0 }}
          >
            ✕
          </button>
        )}
      </div>
      
      {isOdlError ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {errorList.map((err, idx) => (
            <div key={idx} style={{
              background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 14px",
              borderLeft: "4px solid #ef4444"
            }}>
              {err["error-type"] && (
                <div style={{ fontSize: 10, textTransform: "uppercase", opacity: 0.6, fontWeight: 700, marginBottom: 2 }}>
                  Type: {err["error-type"]} · Tag: {err["error-tag"]}
                </div>
              )}
              <div style={{ fontWeight: 500, color: "#fff" }}>
                {err["error-message"] || "An unexpected error occurred in OpenDaylight."}
              </div>
              {err["error-info"] && (
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4, fontFamily: "monospace" }}>
                  {err["error-info"]}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : rawJson ? (
        <pre style={{
          margin: 0, padding: 10, background: "rgba(0,0,0,0.25)", borderRadius: 8,
          fontSize: 11, fontFamily: "monospace", overflowX: "auto"
        }}>
          {JSON.stringify(rawJson, null, 2)}
        </pre>
      ) : (
        <div style={{ fontWeight: 500 }}>{message}</div>
      )}
    </div>
  );
}

const emptyForm = {
  flowId: "",
  priority: 1000,
  etherType: "2048",
  actionType: "drop",
  outputNodeConnector: "1",
  idleTimeout: "",
  hardTimeout: "",
};

const S = {
  page: {
    minHeight: "100vh",
    background: "var(--theme-bg)",
    color: "var(--theme-fg)",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "24px 32px 48px",
  },
  glass: {
    background: "var(--theme-card)",
    border: "1px solid var(--theme-card-border)",
    borderRadius: 16,
  },
  glassInner: {
    background: "var(--theme-bg)",
    border: "1px solid var(--theme-card-border)",
    borderRadius: 12,
  },
  input: {
    background: "var(--theme-bg)",
    border: "1px solid var(--theme-input-border)",
    borderRadius: 8,
    color: "var(--theme-fg)",
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
    width: "100%",
  },
  preview: {
    background: "var(--theme-bg)",
    border: "1px solid var(--theme-input-border)",
    borderRadius: 8,
    color: "var(--theme-fg)",
    fontFamily: "monospace",
    padding: 10,
    fontSize: 11,
    maxHeight: 180,
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  }
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
        })).sort((a, b) => Number(a.id) - Number(b.id));
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

  const loadFlows = useCallback(async () => {
    if (!selectedNode || selectedTable === "" || selectedTable === undefined || selectedTable === null) {
      setFlows([]);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const rawFlows = await getFlows(selectedNode, selectedTable);
      setFlows(normalizeFlows(rawFlows));
    } catch (error) {
      setMessage(error.message || "Unable to load config flows.");
      setFlows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedNode, selectedTable]);

  useEffect(() => {
    loadFlows();
  }, [loadFlows]);

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
      etherType: ethMatch !== undefined ? String(ethMatch) : "2048",
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

  const handleDelete = async (flow) => {
    if (!window.confirm(`Delete configuration flow ${flow.id}? This will remove it from the config datastore.`)) return;
    try {
      await deleteFlow(selectedNode, selectedTable, flow.id);
      setFlows((current) => current.filter((candidate) => candidate.id !== flow.id));
      setMessage(`Deleted flow ${flow.id}.`);
    } catch (error) {
      setMessage(error.message || "Delete failed.");
    }
  };

  // Build the ODL payload dynamically based on form fields
  const buildOdlPayload = useCallback(() => {
    const normalizedTableId = Number(selectedTable || 0);
    return {
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
  }, [formData, selectedTable]);

  const handleSubmit = async (event) => {
    if (event?.preventDefault) event.preventDefault();

    if (!formData.flowId) {
      alert("Please enter a flow ID.");
      return;
    }

    try {
      const flowBody = buildOdlPayload();
      setMessage("Saving config flow…");
      await putFlow(selectedNode, selectedTable || 0, formData.flowId, flowBody);
      await loadFlows();
      closeModal();
      setMessage(editingFlow ? `Updated config flow ${formData.flowId}.` : `Created config flow ${formData.flowId}.`);
    } catch (error) {
      setMessage(error.message || "Save failed.");
    }
  };

  const jsonPreview = useMemo(() => {
    try {
      return JSON.stringify(buildOdlPayload(), null, 2);
    } catch {
      return "Unable to generate preview";
    }
  }, [buildOdlPayload]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>Config Flow Rules</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Inject persistent configurations into the OpenDaylight CONFIG datastore</p>
          </div>
          <button
            onClick={openCreateModal}
            style={{
              padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600, background: "#10b981", color: "#fff",
              transition: "background 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#059669"}
            onMouseLeave={e => e.currentTarget.style.background = "#10b981"}
          >
            + Create Config Flow
          </button>
        </div>

        {/* Filters */}
        <div style={{ ...S.glass, padding: "16px 20px", display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>
            Active Switch
            <select
              style={{ ...S.input, width: 320 }}
              value={selectedNode}
              onChange={(event) => setSelectedNode(event.target.value)}
            >
              {nodes.map((node) => {
                const nodeId = node.id || node["id"];
                const label = node.type ? `${nodeId} (${node.type})` : nodeId;
                return (
                  <option key={nodeId} value={nodeId}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>
            Flow Table ID
            <select
              style={{ ...S.input, width: 140 }}
              value={selectedTable}
              onChange={(event) => setSelectedTable(event.target.value)}
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>Table {table.id}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Message Banner */}
        <MessageBanner message={message} clearMessage={() => setMessage("")} />

        {/* Config Flows Table */}
        <div style={S.glass}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>
              Active configuration configurations for switch <strong style={{ color: "#fff" }}>{selectedNodeLabel || "none"}</strong> · Table <strong style={{ color: "#fff" }}>{selectedTable !== "" ? selectedTable : "—"}</strong>
            </span>
            <button
              onClick={loadFlows}
              style={{ padding: "4px 10px", fontSize: 11, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", borderRadius: 6, cursor: "pointer" }}
            >
              ↻ Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 48, textAlign: "center", color: "#64748b", fontSize: 13 }}>
              Retrieving config datastore flows…
            </div>
          ) : flows.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#64748b", fontSize: 13 }}>
              No config flows configured in Table {selectedTable !== "" ? selectedTable : "—"} on this switch.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                    {["Flow ID", "Priority", "Ethernet Match", "Action / Instructions", "Timeouts", "Actions"].map(h => (
                      <th key={h} style={{ padding: "12px 18px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flows.map((flow) => (
                    <tr key={flow.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", verticalAlign: "top" }}>
                      <td style={{ padding: "14px 18px", fontWeight: 600, color: "#cbd5e1" }}>{flow.id}</td>
                      <td style={{ padding: "14px 18px" }}>
                        <span style={{ background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 4, fontSize: 11, border: "1px solid rgba(255,255,255,0.08)" }}>
                          {flow.priority}
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", color: "#94a3b8" }}>{flow.match}</td>
                      <td style={{ padding: "14px 18px", color: "#94a3b8" }}>{flow.instructions}</td>
                      <td style={{ padding: "14px 18px", color: "#64748b", fontSize: 11 }}>
                        <div>Idle: {flow.idleTimeout}s</div>
                        <div style={{ marginTop: 2 }}>Hard: {flow.hardTimeout}s</div>
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => openEditModal(flow)} style={{ padding: "5px 10px", fontSize: 12, background: "#2563eb", border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>Edit</button>
                          <button onClick={() => handleDelete(flow)} style={{ padding: "5px 10px", fontSize: 12, background: "#dc2626", border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {/* ── CREATE / EDIT MODAL ────────────────────────────────────────── */}
      {isModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center",
          justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)", padding: 16
        }}>
          <div style={{
            ...S.glass, background: "var(--theme-card)", width: "100%", maxWidth: 640,
            boxShadow: "0 20px 50px rgba(0,0,0,0.4)", overflow: "hidden"
          }}>
            <form onSubmit={handleSubmit}>
              
              {/* Modal Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  {editingFlow ? `Modify Config Flow (${formData.flowId})` : "Inject Config Flow Rule"}
                </h2>
                <button type="button" onClick={closeModal} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>✕ Close</button>
              </div>

              {/* Form Content */}
              <div style={{ padding: "20px 24px", maxHeight: "calc(100vh - 200px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                    Flow ID
                    <input required disabled={!!editingFlow} style={{ ...S.input, opacity: editingFlow ? 0.6 : 1 }} value={formData.flowId} onChange={(event) => setFormData((current) => ({ ...current, flowId: event.target.value }))} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                    Priority (0-65535)
                    <input type="number" style={S.input} value={formData.priority} onChange={(event) => setFormData((current) => ({ ...current, priority: event.target.value }))} />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                    Ethernet Type Match
                    <select
                      style={S.input}
                      value={formData.etherType}
                      onChange={(event) => setFormData((current) => ({ ...current, etherType: event.target.value }))}
                    >
                      <option value="2048">IPv4 Traffic (2048)</option>
                      <option value="2054">ARP Requests (2054)</option>
                      <option value="34525">IPv6 Traffic (34525)</option>
                    </select>
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                    Action Block
                    <select style={S.input} value={formData.actionType} onChange={(event) => setFormData((current) => ({ ...current, actionType: event.target.value }))}>
                      <option value="drop">Drop Action</option>
                      <option value="output">Output to Port</option>
                    </select>
                  </label>
                </div>

                {formData.actionType === "output" && (
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                    Destination Port Connector
                    <input type="text" placeholder="e.g. 1, 2, NORMAL" style={S.input} value={formData.outputNodeConnector} onChange={(event) => setFormData((current) => ({ ...current, outputNodeConnector: event.target.value }))} />
                  </label>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                    Idle Timeout (Seconds)
                    <input type="number" placeholder="none" style={S.input} value={formData.idleTimeout} onChange={(event) => setFormData((current) => ({ ...current, idleTimeout: event.target.value }))} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                    Hard Timeout (Seconds)
                    <input type="number" placeholder="none" style={S.input} value={formData.hardTimeout} onChange={(event) => setFormData((current) => ({ ...current, hardTimeout: event.target.value }))} />
                  </label>
                </div>

                {/* JSON Preview Box */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>REST Payload JSON Preview</span>
                  <div style={S.preview}>
                    {jsonPreview}
                  </div>
                </div>

              </div>

              {/* Modal Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <button type="button" onClick={closeModal} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button type="submit" style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "#8b5cf6", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save Config Flow</button>
              </div>

            </form>
          </div>
        </div>
      )}

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
