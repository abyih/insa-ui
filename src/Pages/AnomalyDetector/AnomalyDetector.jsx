import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getNodes } from "../../api/api-controller";

const SERVER_URLS = {
  ONLINE:  "http://localhost:5001",
  OFFLINE: "http://localhost:5002",
};

const POLL_MS = 15_000;

// Online IF Features (from ODL flow tables)
const IF_FEATURES = [
  { key: "avg_packet_size",   abbr: "APS", label: "Avg Packet Size", unit: "bytes" },
  { key: "bytes_per_second",  abbr: "B/S", label: "Bytes / Second",  unit: "bytes" },
  { key: "packet_count",      abbr: "PKT", label: "Packet Count",    unit: "pkts"  },
  { key: "active_flow_count", abbr: "AFL", label: "Active Flows",    unit: "flows" },
  { key: "asymmetry",         abbr: "ASY", label: "Asymmetry",       unit: ""      },
];

// Offline RF Features (automatically extracted from ODL)
const RF_FEATURES = [
  { key: "avg_pkt_size",         abbr: "APS", label: "Avg Packet Size",  unit: "bytes" },
  { key: "total_duration_sec",   abbr: "DUR", label: "Flow Duration",    unit: "sec"   },
  { key: "bytes_per_sec",        abbr: "B/S", label: "Bytes / Second",   unit: "B/s"   },
  { key: "tx_rx_byte_asymmetry", abbr: "ASY", label: "TX/RX Asymmetry",  unit: "0-1"   },
  { key: "pktcount",             abbr: "PKT", label: "Packet Count",     unit: "pkts"  },
  { key: "tx_bytes",             abbr: "TXB", label: "TX Bytes",         unit: "bytes" },
];

function fmt(v) {
  if (v == null) return "—";
  return typeof v === "number" ? parseFloat(v.toFixed(3)).toLocaleString() : String(v);
}

