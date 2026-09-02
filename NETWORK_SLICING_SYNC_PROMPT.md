# AI Prompt: Sync Network Slicing & AI Intent-Based Networking Subsystem

> **Instructions for your AI Assistant:**
> You are tasked with integrating the complete **SDN Network Slicing & AI Intent-Based Networking (IBN)** subsystem into this project to match the reference implementation. Follow the architecture, algorithms, API services, and UI components specified below. Implement all files with clean, production-ready code.

---

## 1. Subsystem Overview & Architectural Pillars

The Network Slicing subsystem provides dynamic, host-based network isolation and bandwidth control across OpenFlow 1.3 switches managed by ONOS (or OpenDaylight).

### 🏛️ The 6 Core Pillars:
1. **Host-Based Multi-Switch Slice Routing (OpenFlow Priority 40000)**:
   - Dynamic shortest-path BFS path computation across arbitrary multi-switch topologies (spine/leaf/mesh).
   - Installs bidirectional unicast forwarding rules on each switch hop matching `ETH_SRC` and `ETH_DST` with `IN_PORT` and `OUTPUT` actions.
   - Attaches `METER` rate-limiting instructions at ingress switches.
2. **Slice-Aware ARP Broadcast Routing (Priority 40000)**:
   - Groups ARP broadcast flows (`ETH_TYPE 2054`) by `(deviceId, inPort, eth_src)`.
   - Emits broadcast packets *strictly* to egress ports leading to peer hosts in the same slice. Prevents cross-slice broadcast leaks while eliminating broadcast storms.
3. **Cross-Slice Isolation Drop Boundary (Priority 39000)**:
   - Installs ingress drop rules `{ IN_PORT: port, ETH_SRC: mac }` with empty treatment instructions (DROP).
   - Because intra-slice peer rules run at Priority 40000, slice members communicate with zero latency, while unauthorized cross-slice or external traffic is dropped instantly.
4. **Physical Bandwidth Capacity Pool & Admission Control**:
   - Tracks a global physical capacity budget (default `100 MB/s` / `100,000 KB/s`, customizable).
   - Validates available unallocated bandwidth before creating slices, rejecting over-subscription in both manual and AI-generated workflows.
5. **AI Intent-Based Slicing Engine (IBN Layer)**:
   - Natural language compiler that translates operator intents (e.g. *"Create an ultra-reliable low latency URLLC slice for medical robotics between host 10.0.0.1 and 10.0.0.2 with 15 MB/s bandwidth"*) into concrete OpenFlow parameters.
   - **Multi-Provider Support**: Google Gemini API (`gemini-3.7-flash`, `gemini-1.5-flash`), Groq Cloud (`llama-3.3-70b-versatile`), OpenRouter, and a built-in **Offline Smart Heuristic Parser** (zero API key required).
   - Grounds prompt understanding against live ONOS discovered hosts, active switches, existing slices, and available capacity.
6. **Real-Time SLA Violation Monitoring & Visual Topology**:
   - Background polling daemon monitors ONOS meter drop statistics and delta throughput.
   - Fires `BURST_VIOLATION` SLA alerts and toasts when traffic exceeds 75% cap or meter drops packets.
   - Interactive `vis-network` topology diagram displaying 3-Tier Hierarchical layout (Core switch -> Leaf switches -> PC Hosts), VLAN isolation boundaries, live meter statistics, and slice filter pills.

---

## 2. Dependencies & Prerequisites

Ensure the following packages are installed in `package.json`:

```bash
npm install lucide-react framer-motion recharts vis-network vis-data axios
```

Ensure TailwindCSS (v3 or v4) is configured in your project.

---

## 3. File Structure to Create / Update

```
src/
├── api/
│   ├── api-controller.js             # Add ONOS Meter, Flow, Device, Link, Host REST helpers
│   ├── slicingService.js             # Core multi-switch path routing, meters, VLANs, admission control
│   └── aiIntentService.js            # AI Intent Engine (Gemini, Groq, OpenRouter, Offline Heuristic)
├── Components/
│   ├── SliceTopology.jsx             # Vis-Network 3-tier / organic slice topology visualizer
│   ├── IntentSlicing/
│   │   ├── AiIntentPanel.jsx         # AI Intent input, template pills, compilation steps, plan review
│   │   └── AiSettingsModal.jsx       # AI provider settings, API keys, connection testing
│   ├── Notifications/
│   │   ├── NotificationDrawer.jsx    # Slide-over alert drawer for SLA burst violations
│   │   └── ToastContainer.jsx        # Floating SLA alert toasts
│   └── Header/
│       └── Header.jsx                # Include SLA notification bell with unread badge & slicing nav link
├── context/
│   └── NotificationContext.jsx       # Global notification provider & background SLA meter polling
└── Pages/
    └── NetworkSlicing.jsx            # Main Network Slicing dashboard page
```

