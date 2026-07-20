import React, { useEffect, useMemo, useState, useCallback } from "react";
import { getInventoryNodes, getNodeTables, getFlows, deleteFlow, putFlow } from "../api/flowService";

const TEMPLATES = {
  forward: {
    name: "Template: Forward Ingress Port 1 to Egress Port 2",
    match: {
      "in-port": "1"
    },
    instructions: {
      instruction: [
        {
          order: 0,
          "apply-actions": {
            action: [
              {
                order: 0,
                "output-action": {
                  "output-node-connector": "2"
                }
              }
            ]
          }
        }
      ]
    }
  },
  drop_ip: {
    name: "Template: Block IP Source (10.0.0.99)",
    match: {
      "ethernet-match": {
        "ethernet-type": {
          "type": 2048
        }
      },
      "ipv4-source": "10.0.0.99/32"
    },
    instructions: {
      instruction: [
        {
          order: 0,
          "apply-actions": {
            action: [
              {
                order: 0,
                "drop-action": {}
              }
            ]
          }
        }
      ]
    }
  },
  tcp_controller: {
    name: "Template: Mirror TCP Port 80 to Controller",
    match: {
      "ethernet-match": {
        "ethernet-type": {
          "type": 2048
        }
      },
      "ip-match": {
        "ip-protocol": 6
      },
      "tcp-destination-port": 80
    },
    instructions: {
      instruction: [
        {
          order: 0,
          "apply-actions": {
            action: [
              {
                order: 0,
                "output-action": {
                  "output-node-connector": "CONTROLLER",
                  "max-length": 65535
                }
              }
            ]
          }
        }
      ]
    }
  }
};


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
          {isSuccess ? "✓ Status Update" : "⚠️ Flow Entry Warning"}
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
  idleTimeout: "",
  hardTimeout: "",
  // Visual fields
  etherType: "2048",
  inPort: "",
  ipv4Source: "",
  ipv4Destination: "",
  protocol: "none",
  srcPort: "",
  dstPort: "",
  actionType: "output",
  outputPort: "1",
  // Raw fields
  matchRaw: "",
  instructionsRaw: "",
};