export default function AnomalyDetector() {
  const [mode,         setMode]         = useState("ONLINE");
  const [results,      setResults]      = useState({});      // IF results: { switch_id: data }
  const [rfResults,    setRfResults]    = useState({});      // RF results: { switch_id: data }
  const [lastFeatures, setLastFeatures] = useState(null);    // IF features
  const [log,          setLog]          = useState([]);
  const [connected,    setConnected]    = useState({ ONLINE: null, OFFLINE: null });
  const [running,      setRunning]      = useState(false);
  const [lastPollTime, setLastPollTime] = useState(null);
  const intervalRef = useRef(null);
  const prevFlowStatsRef = useRef({})

  // ── Health checks ───────────────────────────────────────────────────────────
  const checkHealth = useCallback(async () => {
    const check = async (key, url) => {
      try { 
        const res = await fetch(`${url}/health`);
        if (res.ok) {
          setConnected(prev => ({ ...prev, [key]: true }));
        } else {
          console.log(`[Health] ${key} server returned ${res.status}`);
          setConnected(prev => ({ ...prev, [key]: false }));
        }
      } catch (err) { 
        console.log(`[Health] ${key} server error:`, err.message);
        setConnected(prev => ({ ...prev, [key]: false })); 
      }
    };
    
    check("ONLINE", SERVER_URLS.ONLINE);
    check("OFFLINE", SERVER_URLS.OFFLINE);
  }, []);

  useEffect(() => { checkHealth(); }, [checkHealth]);

  // ── Extract RF features from ODL ────────────────────────────────────────────
  const extractRFFeatures = useCallback((rawOdl, switchId) => {
    const nodes = rawOdl?.["opendaylight-inventory:nodes"]?.node ?? []
    const node  = nodes.find(n => n.id === switchId)
    if (!node) return null

    let totalDeltaPkt = 0, totalDeltaBytes = 0, totalDeltaTime = 0, flowCount = 0
    const now = Date.now() / 1000

    for (const table of node["flow-node-inventory:table"] ?? []) {
      for (const flow of table["flow"] ?? []) {
        const s   = flow["opendaylight-flow-statistics:flow-statistics"] ?? {}
        const pkt = parseInt(s["packet-count"] ?? s["packetCount"] ?? 0)
        const byt = parseInt(s["byte-count"]   ?? s["byteCount"]   ?? 0)
        const flowId = flow["id"]

        if (pkt === 0 && byt === 0) continue

        const flowKey = switchId + ":" + flowId
        const prev = prevFlowStatsRef.current[flowKey]

        // Always update with current values
        prevFlowStatsRef.current[flowKey] = { packets: pkt, bytes: byt, ts: now }

        if (prev === undefined) continue  // first poll, no delta yet

        const deltaPkt   = Math.max(0, pkt  - prev.packets)
        const deltaBytes = Math.max(0, byt - prev.bytes)
        const deltaTime  = Math.max(1, now  - prev.ts)

        if (deltaPkt === 0 && deltaBytes === 0) continue  // no new traffic

        totalDeltaPkt   += deltaPkt
        totalDeltaBytes += deltaBytes
        totalDeltaTime  += deltaTime
        flowCount       += 1
      }
    }

    if (flowCount === 0) return null

    const avgDeltaTime = totalDeltaTime / flowCount

    return {
      src:                  switchId,
      avg_pkt_size:         totalDeltaPkt > 0 ? totalDeltaBytes / totalDeltaPkt : 0,
      total_duration_sec:   avgDeltaTime,
      bytes_per_sec:        totalDeltaBytes / avgDeltaTime,
      tx_rx_byte_asymmetry: 1.0,
      pktcount:             totalDeltaPkt,
      tx_bytes:             totalDeltaBytes,
    }
  }, [])

  // ── Online IF polling ───────────────────────────────────────────────────────
  const sendOnline = useCallback(async () => {
    let rawOdl
    try {
      rawOdl = await getNodes()
    } catch (err) {
      console.error("sendOnline error - getNodes failed:", err)
      setConnected(p => ({ ...p, ONLINE: false }))
      return
    }

    const nodes   = rawOdl?.["opendaylight-inventory:nodes"]?.node ?? []
    const ids     = nodes
      .map(n => n.id)
      .filter(id => id && !id.startsWith("host:") && !id.includes(":LOCAL") && !/openflow:\d+:\d+$/.test(id))
    const targets = ids.length > 0 ? ids : ["global"]
    const ts      = new Date().toLocaleTimeString()

    let atLeastOneSuccess = false

    for (const sid of targets) {
      try {
        const res  = await fetch(`${SERVER_URLS.ONLINE}/detect`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ switch_id: sid, raw_odl: rawOdl }),
        })
        
        if (!res.ok) {
          console.error(`sendOnline error - HTTP ${res.status} for ${sid}`)
          continue
        }
        
        const data = await res.json()
        
        // Store results with worst-case aggregation
        setResults(prev => {
          const next = { ...prev, [sid]: data }
          
          // Find worst result for display
          const allVals = Object.values(next)
          const worst = allVals.reduce((worst, current) => {
            const worstSeverity = worst?.state === "ATTACK" ? 3 : 
                                 worst?.state === "SUSPICIOUS" ? 2 : 
                                 worst?.state === "NORMAL" ? 1 : 0
            const currSeverity = current?.state === "ATTACK" ? 3 : 
                                current?.state === "SUSPICIOUS" ? 2 : 
                                current?.state === "NORMAL" ? 1 : 0
            return currSeverity > worstSeverity ? current : worst
          }, allVals[0])
          
          setLastFeatures(worst?.features ?? null)
          return next
        })
        
        setLog(prev => [{ ...data, _ts: ts, _mode: "ONLINE", switch_id: sid }, ...prev.slice(0, 49)])
        atLeastOneSuccess = true
      } catch (err) {
        console.error(`sendOnline error - fetch failed for ${sid}:`, err)
      }
    }
    
    // Update connection status based on whether we got any successful responses
    setConnected(p => ({ ...p, ONLINE: atLeastOneSuccess || targets.length === 0 }))
  }, [])

  // ── Offline RF polling ──────────────────────────────────────────────────────
  const sendOffline = useCallback(async () => {
    console.log("[sendOffline] fired")
    let rawOdl
    try { 
      rawOdl = await getNodes() 
    } catch (err) { 
      console.error("sendOffline error - getNodes failed:", err)
      setConnected(p => ({ ...p, OFFLINE: false }))
      return 
    }

    const nodes   = rawOdl?.["opendaylight-inventory:nodes"]?.node ?? []
    const ids     = nodes
      .map(n => n.id)
      .filter(id => id && !id.startsWith("host:") && !id.includes(":LOCAL") && !/openflow:\d+:\d+$/.test(id))
    console.log("[sendOffline] targets:", ids)
    const targets = ids.length > 0 ? ids : ["global"]

    let atLeastOneSuccess = false

    for (const sid of targets) {
      const features = extractRFFeatures(rawOdl, sid)
      console.log("[sendOffline] features for", sid, ":", features)
      if (!features) {
        // No active flows with traffic, set to NORMAL
        const normalData = {
          src: sid,
          state: "NORMAL",
          reason: "No active flows with traffic",
          attack_prob: 0,
          rf_zone: "NORMAL"
        }
        setRfResults(prev => ({
          ...prev,
          [sid]: normalData
        }))
        setLog(prev => [{
          ...normalData,
          _ts:   new Date().toLocaleTimeString(),
          _mode: "OFFLINE"
        }, ...prev.slice(0, 49)])
        continue
      }

      try {
        const res  = await fetch(`${SERVER_URLS.OFFLINE}/detect`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(features),
        })
        
        if (!res.ok) {
          console.error(`sendOffline error - HTTP ${res.status} for ${sid}`)
          continue
        }
        
        const data = await res.json()
        
        // Store results with worst-case aggregation (same pattern as IF)
        setRfResults(prev => {
          const next = { ...prev, [data.src]: data }
          
          // Find worst result for display
          const allVals = Object.values(next)
          const worst = allVals.reduce((worst, current) => {
            const worstSeverity = worst?.state === "ATTACK" ? 3 : 
                                 worst?.state === "SUSPICIOUS" ? 2 : 
                                 worst?.state === "NORMAL" ? 1 : 0
            const currSeverity = current?.state === "ATTACK" ? 3 : 
                                current?.state === "SUSPICIOUS" ? 2 : 
                                current?.state === "NORMAL" ? 1 : 0
            return currSeverity > worstSeverity ? current : worst
          }, allVals[0])
          
          setLastFeatures(worst?.features ?? null)
          return next
        })
        
        setLog(prev => [{
          ...data,
          _ts:   new Date().toLocaleTimeString(),
          _mode: "OFFLINE"
        }, ...prev.slice(0, 49)])
        
        atLeastOneSuccess = true
      } catch (err) {
        console.error(`sendOffline error - fetch failed for ${sid}:`, err)
      }
    }
    
    // Update connection status based on whether we got any successful responses
    setConnected(p => ({ ...p, OFFLINE: atLeastOneSuccess || targets.length === 0 }))
  }, [extractRFFeatures])

  // ── Mode-specific detect dispatcher ─────────────────────────────────────────
  const sendDetect = useCallback(async () => {
    const startTime = Date.now()
    console.log(`[DEBUG] sendDetect started at ${new Date(startTime).toLocaleTimeString()} for mode: ${mode}`)
    
    try {
      if (mode === "ONLINE")  return await sendOnline()
      if (mode === "OFFLINE") return await sendOffline()
      if (mode === "HYBRID")  { 
        // Run both in parallel, don't let one failure stop the other
        await Promise.allSettled([sendOnline(), sendOffline()])
      }
    } catch (err) {
      console.error("sendDetect unhandled error:", err)
    } finally {
      const endTime = Date.now()
      console.log(`[DEBUG] sendDetect completed in ${endTime - startTime}ms`)
      setLastPollTime(endTime)
    }
  }, [mode, sendOnline, sendOffline])

  // ── Polling control ─────────────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (intervalRef.current) return
    setRunning(true)
    sendDetect()
    intervalRef.current = setInterval(() => {
      sendDetect()
    }, POLL_MS)
  }, [sendDetect])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setRunning(false)
  }, [])

  useEffect(() => () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
  }, [])

  // Stop polling when switching modes
  const switchMode = (newMode) => {
    setMode(newMode)
    // Clear appropriate results
    if (newMode === "ONLINE") {
      setRfResults({})
      prevFlowStatsRef.current = {}  // Clear flow stats when switching away from OFFLINE
    } else if (newMode === "OFFLINE") {
      setResults({})
      setLastFeatures(null)
      prevFlowStatsRef.current = {}  // Start fresh with OFFLINE mode
    } else if (newMode === "HYBRID") {
      prevFlowStatsRef.current = {}  // Clear for HYBRID as well
    }
  }

  // ── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = async () => {
    stopPolling()
    
    // Reset appropriate server
    try {
      if (mode === "ONLINE") {
        await fetch(`${SERVER_URLS.ONLINE}/reset`, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: "{}" 
        })
      } else if (mode === "OFFLINE") {
        await fetch(`${SERVER_URLS.OFFLINE}/reset`, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: "{}" 
        })
      }
    } catch { /* ignore */ }
    
    // Clear UI state
    if (mode === "ONLINE") {
      setResults({})
      setLastFeatures(null)
    } else {
      setRfResults({})
    }
    setLog([])
    prevFlowStatsRef.current = {}
    checkHealth()
    
    // Clear mitigation state on reset
    setBlockedSwitches(new Set())
    setMitigationLog([])
  }



  // ── Derived state ───────────────────────────────────────────────────────────
  const allIFResults = Object.values(results)
  const worstIFResult = allIFResults.length > 0
    ? allIFResults.reduce((worst, current) => {
        const worstSeverity = worst?.state === "ATTACK" ? 3 : 
                             worst?.state === "SUSPICIOUS" ? 2 : 
                             worst?.state === "NORMAL" ? 1 : 0
        const currSeverity = current?.state === "ATTACK" ? 3 : 
                            current?.state === "SUSPICIOUS" ? 2 : 
                            current?.state === "NORMAL" ? 1 : 0
        return currSeverity > worstSeverity ? current : worst
      })
    : null

  const allRFResults = Object.values(rfResults)
  const worstRFResult = allRFResults.length > 0
    ? allRFResults.reduce((worst, current) => {
        const worstSeverity = worst?.state === "ATTACK" ? 3 : 
                             worst?.state === "SUSPICIOUS" ? 2 : 
                             worst?.state === "NORMAL" ? 1 : 0
        const currSeverity = current?.state === "ATTACK" ? 3 : 
                            current?.state === "SUSPICIOUS" ? 2 : 
                            current?.state === "NORMAL" ? 1 : 0
        return currSeverity > worstSeverity ? current : worst
      })
    : null

  // ── Attack detection calculations ───────────────────────────────────────────
  const isIFAttack = allIFResults.some(r => r.state === "ATTACK")
  const isIFSuspicious = allIFResults.some(r => r.state === "SUSPICIOUS") && !isIFAttack
  const isRFAttack = allRFResults.some(r => r.state === "ATTACK")
  const isRFSuspicious = allRFResults.some(r => r.state === "SUSPICIOUS") && !isRFAttack
  
  const isAttack = mode === "ONLINE" ? isIFAttack : 
                   mode === "OFFLINE" ? isRFAttack : 
                   (isIFAttack || isRFAttack)
  const isSuspicious = mode === "ONLINE" ? isIFSuspicious :
                       mode === "OFFLINE" ? isRFSuspicious : false

  // ── Mitigation logic ─────────────────────────────────────────────────────────
  const canBlock = useMemo(() => {
    const ifPhase   = worstIFResult?.phase ?? null
    const ifState   = worstIFResult?.state ?? null
    
    const ifInDetection = ifPhase === "DETECTION"
    const ifInBaseline  = ifPhase === "BASELINE" ||
                          ifPhase === "TRAINED"   ||
                          ifPhase === "SKIP"      ||
                          ifPhase === null         // IF not started yet
    
    const ifAttack   = allIFResults.some(r => r.state === "ATTACK")
    const rfAttack   = allRFResults.some(r => r.state === "ATTACK")
    const rfHighConf = allRFResults.some(r => (r.attack_prob ?? 0) >= 0.85)

    // Condition 1: IF in detection + ATTACK, AND RF in ATTACK
    if (ifInDetection && ifAttack && rfAttack) return true

    // Condition 2: RF high confidence regardless of IF state
    if (rfHighConf) return true

    // Condition 3: IF not in detection (baseline/trained/null) AND RF ATTACK
    if (!ifInDetection && rfAttack) return true

    return false
  }, [worstIFResult, allIFResults, allRFResults])

  // ── Mitigation state ────────────────────────────────────────────────────────
  const [blockedSwitches, setBlockedSwitches] = useState(new Set())
  const [mitigationLog,   setMitigationLog]   = useState([])
  const [rollbackLoading, setRollbackLoading] = useState(false)

  // ── Mitigation functions ────────────────────────────────────────────────────
  const handleBlock = useCallback(async () => {
    // Find all switches currently in ATTACK state
    const attackingSwitches = [
      ...allIFResults.filter(r => r.state === "ATTACK").map(r => r.switch_id),
      ...allRFResults.filter(r => r.state === "ATTACK").map(r => r.src),
    ]
    // Deduplicate
    const uniqueSwitches = [...new Set(attackingSwitches)]

    for (const switchId of uniqueSwitches) {
      if (blockedSwitches.has(switchId)) continue  // already blocked

      try {
        const res = await fetch(`${SERVER_URLS.ONLINE}/mitigation/block`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            switch_id: switchId,
            reason:    "Admin triggered — anomaly detected"
          }),
        })
        const data = await res.json()

        if (data.success) {
          setBlockedSwitches(prev => new Set([...prev, switchId]))
          setMitigationLog(prev => [{
            ts:        new Date().toLocaleTimeString(),
            action:    "BLOCKED",
            switch_id: switchId,
            flow_id:   data.flow_id,
            priority:  data.priority,
          }, ...prev])
        }
      } catch (err) {
        console.error("Block failed for", switchId, err)
      }
    }
  }, [allIFResults, allRFResults, blockedSwitches])

  const handleRollback = useCallback(async () => {
    setRollbackLoading(true)
    try {
      const res  = await fetch(`${SERVER_URLS.ONLINE}/mitigation/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const data = await res.json()

      setBlockedSwitches(new Set(data.switches_failed))  // only failed ones stay "blocked"

      setMitigationLog(prev => [{
        ts:               new Date().toLocaleTimeString(),
        action:            data.switches_failed.length > 0 ? "ROLLBACK_PARTIAL" : "ROLLBACK",
        clean:             data.switches_clean,
        cleaned:           data.switches_cleaned,
        failed:            data.switches_failed,
        per_switch:        data.per_switch,
      }, ...prev])

    } catch (err) {
      console.error("Rollback failed", err)
    } finally {
      setRollbackLoading(false)
    }
  }, [])

  const isBaseline = allIFResults.length > 0 && allIFResults.every(r => r.phase === "BASELINE")
  const bCollected = worstIFResult?.collected || 0
  const bTotal = bCollected + (worstIFResult?.remaining || 100)
  const bPct = Math.min(100, (bCollected / bTotal) * 100)

  const onlineConn = connected.ONLINE
  const offlineConn = connected.OFFLINE
  
  const activeConn = mode === "ONLINE" ? onlineConn :
                     mode === "OFFLINE" ? offlineConn :
                     mode === "HYBRID" ? (onlineConn || offlineConn) : false

  // Get features for display
  const features    = (mode === "OFFLINE" || mode === "HYBRID") ? RF_FEATURES : IF_FEATURES
  const featureData = (mode === "OFFLINE" || mode === "HYBRID") ? worstRFResult?.features : lastFeatures

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-800">Anomaly Detector</h1>
          
          {/* mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden ml-3">
            <button onClick={() => switchMode("ONLINE")}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                mode === "ONLINE" ? "bg-indigo-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
              }`}>
              Online
            </button>
            <button onClick={() => switchMode("OFFLINE")}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                mode === "OFFLINE" ? "bg-emerald-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
              }`}>
              Offline
            </button>
            <button onClick={() => switchMode("HYBRID")}
              className={`px-3 py-1 text-xs font-semibold transition-colors ${
                mode === "HYBRID" ? "bg-purple-500 text-white" : "bg-white text-gray-500 hover:bg-gray-50"
              }`}>
              Hybrid
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
            activeConn === null ? "bg-gray-200 text-gray-500" :
            activeConn ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
          }`}>
            {activeConn === null ? "Checking…" : activeConn ? "Online" : "Offline"}
          </span>
          {lastPollTime && (
            <span className="text-xs text-gray-500">
              Last poll: {new Date(lastPollTime).toLocaleTimeString()}
            </span>
          )}
          
          <button onClick={running ? stopPolling : startPolling}
            disabled={activeConn === false}
            className={`px-4 py-1.5 rounded text-sm font-semibold text-white ${
              running ? "bg-red-500 hover:bg-red-600" : "bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40"
            }`}>
            {running ? "Stop" : "Start Polling"}
          </button>
          <button onClick={sendDetect} disabled={activeConn === false}
            className="px-4 py-1.5 rounded text-sm font-semibold bg-gray-200 hover:bg-gray-300 disabled:opacity-40">
            Send Once
          </button>
          
          <button onClick={handleReset}
            className="px-4 py-1.5 rounded text-sm font-semibold bg-yellow-100 hover:bg-yellow-200 text-yellow-800">
            Reset
          </button>
        </div>
      </div>

      {/* mode description */}
      <div className={`text-xs px-4 py-2 rounded-lg font-medium ${
        mode === "ONLINE" ? "bg-indigo-50 text-indigo-700" : 
        mode === "OFFLINE" ? "bg-emerald-50 text-emerald-700" :
        "bg-purple-50 text-purple-700"
      }`}>
        {mode === "ONLINE" ? (
          <>
            <span className="font-semibold">Online Isolation Forest (Live SDN Detection):</span> Unsupervised online learning using real-time ODL flow table statistics with baseline collection, adaptive thresholds, and state machine.
          </>
        ) : mode === "OFFLINE" ? (
          <>
            <span className="font-semibold">Offline Random Forest (Automated RF Detection):</span> Polls live ODL flow records every 15 seconds — scores aggregated per-switch features against the pretrained RF model.
          </>
        ) : (
          <>
            <span className="font-semibold">Hybrid Mode:</span> Runs both Online IF and Offline RF detection simultaneously.
          </>
        )}
      </div>

      {/* status card */}
      <div className={`rounded-xl border-2 p-5 transition-colors ${
        isAttack ? "bg-red-50 border-red-400" : 
        isSuspicious ? "bg-yellow-50 border-yellow-400" : 
        "bg-green-50 border-green-300"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-lg font-bold ${
              isAttack ? "bg-red-500" : 
              isSuspicious ? "bg-yellow-500" : 
              "bg-green-500"
            }`}>
              {isAttack ? "✕" : isSuspicious ? "⚠" : "✓"}
            </div>
            <div>
              <p className={`text-lg font-bold leading-tight ${
                isAttack ? "text-red-700" : 
                isSuspicious ? "text-yellow-700" : 
                "text-green-700"
              }`}>
                {mode === "ONLINE" ? "SDN Traffic" : mode === "OFFLINE" ? "RF Classification" : "Hybrid Detection"} 
                {isAttack ? " Attack Detected" : isSuspicious ? " Suspicious" : " Normal"}
              </p>
              <p className="text-xs text-gray-400">
                {mode === "ONLINE" && worstIFResult
                  ? `${worstIFResult.phase} — Switch: ${worstIFResult.switch_id}`
                  : mode === "OFFLINE" && worstRFResult
                  ? `DETECTION — Src: ${worstRFResult.src}`
                  : mode === "HYBRID" && (worstIFResult || worstRFResult)
                  ? `HYBRID — ${worstIFResult ? "IF active" : ""}${worstIFResult && worstRFResult ? " + " : ""}${worstRFResult ? "RF active" : ""}`
                  : "Waiting for detection…"}
              </p>
            </div>
          </div>
          <span className={`text-xs font-bold px-4 py-1 rounded-full border ${
            isAttack ? "bg-red-100 text-red-700 border-red-300" : 
            isSuspicious ? "bg-yellow-100 text-yellow-700 border-yellow-300" : 
            "bg-green-100 text-green-700 border-green-300"
          }`}>
            {isAttack ? "ATTACK" : isSuspicious ? "SUSPICIOUS" : "NORMAL"}
          </span>
        </div>

        {/* Online IF detail */}
        {mode === "ONLINE" && worstIFResult?.phase === "DETECTION" && (
          <div className="mt-4 border-t pt-3 space-y-0.5">
            <p className="text-xs text-indigo-600 font-semibold">Isolation Forest Model</p>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isIFAttack ? "bg-red-500" : "bg-green-500"}`} />
              <span className={`text-sm font-semibold ${isIFAttack ? "text-red-700" : "text-green-700"}`}>
                {isIFAttack ? "Anomaly" : "Benign"}
              </span>
              <span className="text-xs text-gray-400 ml-1">
                attack prob: {worstIFResult?.percentile != null ? (100 - worstIFResult.percentile).toFixed(1) : "—"}%
              </span>
            </div>
            <p className="text-xs text-gray-400 pl-4">
              IF score: {worstIFResult?.raw_score?.toFixed(3) ?? "—"} — {worstIFResult?.state}
            </p>
          </div>
        )}

        {/* Offline RF detail */}
        {mode === "OFFLINE" && worstRFResult && (
          <div className="mt-4 border-t pt-3 space-y-0.5">
            <p className="text-xs text-emerald-600 font-semibold">Random Forest Model</p>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isRFAttack ? "bg-red-500" : isRFSuspicious ? "bg-yellow-500" : "bg-green-500"}`} />
              <span className={`text-sm font-semibold ${isRFAttack ? "text-red-700" : isRFSuspicious ? "text-yellow-700" : "text-green-700"}`}>
                {worstRFResult.state}
              </span>
              <span className="text-xs text-gray-400 ml-1">
                attack prob: {worstRFResult.attack_prob != null ? (worstRFResult.attack_prob * 100).toFixed(1) : "—"}%
              </span>
            </div>
            <p className="text-xs text-gray-400 pl-4">
              zone: {worstRFResult.rf_zone ?? "—"} — {worstRFResult.reason}
            </p>
          </div>
        )}

        {/* Baseline progress (ONLINE only) */}
        {mode === "ONLINE" && isBaseline && (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs text-blue-600 font-semibold mb-1">
              Collecting baseline… {bCollected} / {bTotal} samples
            </p>
            <div className="w-full bg-blue-100 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${bPct}%` }} />
            </div>
          </div>
        )}

        {/* Block button section */}
        {isAttack && (
          <div className="mt-4 border-t pt-3 flex items-center gap-3">
            <button
              onClick={handleBlock}
              disabled={!canBlock || blockedSwitches.size > 0}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white
                         bg-red-600 hover:bg-red-700 disabled:opacity-40
                         disabled:cursor-not-allowed transition-colors"
            >
              Block Attacking Switches
            </button>

            {blockedSwitches.size > 0 && (
              <button
                onClick={handleRollback}
                disabled={rollbackLoading}
                className="px-4 py-2 rounded-lg text-sm font-bold
                           bg-gray-700 hover:bg-gray-800 text-white
                           disabled:opacity-40 transition-colors"
              >
                {rollbackLoading ? "Rolling back…" : "Rollback All Blocks"}
              </button>
            )}

            {blockedSwitches.size > 0 && (
              <span className="text-xs text-red-600 font-semibold">
                {blockedSwitches.size} switch{blockedSwitches.size > 1 ? "es" : ""} blocked
              </span>
            )}

            {!canBlock && (
              <span className="text-xs text-gray-400">
                Requires RF attack detection or high confidence (≥85%)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Feature cards - mode specific */}
      {featureData && (
        <div className="grid grid-cols-5 gap-3">
          {features.map(({ key, abbr, label, unit }) => (
            <div key={key} className={`bg-white border rounded-xl p-4 shadow-sm ${
              (mode === "OFFLINE" || mode === "HYBRID") ? "border-emerald-100" : "border-gray-200"
            }`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                (mode === "OFFLINE" || mode === "HYBRID") ? "text-emerald-500" : "text-gray-400"
              }`}>{abbr}</p>
              <p className="text-xl font-bold text-gray-800">{fmt(featureData[key])}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
              {unit && <p className="text-xs text-gray-400">{unit}</p>}
            </div>
          ))}
        </div>
      )}

      {/* event log */}
      {log.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <p className="font-semibold text-sm text-gray-700">Event Log</p>
            <button onClick={() => setLog([])} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {["Time", "Mode", "Switch / Src", "State", "Score / Prob", "Phase / Zone"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map((e, i) => (
                  <tr key={i} className={`border-t ${e.state === "ATTACK" ? "bg-red-50" : ""}`}>
                    <td className="px-3 py-2 text-gray-400 font-mono">{e._ts}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-white text-xs font-semibold ${
                        e._mode === "ONLINE" ? "bg-indigo-500" : "bg-emerald-500"
                      }`}>
                        {e._mode === "ONLINE" ? "IF" : "RF"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono">{e.switch_id ?? e.src ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-white text-xs font-semibold ${
                        e.state === "ATTACK"      ? "bg-red-500"    :
                        e.state === "SUSPICIOUS"  ? "bg-yellow-500" :
                        e.state === "NORMAL"      ? "bg-green-500"  :
                        e.phase  === "BASELINE"   ? "bg-blue-400"   : "bg-gray-400"
                      }`}>
                        {e.state || e.phase || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {e._mode === "OFFLINE"
                        ? (e.attack_prob != null ? (e.attack_prob * 100).toFixed(1) + "%" : "—")
                        : (e.raw_score?.toFixed(4) ?? "—")}
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {e._mode === "OFFLINE" ? (e.rf_zone ?? "—") : (e.phase ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* mitigation log */}
      {mitigationLog.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <p className="font-semibold text-sm text-red-700">Mitigation Log</p>
            <button
              onClick={() => setMitigationLog([])}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          </div>
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-red-50 sticky top-0">
                <tr>
                  {["Time","Action","Switch","Flow ID","Priority"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-red-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mitigationLog.map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 font-mono text-gray-400">{e.ts}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-white text-xs font-bold ${
                        e.action === "BLOCKED"          ? "bg-red-500" :
                        e.action === "ROLLBACK"         ? "bg-gray-600" :
                        e.action === "ROLLBACK_PARTIAL" ? "bg-amber-600" : "bg-gray-400"
                      }`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono">{e.switch_id ?? "all"}</td>
                    <td className="px-3 py-2 font-mono text-gray-500">
                      {e.flow_id ?? (e.action === "ROLLBACK" || e.action === "ROLLBACK_PARTIAL" 
                        ? `${e.clean} clean, ${e.cleaned} cleaned, ${e.failed?.length || 0} failed` 
                        : `${e.removed || 0} removed`)}
                    </td>
                    <td className="px-3 py-2">{e.priority ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Show failed switches for partial rollbacks */}
          {mitigationLog.some(e => e.action === "ROLLBACK_PARTIAL" && e.failed?.length > 0) && (
            <div className="px-5 py-3 border-t bg-amber-50">
              <p className="text-sm font-semibold text-amber-800 mb-1">Rollback Failures Detected</p>
              {mitigationLog
                .filter(e => e.action === "ROLLBACK_PARTIAL" && e.failed?.length > 0)
                .map((e, i) => (
                  <div key={i} className="mb-2">
                    <p className="text-xs text-amber-700">
                      Failed to clear: {e.failed.join(", ")} — retry rollback or clear manually.
                    </p>
                    {e.per_switch && Object.entries(e.per_switch).map(([switchId, detail]) => (
                      detail.status === "failed" && detail.flows_stuck?.length > 0 && (
                        <div key={switchId} className="ml-3 mt-1 text-xs text-amber-600">
                          <span className="font-medium">{switchId}:</span> {detail.flows_stuck.join(", ")}
                        </div>
                      )
                    ))}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}