---

## 4. Detailed Implementation Specifications

### Step 1: `vite.config.js` Proxy Configuration
Configure proxy rules for ONOS REST API:

```javascript
// vite.config.js (inside server.proxy)
'/api/onos': {
  target: process.env.VITE_ODL_HOST || 'http://localhost:8181',
  changeOrigin: true,
  secure: false,
  rewrite: (path) => path.replace(/^\/api\/onos/, '/onos'),
  timeout: 5000,
  headers: {
    Authorization: 'Basic ' + Buffer.from('onos:rocks').toString('base64'),
  },
  configure: (proxy) => {
    proxy.on('proxyRes', (proxyRes) => {
      delete proxyRes.headers['www-authenticate'];
    });
  },
}
```

---

### Step 2: `src/api/api-controller.js` Additions
Add the following ONOS controller helper methods:

```javascript
// ONOS Axios Instance
const onosApi = axios.create({
  baseURL: "/api/onos/v1",
  timeout: 5000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: "Basic " + btoa("onos:rocks"),
  },
});

// Meters API
export async function getMeters(deviceId) {
  try {
    const url = deviceId ? `/meters/${encodeURIComponent(deviceId)}` : "/meters";
    const res = await onosApi.get(url);
    return res.data?.meters || [];
  } catch (err) {
    if (err.response?.status === 404) return [];
    throw err;
  }
}

export async function createMeter(deviceId, meterData) {
  const payload = { appId: "org.onosproject.rest", ...meterData };
  const res = await onosApi.post(`/meters/${encodeURIComponent(deviceId)}`, payload);
  const loc = res.headers?.location || res.headers?.Location || "";
  let id = loc ? loc.trim().split("/").pop() : (res.data?.id || res.data?.meters?.[0]?.id);
  return { id, data: res.data, location: loc };
}

export async function deleteMeter(deviceId, meterId) {
  const res = await onosApi.delete(`/meters/${encodeURIComponent(deviceId)}/${encodeURIComponent(meterId)}`);
  return res.data;
}

// Flow Rules API
export async function installOnosFlow(deviceId, flowData) {
  const url = `/flows/${encodeURIComponent(deviceId)}?appId=org.onosproject.rest`;
  const payload = flowData.flows ? flowData : { flows: [flowData] };
  const res = await onosApi.post(url, payload);
  const loc = res.headers?.location || res.headers?.Location || "";
  let id = loc ? loc.trim().split("/").pop() : (res.data?.flows?.[0]?.id || res.data?.id);
  return { ...res.data, id, flowId: id };
}

export async function deleteOnosFlow(deviceId, flowId) {
  const res = await onosApi.delete(`/flows/${encodeURIComponent(deviceId)}/${encodeURIComponent(flowId)}`);
  return res.data;
}

export async function getOnosFlows(deviceId) {
  try {
    const url = deviceId ? `/flows/${encodeURIComponent(deviceId)}` : "/flows";
    const res = await onosApi.get(url);
    return res.data?.flows || [];
  } catch (err) {
    if (err.response?.status === 404) return [];
    throw err;
  }
}

export async function getDevices(onlyAvailable = true) {
  const res = await onosApi.get("/devices");
  const allDevices = res.data?.devices || [];
  return onlyAvailable ? allDevices.filter(d => d.available === true || d.available === "true") : allDevices;
}

export async function getLinks() {
  const res = await onosApi.get("/links");
  return res.data?.links || [];
}

export async function getHosts() {
  const res = await onosApi.get("/hosts");
  return res.data?.hosts || [];
}
```

---

### Step 3: `src/api/slicingService.js` (Multi-Switch Routing & Core Engine)

This file contains:
- `SLICE_TEMPLATES`: 3GPP templates (`eMBB`, `URLLC`, `mMTC`, `Best-Effort`).
- `getNetworkCapacity()`, `setNetworkCapacity()`: Admission control pool.
- `getTopologyInfo()`: Aggregates active switches, links, and hosts (filtering out inter-switch trunk ports).
- `findSwitchPath(srcDev, dstDev, links, srcPort, dstPort)`: BFS shortest-path hop finder.
- `createSlice(sliceConfig)`:
  - Validates admission control.
  - Generates unique VLAN ID.
  - Installs switch meters on ingress devices.
  - Installs Priority 39000 Ingress Drop Boundaries on source host ports.
  - Computes multi-switch path between all peer hosts and installs Priority 40000 unicast forwarding rules.
  - Installs Priority 40000 consolidated ARP broadcast rules grouped by `(deviceId, inPort, sourceMac)`.