const S = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #09090b 0%, #18181b 100%)",
    color: "#fafafa",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "24px 32px 48px",
  },
  glass: {
    background: "#18181b",
    border: "1px solid #27272a",
    borderRadius: 16,
  },
  glassInner: {
    background: "#09090b",
    border: "1px solid #27272a",
    borderRadius: 12,
  },
  input: {
    background: "#09090b",
    border: "1px solid #27272a",
    borderRadius: 8,
    color: "#fafafa",
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
  },
  textarea: {
    background: "#09090b",
    border: "1px solid #27272a",
    borderRadius: 8,
    color: "#34d399",
    fontFamily: "monospace",
    padding: 12,
    fontSize: 12,
    outline: "none",
    width: "100%",
    resize: "vertical",
  }
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
  
  // Editor mode tab: "visual" or "json"
  const [editorTab, setEditorTab] = useState("visual");
  const [formData, setFormData] = useState(emptyForm);

  // JSON Validation errors
  const [matchError, setMatchError] = useState("");
  const [instError, setInstError] = useState("");

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

  const loadFlows = useCallback(async () => {
    if (!selectedNode || !selectedTable) {
      setFlows([]);
      return;
    }
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
  }, [selectedNode, selectedTable]);

  useEffect(() => {
    loadFlows();
  }, [loadFlows]);

  const selectedNodeLabel = useMemo(() => {
    const node = nodes.find((candidate) => candidate.id === selectedNode || candidate["id"] === selectedNode);
    return node?.id || node?.["id"] || selectedNode;
  }, [nodes, selectedNode]);

  // Form value validation helper
  const validateJson = (type, value) => {
    if (!value.trim()) {
      if (type === "match") setMatchError("");
      else setInstError("");
      return true;
    }
    try {
      JSON.parse(value);
      if (type === "match") setMatchError("");
      else setInstError("");
      return true;
    } catch (e) {
      if (type === "match") setMatchError(`Invalid JSON: ${e.message}`);
      else setInstError(`Invalid JSON: ${e.message}`);
      return false;
    }
  };

  // Convert raw ODL flow matches and instructions to Visual Form inputs
  const parseOdlToForm = (match, instructions) => {
    const fields = { ...emptyForm };
    
    // Parse Match
    if (match) {
      fields.etherType = String(match["ethernet-match"]?.["ethernet-type"]?.type ?? "2048");
      fields.inPort = match["in-port"] ?? "";
      fields.ipv4Source = match["ipv4-source"] ?? "";
      fields.ipv4Destination = match["ipv4-destination"] ?? "";
      
      const proto = match["ip-match"]?.["ip-protocol"];
      if (proto !== undefined) {
        fields.protocol = String(proto);
        if (fields.protocol === "6") {
          fields.srcPort = match["tcp-source-port"] ?? "";
          fields.dstPort = match["tcp-destination-port"] ?? "";
        } else if (fields.protocol === "17") {
          fields.srcPort = match["udp-source-port"] ?? "";
          fields.dstPort = match["udp-destination-port"] ?? "";
        }
      }
    }

    // Parse Instructions
    const firstInst = instructions?.instruction?.[0];
    const firstAct = firstInst?.["apply-actions"]?.action?.[0];
    if (firstAct) {
      if (firstAct["drop-action"]) {
        fields.actionType = "drop";
      } else if (firstAct["output-action"]) {
        const outConn = firstAct["output-action"]["output-node-connector"];
        if (outConn === "CONTROLLER") {
          fields.actionType = "controller";
        } else {
          fields.actionType = "output";
          fields.outputPort = outConn ?? "1";
        }
      }
    }

    return fields;
  };

  const openCreateModal = () => {
    setEditingFlow(null);
    setEditorTab("visual");
    setFormData({
      ...emptyForm,
      flowId: `flow-${Date.now()}`,
      matchRaw: "{}",
      instructionsRaw: '{"instruction":[]}'
    });
    setMatchError("");
    setInstError("");
    setIsModalOpen(true);
  };

  const openEditModal = (flow) => {
    setEditingFlow(flow);
    
    // Auto-detect if it has non-visual fields that might require raw JSON editing
    const rawMatch = flow.raw?.match;
    const rawInst = flow.raw?.instructions;
    
    const initialFormData = {
      flowId: flow.id,
      priority: flow.priority ?? 1000,
      idleTimeout: flow.idleTimeout === "-" ? "" : flow.idleTimeout,
      hardTimeout: flow.hardTimeout === "-" ? "" : flow.hardTimeout,
      ...parseOdlToForm(rawMatch, rawInst),
      matchRaw: rawMatch ? JSON.stringify(rawMatch, null, 2) : "{}",
      instructionsRaw: rawInst ? JSON.stringify(rawInst, null, 2) : '{"instruction":[]}',
    };

    setFormData(initialFormData);
    setMatchError("");
    setInstError("");
    
    // Choose starting tab based on whether ODL fields fit cleanly into visual builder
    setEditorTab("visual");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingFlow(null);
    setFormData(emptyForm);
  };

  const handleDelete = async (flow) => {
    if (!window.confirm(`Are you sure you want to delete flow ${flow.id}?`)) return;
    try {
      await deleteFlow(selectedNode, selectedTable, flow.id);
      setFlows((current) => current.filter((candidate) => candidate.id !== flow.id));
      setMessage(`Flow ${flow.id} deleted successfully.`);
    } catch (error) {
      setMessage(error.message || "Delete failed.");
    }
  };

  // Build the final flow JSON structure depending on visual form or raw JSON text
  const buildSubmitBody = () => {
    if (editorTab === "json") {
      const matchParsed = parseJson(formData.matchRaw, {});
      const instParsed = parseJson(formData.instructionsRaw, { instruction: [] });
      return { matchParsed, instParsed };
    }

    // Tab 1: Visual Form Builder Translation
    const matchParsed = {};
    if (formData.etherType) {
      matchParsed["ethernet-match"] = {
        "ethernet-type": { type: Number(formData.etherType) }
      };
    }
    if (formData.inPort) {
      matchParsed["in-port"] = formData.inPort;
    }
    if (formData.ipv4Source) {
      matchParsed["ipv4-source"] = formData.ipv4Source;
    }
    if (formData.ipv4Destination) {
      matchParsed["ipv4-destination"] = formData.ipv4Destination;
    }
    if (formData.protocol && formData.protocol !== "none") {
      matchParsed["ip-match"] = { "ip-protocol": Number(formData.protocol) };
      
      const portNum = (p) => (p ? Number(p) : undefined);
      if (formData.protocol === "6") { // TCP
        if (formData.srcPort) matchParsed["tcp-source-port"] = portNum(formData.srcPort);
        if (formData.dstPort) matchParsed["tcp-destination-port"] = portNum(formData.dstPort);
      } else if (formData.protocol === "17") { // UDP
        if (formData.srcPort) matchParsed["udp-source-port"] = portNum(formData.srcPort);
        if (formData.dstPort) matchParsed["udp-destination-port"] = portNum(formData.dstPort);
      }
    }

    const instParsed = {
      instruction: [
        {
          order: 0,
          "apply-actions": {
            action: [
              {
                order: 0,
                ...(formData.actionType === "drop" ? { "drop-action": {} } : {}),
                ...(formData.actionType === "output" ? {
                  "output-action": { "output-node-connector": String(formData.outputPort || "1") }
                } : {}),
                ...(formData.actionType === "controller" ? {
                  "output-action": { "output-node-connector": "CONTROLLER", "max-length": 65535 }
                } : {})
              }
            ]
          }
        }
      ]
    };

    return { matchParsed, instParsed };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (editorTab === "json") {
      const matchOk = validateJson("match", formData.matchRaw);
      const instOk = validateJson("instructions", formData.instructionsRaw);
      if (!matchOk || !instOk) return;
    }

    try {
      const { matchParsed, instParsed } = buildSubmitBody();

      const flowBody = {
        "flow-node-inventory:flow": [
          {
            id: formData.flowId,
            priority: Number(formData.priority || 0),
            "table_id": Number(selectedTable),
            ...(Object.keys(matchParsed).length ? { match: matchParsed } : {}),
            ...(Object.keys(instParsed).length ? { instructions: instParsed } : {}),
            ...(formData.idleTimeout ? { "idle-timeout": Number(formData.idleTimeout) } : {}),
            ...(formData.hardTimeout ? { "hard-timeout": Number(formData.hardTimeout) } : {}),
          },
        ],
      };

      await putFlow(selectedNode, selectedTable, formData.flowId, flowBody);
      await loadFlows();
      closeModal();
      setMessage(editingFlow ? `Flow ${formData.flowId} updated successfully.` : `Flow ${formData.flowId} created successfully.`);
    } catch (error) {
      setMessage(error.message || "Flow save failed.");
    }
  };

  // Helper to load templates into the raw editor
  const applyTemplate = (key) => {
    const template = TEMPLATES[key];
    if (!template) return;
    setFormData(prev => ({
      ...prev,
      matchRaw: JSON.stringify(template.match, null, 2),
      instructionsRaw: JSON.stringify(template.instructions, null, 2)
    }));
    setMatchError("");
    setInstError("");
  };

  // Format active raw JSON texts
  const beautifyJson = () => {
    try {
      const parsedMatch = JSON.parse(formData.matchRaw);
      const parsedInst = JSON.parse(formData.instructionsRaw);
      setFormData(prev => ({
        ...prev,
        matchRaw: JSON.stringify(parsedMatch, null, 2),
        instructionsRaw: JSON.stringify(parsedInst, null, 2)
      }));
      setMatchError("");
      setInstError("");
    } catch {
      alert("Please fix JSON errors first before formatting.");
    }
  };

  return (
    <div style={S.page}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        
        {/* Top Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>Switch Flows</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Inspect and manage real-time OpenDaylight flow tables</p>
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
            + Create Flow
          </button>
        </div>

        {/* Filters */}
        <div style={{ ...S.glass, padding: "16px 20px", display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>
            Active Switch
            <select
              style={{ ...S.input, width: 220 }}
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

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>
            Flow Table ID
            <select
              style={{ ...S.input, width: 140 }}
              value={selectedTable}
              onChange={(event) => setSelectedTable(event.target.value)}
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  Table {table.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Message Banner */}
        <MessageBanner message={message} clearMessage={() => setMessage("")} />

        {/* Flow Table Container */}
        <div style={S.glass}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>
              Flow Rules for switch <strong style={{ color: "#fff" }}>{selectedNodeLabel || "none"}</strong> · Table <strong style={{ color: "#fff" }}>{selectedTable || "—"}</strong>
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
              Retrieving OpenDaylight flow list…
            </div>
          ) : flows.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#64748b", fontSize: 13 }}>
              No flows active in Table {selectedTable || "—"} on this switch.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                    {["Flow ID", "Priority", "Match Summary", "Actions", "Timeouts", "Actions"].map(h => (
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
                      <td style={{ padding: "14px 18px", maxWidth: 280, color: "#94a3b8", wordBreak: "break-all" }}>{flow.match}</td>
                      <td style={{ padding: "14px 18px", maxWidth: 280, color: "#94a3b8", wordBreak: "break-all" }}>{flow.instructions}</td>
                      <td style={{ padding: "14px 18px", color: "#64748b", fontSize: 11 }}>
                        <div>Idle: {flow.idleTimeout}s</div>
                        <div style={{ marginTop: 2 }}>Hard: {flow.hardTimeout}s</div>
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => openEditModal(flow)}
                            style={{ padding: "5px 10px", fontSize: 12, background: "#2563eb", border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(flow)}
                            style={{ padding: "5px 10px", fontSize: 12, background: "#dc2626", border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
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
      </div>

      {/* ── CREATE / EDIT FLOW MODAL ────────────────────────────────────── */}
      {isModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center",
          justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)", padding: 16
        }}>
          <div style={{
            ...S.glass, background: "#18181b", width: "100%", maxWidth: 680,
            boxShadow: "0 20px 50px rgba(0,0,0,0.4)", overflow: "hidden"
          }}>
            <form onSubmit={handleSubmit}>
              
              {/* Modal Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  {editingFlow ? `Modify Flow Rule (${formData.flowId})` : "Inject New Flow Rule"}
                </h2>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}
                >
                  ✕ Close
                </button>
              </div>

              {/* Form Content */}
              <div style={{ padding: "20px 24px", maxHeight: "calc(100vh - 200px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
                
                {/* Meta Inputs (ID & Priority) */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                    Flow ID
                    <input
                      required
                      disabled={!!editingFlow}
                      style={{ ...S.input, opacity: editingFlow ? 0.6 : 1 }}
                      value={formData.flowId}
                      onChange={e => setFormData(prev => ({ ...prev, flowId: e.target.value }))}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                    Priority (0-65535)
                    <input
                      type="number"
                      style={S.input}
                      value={formData.priority}
                      onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                    />
                  </label>
                </div>

                {/* Tab select (Visual Form Builder vs Raw JSON) */}
                <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)", marginTop: 4 }}>
                  {[
                    { key: "visual", label: "Form Builder" },
                    { key: "json",   label: "JSON Mode" },
                  ].map(t => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setEditorTab(t.key)}
                      style={{
                        padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
                        fontSize: 12, fontWeight: 600,
                        color: editorTab === t.key ? "#8b5cf6" : "#64748b",
                        borderBottom: editorTab === t.key ? "2px solid #8b5cf6" : "none",
                        transition: "color 0.2s",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* TAB 1: VISUAL BUILDER */}
                {editorTab === "visual" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>Specify matches and actions using visual helper fields.</p>

                    <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 16, background: "rgba(255,255,255,0.01)" }}>
                      <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#a78bfa" }}>Rule Matching Criteria</p>
                      
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                          Ethernet Type
                          <select
                            style={S.input}
                            value={formData.etherType}
                            onChange={e => setFormData(prev => ({ ...prev, etherType: e.target.value }))}
                          >
                            <option value="2048">IPv4 (2048)</option>
                            <option value="2054">ARP (2054)</option>
                            <option value="34525">IPv6 (34525)</option>
                          </select>
                        </label>

                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                          Ingress Port (In-Port)
                          <input
                            placeholder="e.g. 1, 2"
                            style={S.input}
                            value={formData.inPort}
                            onChange={e => setFormData(prev => ({ ...prev, inPort: e.target.value }))}
                          />
                        </label>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                          Source IP Network (CIDR)
                          <input
                            placeholder="e.g. 10.0.0.1/32"
                            style={S.input}
                            value={formData.ipv4Source}
                            onChange={e => setFormData(prev => ({ ...prev, ipv4Source: e.target.value }))}
                          />
                        </label>

                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                          Destination IP Network (CIDR)
                          <input
                            placeholder="e.g. 10.0.0.8/32"
                            style={S.input}
                            value={formData.ipv4Destination}
                            onChange={e => setFormData(prev => ({ ...prev, ipv4Destination: e.target.value }))}
                          />
                        </label>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                          IP Protocol
                          <select
                            style={S.input}
                            value={formData.protocol}
                            onChange={e => setFormData(prev => ({ ...prev, protocol: e.target.value }))}
                          >
                            <option value="none">Any</option>
                            <option value="6">TCP (6)</option>
                            <option value="17">UDP (17)</option>
                            <option value="1">ICMP (1)</option>
                          </select>
                        </label>

                        {formData.protocol !== "none" && formData.protocol !== "1" && (
                          <>
                            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                              Source Port
                              <input
                                placeholder="e.g. 80"
                                style={S.input}
                                value={formData.srcPort}
                                onChange={e => setFormData(prev => ({ ...prev, srcPort: e.target.value }))}
                              />
                            </label>

                            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                              Dest Port
                              <input
                                placeholder="e.g. 8080"
                                style={S.input}
                                value={formData.dstPort}
                                onChange={e => setFormData(prev => ({ ...prev, dstPort: e.target.value }))}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 16, background: "rgba(255,255,255,0.01)" }}>
                      <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#34d399" }}>Instruction & Action Configuration</p>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                          Action Type
                          <select
                            style={S.input}
                            value={formData.actionType}
                            onChange={e => setFormData(prev => ({ ...prev, actionType: e.target.value }))}
                          >
                            <option value="output">Output to Port</option>
                            <option value="drop">Drop Packet</option>
                            <option value="controller">Send to Controller</option>
                          </select>
                        </label>

                        {formData.actionType === "output" && (
                          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                            Output Node Connector
                            <input
                              placeholder="e.g. 2, 3, NORMAL"
                              style={S.input}
                              value={formData.outputPort}
                              onChange={e => setFormData(prev => ({ ...prev, outputPort: e.target.value }))}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: RAW JSON MODE */}
                {editorTab === "json" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <select
                          style={{ ...S.input, padding: "5px 10px", fontSize: 11 }}
                          onChange={(e) => {
                            if (e.target.value) {
                              applyTemplate(e.target.value);
                              e.target.value = "";
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Load JSON Template...</option>
                          <option value="forward">Forward Port 1 to Port 2</option>
                          <option value="drop_ip">Drop Source IP (10.0.0.99)</option>
                          <option value="tcp_controller">Redirect TCP 80 to Controller</option>
                        </select>
                        <button
                          type="button"
                          onClick={beautifyJson}
                          style={{ padding: "5px 10px", fontSize: 11, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", borderRadius: 6, cursor: "pointer" }}
                        >
                          Format JSON
                        </button>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>Match Criteria JSON</span>
                        {matchError && <span style={{ fontSize: 10, color: "#ef4444" }}>{matchError}</span>}
                      </div>
                      <textarea
                        rows={6}
                        style={S.textarea}
                        value={formData.matchRaw}
                        onChange={e => {
                          const v = e.target.value;
                          setFormData(p => ({ ...p, matchRaw: v }));
                          validateJson("match", v);
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>Instructions JSON</span>
                        {instError && <span style={{ fontSize: 10, color: "#ef4444" }}>{instError}</span>}
                      </div>
                      <textarea
                        rows={6}
                        style={S.textarea}
                        value={formData.instructionsRaw}
                        onChange={e => {
                          const v = e.target.value;
                          setFormData(p => ({ ...p, instructionsRaw: v }));
                          validateJson("instructions", v);
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Timeout settings */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
                  <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>Flow Rule Expirations (Optional)</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                      Idle Timeout (Seconds)
                      <input
                        type="number"
                        placeholder="Unlimited"
                        style={S.input}
                        value={formData.idleTimeout}
                        onChange={e => setFormData(prev => ({ ...prev, idleTimeout: e.target.value }))}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                      Hard Timeout (Seconds)
                      <input
                        type="number"
                        placeholder="Unlimited"
                        style={S.input}
                        value={formData.hardTimeout}
                        onChange={e => setFormData(prev => ({ ...prev, hardTimeout: e.target.value }))}
                      />
                    </label>
                  </div>
                </div>

              </div>

              {/* Modal Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    padding: "9px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.04)", color: "#94a3b8", fontSize: 13, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editorTab === "json" && (!!matchError || !!instError)}
                  style={{
                    padding: "9px 18px", borderRadius: 10, border: "none",
                    background: (editorTab === "json" && (!!matchError || !!instError)) ? "rgba(255,255,255,0.1)" : "#8b5cf6",
                    color: (editorTab === "json" && (!!matchError || !!instError)) ? "#64748b" : "#fff",
                    fontSize: 13, fontWeight: 600, cursor: (editorTab === "json" && (!!matchError || !!instError)) ? "not-allowed" : "pointer",
                  }}
                >
                  Save Flow Rule
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

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
