import { createContext, useContext, useReducer, useEffect, useCallback, useState, useMemo } from "react";
import { cache } from "./cache";
import { getNodes, getNodeConnectors, getConnectionStats } from "../api/api-controller";
import { mapNodes } from "../mappers/nodes-mapper";
import { mapFlowStats } from "../mappers/flow-stats-mapper";
import NetworkTopologySvc from "../Pages/Topology/TopologyService";

// ─── Config ───────────────────────────────────────────────────────────────────
const POLL_INTERVAL = 15_000;

const TTL = {
  topology:   20_000,
  stats:      15_000,
  nodeDetail: 20_000,
};

// ─── Reducer ──────────────────────────────────────────────────────────────────
const init = { data: null, loading: false, error: null };

function reducer(state, action) {
  switch (action.type) {
    case "LOADING": return { ...state, loading: true,  error: null };
    case "SUCCESS": return { data: action.payload, loading: false, error: null };
    case "ERROR":   return { ...state, loading: false, error: action.payload };
    default:        return state;
  }
}

function detailReducer(state, action) {
  switch (action.type) {
    case "LOADING": return { ...state, [action.key]: { ...state[action.key], loading: true,  error: null } };
    case "SUCCESS": return { ...state, [action.key]: { data: action.payload, loading: false, error: null } };
    case "ERROR":   return { ...state, [action.key]: { ...state[action.key], loading: false, error: action.payload } };
    default:        return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const Ctx = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function DataPipelineProvider({ children }) {
  const [nodesState,    dispatchNodes]    = useReducer(reducer, init);
  const [flowsState,    dispatchFlows]    = useReducer(reducer, init);
  const [topologyState, dispatchTopology] = useReducer(reducer, init);
  const [statsState,    dispatchStats]    = useReducer(reducer, init);
  const [detailMap,     dispatchDetail]   = useReducer(detailReducer, {});

  // ── Core fetch: nodes + flowStats ────────────────────────────────────────
  const fetchCoreData = useCallback(async () => {
    try {
      const [rawInventory, rawTopology] = await Promise.all([
        getNodes().catch((err) => {
          console.warn("[Pipeline] Inventory nodes fetch failed:", err?.message);
          return null;
        }),
        NetworkTopologySvc.getNode("all").catch((err) => {
          console.warn("[Pipeline] Topology fetch for nodes failed:", err?.message);
          return null;
        }),
      ]);
      dispatchNodes({ type: "SUCCESS", payload: mapNodes(rawInventory, rawTopology) });
      dispatchFlows({ type: "SUCCESS", payload: mapFlowStats(rawInventory) });
    } catch (err) {
      const msg = err.message;
      dispatchNodes({ type: "ERROR", payload: msg });
      dispatchFlows({ type: "ERROR", payload: msg });
    }
  }, []);

  // ── Topology: on-demand ───────────────────────────────────────────────────
  const fetchTopology = useCallback(async (topoId = "flow:1", force = false) => {
    const KEY = `topology:${topoId}`;
    if (!force) {
      const hit = cache.get(KEY);
      if (hit) { dispatchTopology({ type: "SUCCESS", payload: hit }); return hit; }
    }
    dispatchTopology({ type: "LOADING" });
    try {
      const data = await NetworkTopologySvc.getNode(topoId);
      cache.set(KEY, data, TTL.topology);
      dispatchTopology({ type: "SUCCESS", payload: data });
      return data;
    } catch (err) {
      dispatchTopology({ type: "ERROR", payload: err.message });
    }
  }, []);

  // ── Connection stats: separate lightweight endpoint ───────────────────────
  const fetchStats = useCallback(async (force = false) => {
    const KEY = "stats";
    if (!force) {
      const hit = cache.get(KEY);
      if (hit) { dispatchStats({ type: "SUCCESS", payload: hit }); return hit; }
    }
    try {
      const data = await getConnectionStats();
      cache.set(KEY, data, TTL.stats);
      dispatchStats({ type: "SUCCESS", payload: data });
      return data;
    } catch (err) {
      dispatchStats({ type: "ERROR", payload: err.message });
    }
  }, []);

  // ── Node detail: on-demand ────────────────────────────────────────────────
  const fetchNodeDetail = useCallback(async (nodeId, force = false) => {
    const KEY = `nodeDetail:${nodeId}`;
    if (!force) {
      const hit = cache.get(KEY);
      if (hit) { dispatchDetail({ type: "SUCCESS", key: nodeId, payload: hit }); return hit; }
    }
    // Only show loading state on initial fetch, not background refreshes
    if (!force) {
      dispatchDetail({ type: "LOADING", key: nodeId });
    }
    try {
      const data = await getNodeConnectors(nodeId);
      cache.set(KEY, data, TTL.nodeDetail);
      dispatchDetail({ type: "SUCCESS", key: nodeId, payload: data });
      return data;
    } catch (err) {
      // Fallback for OVSDB / DevStack nodes not present in opendaylight-inventory
      try {
        const topo = await NetworkTopologySvc.getNode("all");
        const found = (topo?.nodes || []).find(
          (n) => n.id === nodeId || n.id?.includes(nodeId) || n.nodeDetails?.vmUuid === nodeId
        );
        if (found) {
          const details = found.nodeDetails || {};
          const tps = details.tps || (details.tapPort ? [{ tpId: details.tapPort, mac: details.mac }] : []);
          const fallbackData = {
            "opendaylight-inventory:node": [
              {
                id: found.id,
                "flow-node-inventory:ip-address": details.ip || details.connectionInfo?.["remote-ip"] || "N/A",
                "flow-node-inventory:hardware": details.type || found.group || "DevStack OVSDB Device",
                "flow-node-inventory:description": found.label || found.id,
                "flow-node-inventory:manufacturer": "Open vSwitch / DevStack",
                "flow-node-inventory:serial-number": details.bridgeUuid || details.vmUuid || "N/A",
                "flow-node-inventory:software": details.ovsVersion ? `OVS ${details.ovsVersion}` : "DevStack",
                "node-connector": tps.map((tp) => ({
                  id: tp.tpId || found.id,
                  "flow-node-inventory:name": tp.tpId || found.label,
                  "flow-node-inventory:hardware-address": tp.mac || details.mac || "N/A",
                  "flow-node-inventory:state": { live: true },
                })),
                "flow-node-inventory:table": [],
              },
            ],
          };
          cache.set(KEY, fallbackData, TTL.nodeDetail);
          dispatchDetail({ type: "SUCCESS", key: nodeId, payload: fallbackData });
          return fallbackData;
        }
      } catch (topoErr) {
        console.error("[Pipeline] Fallback error for node detail:", topoErr);
      }
      dispatchDetail({ type: "ERROR", key: nodeId, payload: err.message });
    }
  }, []);

  // ── Track authentication state reactively ─────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!localStorage.getItem("isAuthenticated")
  );

  useEffect(() => {
    // Listen for same-tab auth changes (custom event fired by Login)
    const onAuthChanged = () => {
      setIsAuthenticated(!!localStorage.getItem("isAuthenticated"));
    };
    window.addEventListener("auth-changed", onAuthChanged);
    // Listen for cross-tab auth changes
    window.addEventListener("storage", onAuthChanged);
    return () => {
      window.removeEventListener("auth-changed", onAuthChanged);
      window.removeEventListener("storage", onAuthChanged);
    };
  }, []);

  // ── Auto-poll every 15s after login ───────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    dispatchNodes({ type: "LOADING" });
    dispatchFlows({ type: "LOADING" });
    dispatchStats({ type: "LOADING" });

    fetchCoreData();
    fetchStats();

    const coreTimer  = setInterval(fetchCoreData,              POLL_INTERVAL);
    const statsTimer = setInterval(() => fetchStats(true),     POLL_INTERVAL);

    return () => {
      clearInterval(coreTimer);
      clearInterval(statsTimer);
    };
  }, [isAuthenticated, fetchCoreData, fetchStats]);

  const value = useMemo(() => ({
    nodes:     { ...nodesState,    fetch: fetchCoreData },
    flowStats: { ...flowsState,    fetch: fetchCoreData },
    topology:  { ...topologyState, fetch: fetchTopology },
    stats:     { ...statsState,    fetch: fetchStats },
    nodeDetail: {
      getSlice: (id) => detailMap[id] ?? init,
      fetch: fetchNodeDetail,
    },
    invalidateAll: () => cache.invalidateAll(),
  }), [nodesState, flowsState, topologyState, statsState, detailMap, fetchCoreData, fetchTopology, fetchStats, fetchNodeDetail]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
export function usePipeline() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePipeline must be inside DataPipelineProvider");
  return ctx;
}

export function useNodes()     { return usePipeline().nodes; }
export function useFlowStats() { return usePipeline().flowStats; }
export function useStats()     { return usePipeline().stats; }
export function useTopology(topoId = "flow:1") {
  const { topology } = usePipeline();
  return { ...topology, fetch: (force) => topology.fetch(topoId, force) };
}
export function useNodeDetail(nodeId) {
  const { nodeDetail } = usePipeline();
  const slice = nodeDetail.getSlice(nodeId);
  // Stable fetch reference so the consumer's useEffect doesn't re-run every render
  const fetchRef = useCallback((force) => nodeDetail.fetch(nodeId, force), [nodeDetail.fetch, nodeId]);
  return useMemo(() => ({ ...slice, fetch: fetchRef }), [slice, fetchRef]);
}