- `deleteSlice(sliceId)`: Removes meters, tracked flows, drop rules, and runs a deep cleanup sweep across all switches.

```javascript
// Key Snippet: Path computation and Multi-Switch Flow Installation
export function findSwitchPath(srcDev, dstDev, links = [], srcHostPort, dstHostPort) {
  if (srcDev === dstDev) {
    return [{ deviceId: srcDev, inPort: Number(srcHostPort), outPort: Number(dstHostPort) }];
  }
  const adj = {};
  for (const link of links) {
    const u = link.src?.device, v = link.dst?.device;
    if (!u || !v) continue;
    if (!adj[u]) adj[u] = [];
    adj[u].push({ nextDev: v, outPort: link.src?.port, inPortNext: link.dst?.port });
  }
  const queue = [[{ dev: srcDev, inPort: srcHostPort, outPort: null }]];
  const visited = new Set([srcDev]);
  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    if (current.dev === dstDev) {
      current.outPort = dstHostPort;
      return path.map(h => ({ deviceId: h.dev, inPort: Number(h.inPort), outPort: Number(h.outPort) }));
    }
    for (const n of (adj[current.dev] || [])) {
      if (!visited.has(n.nextDev)) {
        visited.add(n.nextDev);
        current.outPort = n.outPort;
        queue.push([...path.slice(0, -1), { ...current }, { dev: n.nextDev, inPort: n.inPortNext, outPort: null }]);
      }
    }
  }
  return null;
}
```

---

### Step 4: `src/api/aiIntentService.js` (AI Intent-Based Networking Layer)

Implements natural language compilation with multi-provider failover:
1. **Google Gemini** (`gemini-3.7-flash`, `gemini-1.5-flash`): Direct REST call to `https://generativelanguage.googleapis.com/v1beta/models/...:generateContent` with `responseMimeType: "application/json"`.
2. **Groq Cloud** (`llama-3.3-70b-versatile`, `deepseek-r1-distill-llama-70b`): OpenAI-compatible chat completion with `response_format: { type: "json_object" }`.
3. **OpenRouter**: Aggregator endpoint.
4. **Built-in Smart Heuristic Parser (`compileIntentHeuristically`)**:
   - Semantic keyword classification (`urllc` -> low latency/critical, `embb` -> 4k/broadband/stream, `mmtc` -> iot/sensors).
   - Regex bandwidth parser (e.g. `20 MB/s` -> `20000 KB/s`, `80 Mbps` -> `10000 KB/s`).
   - Host matching (IP extraction or matching live topology hosts).
   - Admission control verification.
   - Guaranteed offline zero-API-key fallback if network or keys fail.

---

### Step 5: `src/context/NotificationContext.jsx` (SLA Burst Monitoring)

- Global React Context storing notifications, unread count, and burst violations in `localStorage`.
- Real-time `setInterval` background worker (2.5s interval) querying `getMeters(dev.id)` across all active switches.
- Detects packet drops on meter DROP bands and sudden traffic surges exceeding 75% of slice SLA cap.
- Emits structured `BURST_VIOLATION` alerts with a 15-second debounce cooldown per slice.

---

### Step 6: `src/Components/SliceTopology.jsx` (Topology Visualizer)

- Built with `vis-network` and `vis-data`.
- Uses device images: `/assets/images/Device_switch_3062_unknown_64.png` for switches and `/assets/images/Device_pc_3045_default_64.png` for PCs.
- Supports two layout modes:
  - **Tiered Hierarchical Mode**: Core switch (Level 0) at top -> Leaf switches (Level 1) -> Hosts (Level 2) at bottom.
  - **Force-Directed (Organic) Mode**: Interactive physics layout.
- Slice filter pills allowing highlighting a single slice's isolated subgraph or all slices.
- Interactive node drawer displaying MAC, IP, switch port, meter stats, and VLAN metadata on click.

---

### Step 7: `src/Components/IntentSlicing/AiIntentPanel.jsx` & `AiSettingsModal.jsx`

- Ambient glow header card displaying active AI engine badge (e.g. `GOOGLE GEMINI • 3.7 FLASH` or `OFFLINE HEURISTIC`).
- Quick intent template pills (Autonomous Vehicles, 4K Streaming, Smart City IoT, Telemedicine).
- Prompt input with Enter-to-compile and Shift+Enter multi-line support.
- Progressive 4-step loading indicator:
  1. *Decomposing Intent & SLA Parameters...*
  2. *Grounding Hosts against Live ONOS Topology...*
  3. *Verifying Capacity Pool & Admission Control...*
  4. *Synthesizing OpenFlow Policies & Isolation Rules...*
