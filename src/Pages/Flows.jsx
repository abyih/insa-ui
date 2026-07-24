import React, { useEffect, useMemo, useState, useCallback } from "react";
import { getInventoryNodes, getNodeTables, getFlows } from "../api/flowService";

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
  input: {
    background: "var(--theme-bg)",
    border: "1px solid var(--theme-input-border)",
    borderRadius: 8,
    color: "var(--theme-fg)",
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
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
        })).sort((a, b) => Number(a.id) - Number(b.id));
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
    if (!selectedNode || selectedTable === "" || selectedTable === undefined || selectedTable === null) {
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>Operational Switch Flows</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Inspect real-time operational flow tables on switches</p>
          </div>
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
              Active Flow Rules for switch <strong style={{ color: "#fff" }}>{selectedNodeLabel || "none"}</strong> · Table <strong style={{ color: "#fff" }}>{selectedTable !== "" ? selectedTable : "—"}</strong>
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
              Retrieving OpenDaylight operational flow list…
            </div>
          ) : flows.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#64748b", fontSize: 13 }}>
              No operational flows active in Table {selectedTable !== "" ? selectedTable : "—"} on this switch.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                    {["Flow ID", "Priority", "Match Summary", "Instructions/Actions", "Timeouts"].map(h => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

export default Flows;