- Structured Plan Card:
  - Slice type badge and confidence score.
  - SLA Specs grid (Bandwidth Cap, Burst Allowance, VLAN Tag, Hosts Assigned).
  - AI Rationale & reasoning callout.
  - Matched discovered host pills.
  - Collapsible OpenFlow synthesized actions list.
  - Actions: **"Deploy Slice Instantly"** or **"Edit in Manual Modal"**.
- Settings Modal: Switch provider, input API key (masked with eye toggle), select preset model or custom model ID, and test connection latency.

---

### Step 8: `src/Pages/NetworkSlicing.jsx` (Main Page Dashboard)

Combines:
1. **Header Toolbar**: Title, Refresh button, "New Slice" button.
2. **SLA Burst Violations Alert Banner**: Shows live warning with "Open Alert Center" button.
3. **Overview Metric Cards**: Active Slices, Hosts Assigned, Committed Bandwidth (% of pool), VLAN Isolation status.
4. **Physical Infrastructure Capacity Budget Bar**: Multi-segment colored progress bar indicating allocated vs remaining capacity.
5. **AI Intent Panel**: `AiIntentPanel` embedded at the top.
6. **Slice Topology Map**: `SliceTopology` visualizer.
7. **Configured Slices List**:
   - `SliceCard` subcomponent with accordion expansion.
   - Per-slice stats: Traffic bytes, packets, VLAN tag, bandwidth cap.
   - Host chips and tabular per-host port/meter/flow details.
   - Delete Slice action with confirmation and deep flow cleanup.
8. **Sidebar Charts**:
   - Recharts Pie chart: Hosts per slice.
   - Recharts Bar chart: Committed bandwidth per slice.
   - ONOS Infrastructure summary card (Switches Online, Hosts Discovered, Active Meters, OpenFlow 1.3 status).
9. **Create Slice Modal (`CreateSliceModal`)**:
   - Quick 3GPP templates.
   - Bandwidth cap, burst size, optional manual VLAN tag.
   - Dynamic host checklist with "Select All Available" button.
   - Real-time Admission Control progress bar preventing over-allocation.

---

### Step 9: Navigation & Header Integration

In `src/Components/Header/Header.jsx`:
- Add `{ label: "Slicing", icon: <Layers className="w-4 h-4" />, to: "/network-slicing" }` to navigation items.
- Add Notification bell button with unread count badge triggering `NotificationDrawer`.

In `src/App.jsx`:
- Wrap app with `<NotificationProvider>`.
- Add `<Route path="/network-slicing" element={<NetworkSlicing />} />`.

---

## 5. Verification & Testing Guide

### 1. Mininet Slicing Topology Setup
Run a multi-switch topology in Mininet:
```bash
sudo mn --controller=remote,ip=127.0.0.1,port=6653 --topo=tree,depth=2,fanout=2 --switch=ovsk,protocols=OpenFlow13
```

In Mininet, run `pingall` once to let ONOS discover all hosts (h1, h2, h3, h4).

### 2. Verify AI Intent Compilation & Isolation
1. Open the `/network-slicing` page.
2. In the AI Intent box, click **"URLLC Autonomous Vehicles"** or type:
   > *"Create an ultra-reliable low latency URLLC slice for medical telemetry between host 10.0.0.1 and 10.0.0.2 with 15 MB/s bandwidth"*
3. Click **Compile Intent** -> Check the generated plan -> Click **Deploy Slice**.
4. Verify slice appears in the list with VLAN and meter installed.
5. Test intra-slice ping in Mininet:
   ```bash
   mininet> h1 ping h2     # SUCCESS (Intra-slice communication allowed)
   mininet> h1 ping h3     # FAILED / DROPPED (Cross-slice isolation enforced)
   ```

### 3. Verify Bandwidth Rate-Limiting & SLA Alert
1. In Mininet, run iperf between slice hosts:
   ```bash
   mininet> h2 iperf -s -u &
   mininet> h1 iperf -c 10.0.0.2 -u -b 80M -t 10 -i 1
   ```
2. Watch the SLA violation alert pop up in the UI with dropped packet counts and throughput spikes.

---

### 6. AI Prompt Summary for Teammate
To implement this in your project:
> *"Please inspect the architecture and specifications in this MD file and replicate the Network Slicing and AI Intent-Based Networking (IBN) subsystem in our codebase. Create `src/api/slicingService.js`, `src/api/aiIntentService.js`, `src/Components/SliceTopology.jsx`, `src/Components/IntentSlicing/AiIntentPanel.jsx`, `src/Components/IntentSlicing/AiSettingsModal.jsx`, `src/context/NotificationContext.jsx`, and `src/Pages/NetworkSlicing.jsx`, and integrate them into our App routing, Header, and Vite proxy."*
