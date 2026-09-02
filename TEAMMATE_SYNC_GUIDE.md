# 🔄 Teammate Sync Guide — Network Slicing Dashboard
## From: OVN/OpenStack Implementation → To: ONOS Implementation

> **Purpose of this document:** Your teammate has already built the core React + Node.js SDN Dashboard with full network slicing functionality using **OpenStack Neutron + OVN**. Your job is to adapt this same dashboard to work with **ONOS** as the SDN controller instead. This guide tells your AI assistant exactly what exists, how it's structured, and what needs to change.

---

## 📁 Project Overview

The project is a **React + Vite** frontend with a **Node.js (Express) backend** acting as a middleware between the UI and the SDN controller.

### Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TailwindCSS v4, `vis-network` |
| Backend Middleware | Node.js, Express 4 |
| UI Library | MUI v6, Framer Motion, Recharts |
| HTTP | Native `fetch` (no axios on backend) |
| SDN Controller (teammate) | **OpenStack Neutron + OVN** (via Keystone auth) |
| SDN Controller (your target) | **ONOS** (via REST API, no Keystone) |

### Directory Structure
```
Insa-dluxf/
├── server.js              ← Express backend (THE file you need to replace/adapt)
├── .env                   ← Environment config (credentials, URLs)
├── src/
│   ├── App.jsx            ← React Router — all routes defined here
│   ├── Pages/
│   │   ├── Cloud.jsx      ← The main network slicing dashboard page (ADAPT THIS)
│   │   ├── Flows.jsx      ← SDN flow manager page
│   │   ├── FlowManager.jsx
│   │   ├── Topology/      ← Topology visualization page
│   │   ├── AnomalyDetector/
│   │   ├── Nodes/
│   │   └── ...
│   ├── Components/
│   │   ├── CloudTopology.jsx  ← Vis-network graph component (adapt node types)
│   │   ├── Dashboard/
│   │   ├── Sidebar/
│   │   └── ...
│   └── api/
│       ├── api-controller.js
│       ├── flowService.js
│       └── flowManagerService.js
├── package.json
└── vite.config.js
```

---

## 🔑 The Core Architecture Pattern

The frontend **never talks to the SDN controller directly**. All requests go:

```
React UI (port 5173)
    ↓ fetch("/api/openstack/...")
Node.js Express backend (port 5000)
    ↓ fetch(NEUTRON_URL / NOVA_URL / KEYSTONE_URL)
OpenStack/OVN controller
```

**For ONOS, the same pattern applies:**

```
React UI (port 5173)
    ↓ fetch("/api/onos/...")   ← rename endpoints
Node.js Express backend (port 5000)
    ↓ fetch(ONOS_URL + Basic Auth)
ONOS REST API (default port 8181)
```

---

## 🗂️ What the teammate built: `server.js` (937 lines)

The backend has these main sections that you must replicate for ONOS:

### 1. Configuration & Auth (lines 1–26)
**What teammate has (OpenStack):**
```js
let KEYSTONE_URL = process.env.KEYSTONE_URL || "http://127.0.0.1/identity/v3";
let NEUTRON_URL = process.env.NEUTRON_URL;
let NOVA_URL    = process.env.NOVA_URL;
let GLANCE_URL  = process.env.GLANCE_URL;
const OS_USERNAME = process.env.OS_USERNAME || "admin";
const OS_PASSWORD = process.env.OS_PASSWORD || "secret";
// ... token cache logic (lines 23-26)
```

**What you need (ONOS):**
```js
const ONOS_URL      = process.env.ONOS_URL || "http://localhost:8181";
const ONOS_USERNAME = process.env.ONOS_USERNAME || "onos";
const ONOS_PASSWORD = process.env.ONOS_PASSWORD || "rocks";
const ONOS_AUTH     = "Basic " + Buffer.from(`${ONOS_USERNAME}:${ONOS_PASSWORD}`).toString("base64");
// No token cache needed — ONOS uses Basic Auth per-request
```

---

### 2. Token/Auth Helper (lines 96–213)
**What teammate has:**
A `getToken()` function that authenticates with Keystone, caches the token, and discovers dynamic service URLs (`NEUTRON_URL`, `NOVA_URL`, `GLANCE_URL`) from the Keystone service catalog.

**What you need:**
A simple `onosFetch(path, options)` helper:
```js
const onosFetch = async (path, options = {}) => {
  const headers = {
    "Authorization": ONOS_AUTH,
    "Accept": "application/json",
    ...(options.headers || {})
  };
  const resp = await fetch(`${ONOS_URL}${path}`, { ...options, headers });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ONOS request failed ${resp.status}: ${text}`);
  }
  return resp.json();
};
```

---

### 3. API Endpoints (The Heart of `server.js`)

Below is a complete mapping of every endpoint the teammate created and what ONOS equivalent you need to build:

#### A. Diagnostic Ping — `/api/openstack/ping`
Used by the UI to test controller connectivity.

**Teammate:** Hits `KEYSTONE_URL` with a GET and returns status.

**Your ONOS version:**
```
GET /api/onos/ping
→ fetch(`${ONOS_URL}/onos/v1/info`) with Basic Auth
→ return { ok, onosUrl, version }
```

---

#### B. Cloud/Network Summary — `/api/openstack/cloud-summary` ⭐ MOST IMPORTANT

This is the **primary endpoint** that `Cloud.jsx` calls on load (`/api/openstack/cloud-summary`). It returns the full dashboard state.

**Teammate's response shape** (your ONOS implementation must return the EXACT same JSON shape):
```json
{
  "stats": [
    { "title": "Active Instances", "value": 3, "icon": "🖥️" },
    { "title": "OVN Logical Switches", "value": 5, "icon": "🌐" },
    { "title": "Routers", "value": 2, "icon": "📡" },
    { "title": "VXLAN/Geneve Tunnels", "value": 4, "icon": "🔗" }
  ],
  "virtualMachines": [
    {
      "id": "uuid",
      "name": "vm-name",
      "status": "ACTIVE",
      "ip": "10.0.0.5",
      "network": "network-name",
      "zone": "nova",
      "logicalPort": "port-uuid",
      "logicalSwitch": "neutron-<network-id>"
    }
  ],
  "networks": [
    {
      "name": "my-net",
      "type": "OVN Logical Switch",
      "cidr": "192.168.1.0/24",
      "segmentation": "VXLAN-1000",
      "status": "ACTIVE",
      "id": "network-uuid"
    }
  ],
  "routers": [ { "id": "...", "name": "..." } ],
  "ports": [ { "id": "...", "device_owner": "...", "device_id": "...", "network_id": "..." } ],
  "flows": [],
  "securityRules": [
    {
      "id": "rule-id",
      "protocol": "tcp",
      "port": "22-22",
      "direction": "ingress",
      "action": "ALLOW"
    }
  ],
  "infrastructureStatus": {
    "ovnNbDb":    { "status": "Healthy", "health": 95 },
    "ovnSbDb":    { "status": "Connected", "health": 88 },
    "neutronApi": { "status": "Healthy", "health": 90 },
    "ovsBridges": { "status": "Operational", "health": 92 }
  }
}
```

**ONOS Data Sources for each field:**
| Response Field | ONOS REST Endpoint |
|---|---|
| `virtualMachines` (hosts) | `GET /onos/v1/hosts` → `hosts[]` |
| `networks` (logical switches/intents) | `GET /onos/v1/intents` or `GET /onos/v1/network/configuration` |
| `routers` (device list) | `GET /onos/v1/devices` → filter by `type=ROUTER` or `OVS` |
| `ports` (port list) | `GET /onos/v1/devices/{deviceId}/ports` |
| `flows` (flow rules) | `GET /onos/v1/flows` |
| `securityRules` | Implement as ONOS intents/ACLs or return `[]` initially |
| `stats.Active Instances` | Count of `hosts` with `ipAddresses.length > 0` |
| `stats.OVN Logical Switches` | Count of unique `vlanId` or intent count |
| `stats.Routers` | Count of `devices` |
| `stats.Tunnels` | Count of VXLAN/GRE tunnels from links or topology |
| `infrastructureStatus` | `GET /onos/v1/cluster` + `GET /onos/v1/devices` health |

**ONOS host shape** → map to teammate's `virtualMachines` shape:
```js
// ONOS host object:
// { id, mac, vlan, innerVlan, outerTpid, configured, suspended, ipAddresses[], locations[{deviceId, port}] }
// Map to:
const vm = {
  id: host.id,
  name: host.id,                          // ONOS has no "name" — use ID or MAC
  status: host.suspended ? "SUSPENDED" : "ACTIVE",
  ip: host.ipAddresses?.[0] || "N/A",
  network: host.vlan || "N/A",
  zone: host.locations?.[0]?.deviceId || "N/A",
  logicalPort: host.locations?.[0]?.port || null,
  logicalSwitch: host.locations?.[0]?.deviceId || null,
};
```

---

#### C. Security Rule Creation — `POST /api/openstack/security-groups/rules`

**Teammate's request body:**
```json
{ "source": "vm-name", "destination": "network-name", "protocol": "TCP", "port": "22", "action": "ALLOW" }
```

**Teammate's response:**
```json
{ "success": true, "acl": { "id": "...", "source": "...", "destination": "...", "protocol": "TCP", "port": "22", "action": "ALLOW" }, "message": "Security group rule created successfully." }
```

**ONOS equivalent:** Use ONOS intents or the ACL application (`/onos/v1/acl/rules`):
```
POST /api/onos/acl/rules
→ POST ${ONOS_URL}/onos/acl/rules  with body:
  { "srcIp": "...", "dstIp": "...", "ipProto": 6, "dstTpPort": 22, "action": "ALLOW" }
```

Must return the **same JSON shape** as the teammate's endpoint so `Cloud.jsx` works without changes.

---

#### D. ACL Verification — `GET /api/openstack/acl-list/:logicalSwitch`

**Teammate uses:** `sudo ovn-nbctl acl-list <switch>` via `execFile`.

**ONOS equivalent:**
```
GET /api/onos/acl-list/:deviceId
→ GET ${ONOS_URL}/onos/acl/rules   (or /onos/v1/flows/{deviceId})
→ parse and return as { logicalSwitch, acls: ["..."], available: true }
```

---

#### E. Create VM — `POST /api/openstack/create-vm`

**Teammate's request body:**
```json
{ "name": "my-vm", "flavor": "m1.small", "image": "cirros-0.6.3-x86_64-disk", "network": "my-net" }
```

**ONOS equivalent:** ONOS doesn't manage VMs — this is a compute plane concern.
- Option 1: Return a `501 Not Implemented` with a meaningful message.
- Option 2: Keep calling OpenStack Nova for VM management even in the ONOS version (VMs still run on compute nodes; only the SDN control plane changes).
- Option 3: Stub with mock data for demo purposes.

**Recommendation:** Discuss with your team. The safest option is a stub that returns success for demo.

---

#### F. Create Network — `POST /api/openstack/create-network`

**Teammate's request body:**
```json
{ "name": "my-net", "cidr": "192.168.1.0/24", "segmentation": "VXLAN-1000" }
```

**ONOS equivalent:** Create a virtual network using ONOS Virtual Network Service:
```
POST ${ONOS_URL}/onos/v1/vnets  (ONOS Virtual Network API)
```
Or create a host-to-host intent:
```
POST ${ONOS_URL}/onos/v1/intents
```

Must return:
```json
{ "success": true, "network": { "id": "...", "name": "..." }, "subnet": { ... }, "message": "Network created." }
```

---

#### G. Launch Instance — `POST /api/openstack/launch-instance`

Same as Create VM above. Same recommendations apply.

---

#### H. Infrastructure Status — (internal, called by cloud-summary)

**Teammate checks:**
- `ovn-nbctl show` via `execFile` → OVN Northbound DB health
- Neutron API reachability → Neutron health
- Derives OVS bridge + SB DB status from above

**ONOS equivalent — map to the same 4 keys:**
```json
{
  "ovnNbDb":    → map to ONOS cluster/node health: GET /onos/v1/cluster/nodes
  "ovnSbDb":    → map to ONOS app status: GET /onos/v1/applications/org.onosproject.openflow/active
  "neutronApi": → map to ONOS REST reachability: GET /onos/v1/info
  "ovsBridges": → map to ONOS device count: GET /onos/v1/devices (count active devices)
}
```

> **Important:** The UI reads `infrastructureStatus.ovnNbDb.status`, `.ovnSbDb.status`, `.neutronApi.status`, `.ovsBridges.status`, and `.health` (0–100). Rename the display labels in `Cloud.jsx` to ONOS equivalents (see UI section below).

---

## 🎨 Frontend: What Needs to Change in `Cloud.jsx`

`Cloud.jsx` is a **1010-line React component** in `src/Pages/Cloud.jsx`. Here are the targeted changes needed:

### 1. API endpoint URLs (lines ~75, 127, 160, 217, 247, 277)
Change all fetch calls from `/api/openstack/...` to `/api/onos/...`:

```diff
-const response = await fetch(`/api/openstack/cloud-summary`);
+const response = await fetch(`/api/onos/cloud-summary`);

-await fetch(`/api/openstack/acl-list/${encodeURIComponent(logicalSwitch)}`);
+await fetch(`/api/onos/acl-list/${encodeURIComponent(logicalSwitch)}`);

-await fetch(`/api/openstack/security-groups/rules`, { method: "POST", ... });
+await fetch(`/api/onos/acl/rules`, { method: "POST", ... });

-await fetch(`/api/openstack/create-vm`, { method: "POST", ... });
+await fetch(`/api/onos/create-vm`, { method: "POST", ... });

-await fetch(`/api/openstack/create-network`, { method: "POST", ... });
+await fetch(`/api/onos/create-network`, { method: "POST", ... });

-await fetch(`/api/openstack/launch-instance`, { method: "POST", ... });
+await fetch(`/api/onos/launch-instance`, { method: "POST", ... });
```

### 2. UI Labels & Branding (lines ~308–318, 368, 394, 606)
Change OVN-specific labels to ONOS equivalents:

```diff
-<div>OVN</div>        ← the badge in the header
+<div>ONOS</div>

-<h1>OpenStack OVN Cloud Dashboard</h1>
+<h1>ONOS SDN Network Slicing Dashboard</h1>

-<h2>Modern OVN-Based OpenStack Networking Control Center</h2>
+<h2>Modern ONOS-Based SDN Network Slicing Control Center</h2>

-<h3>OVN Infrastructure Overview</h3>
+<h3>ONOS Infrastructure Overview</h3>

-<span>OVN Northbound DB</span>     → <span>ONOS Cluster Node</span>
-<span>OVN Southbound DB</span>     → <span>ONOS OpenFlow App</span>
-<span>Neutron API</span>           → <span>ONOS REST API</span>
-<span>OVS Integration Bridges</span> → <span>Connected Devices</span>

-<h2>OVN Networks</h2>
+<h2>ONOS Virtual Networks</h2>

-<p>Logical switches and overlay segments from the OVN Northbound DB</p>
+<p>Virtual network slices managed by ONOS intent framework</p>
```

### 3. Security Policy Section Label (line ~649)
```diff
-<h2>SDN Security Flow Policies</h2>
-<p>Translate OpenStack security intent into OVN ACLs...</p>
+<h2>SDN Security Flow Policies</h2>
+<p>Translate network slicing intent into ONOS ACL rules...</p>
```

### 4. Error State Labels (lines ~466–473)
```diff
-<h3>⚠️ OpenStack Connection Failed</h3>
+<h3>⚠️ ONOS Controller Connection Failed</h3>

-<span>Keystone URL tried:</span>
+<span>ONOS URL tried:</span>
```

### 5. Footer (lines ~797–800)
```diff
-React UI • Node.js Middleware • OpenStack Neutron • OVN • Open vSwitch
+React UI • Node.js Middleware • ONOS Controller • OpenFlow • SDN Intent Framework
```

---

## 🧩 `CloudTopology.jsx` — What to Change

File: `src/Components/CloudTopology.jsx` (331 lines)

The `CloudTopology` component uses **vis-network** to render the topology graph. It receives:
- `virtualMachines` → rendered as yellow boxes
- `networks` → rendered as cyan/teal ellipses
- `routers` → rendered as blue circles
- `ports` → used for router↔network edges

This component **does not call any APIs directly** — it just renders whatever data the parent `Cloud.jsx` passes in. As long as your `cloud-summary` endpoint returns the correct shape, the topology works without change.

**Optional ONOS-specific enhancements:**
- Change node label from `"OVN Logical Switch"` to `"ONOS Virtual Network"` in the legend
- Map ONOS `device` entities as the "router" type nodes
- Map ONOS `host` entities as the "vm" type nodes
- Map ONOS `links` (topology links) as edges between devices

---

## ⚙️ Environment Configuration — `.env` Changes

**Teammate's `.env`:**
```env
KEYSTONE_URL=http://127.0.0.1/identity/v3
OS_USERNAME=admin
OS_PASSWORD=123456
OS_PROJECT_NAME=admin
OS_USER_DOMAIN_NAME=default
OS_PROJECT_DOMAIN_NAME=default
```

**Your ONOS `.env`:**
```env
ONOS_URL=http://localhost:8181
ONOS_USERNAME=onos
ONOS_PASSWORD=rocks
```

---

## 📦 `package.json` — No Changes Needed

The `package.json` dependencies are all frontend/backend framework packages with no OpenStack-specific libraries. Everything (React, Express, vis-network, MUI, etc.) stays the same. The only external dependency you may want to add is none — ONOS uses a plain REST API with Basic Auth.

---

## 🗺️ ONOS REST API Quick Reference

Base URL: `http://localhost:8181/onos/v1`

| Purpose | Endpoint |
|---|---|
| API info/version | `GET /onos/v1/info` |
| All hosts (your "VMs") | `GET /onos/v1/hosts` |
| All devices (switches/routers) | `GET /onos/v1/devices` |
| Device ports | `GET /onos/v1/devices/{deviceId}/ports` |
| Topology links | `GET /onos/v1/topology/clusters` |
| All flow rules | `GET /onos/v1/flows` |
| Flows on a device | `GET /onos/v1/flows/{deviceId}` |
| All intents | `GET /onos/v1/intents` |
| Submit intent | `POST /onos/v1/intents` |
| Withdraw intent | `DELETE /onos/v1/intents/{appId}/{key}` |
| Cluster info | `GET /onos/v1/cluster` |
| Cluster nodes | `GET /onos/v1/cluster/nodes` |
| Applications | `GET /onos/v1/applications` |
| ACL rules (ACL app) | `GET /onos/acl/rules` |
| Add ACL rule | `POST /onos/acl/rules` |
| Remove ACL rule | `DELETE /onos/acl/rules/{id}` |

**All requests require:**
```
Authorization: Basic <base64(username:password)>
Accept: application/json
Content-Type: application/json   (for POST/PUT)
```

Default credentials: `onos:rocks`

---

## 🔧 Suggested Implementation Order

1. **Replace `server.js`** — Create a new `server.js` with ONOS auth helper and all endpoint stubs returning empty arrays first.
2. **Verify connectivity** — Test `/api/onos/ping` returns `ok: true`.
3. **Implement `cloud-summary`** — Fill in real data from ONOS hosts, devices, links.
4. **Update `Cloud.jsx` fetch URLs** — Change all 6 fetch calls to `/api/onos/...`.
5. **Update labels in `Cloud.jsx`** — Find-replace OVN/OpenStack labels with ONOS labels.
6. **Implement security/ACL endpoints** — Use ONOS ACL app or intents.
7. **Implement create-network** — Use ONOS Virtual Network or intents.
8. **Test the full topology view** — Ensure `CloudTopology.jsx` renders ONOS devices/hosts correctly.

---

## ⚠️ Key Gotchas & Differences

| Concern | OpenStack/OVN (teammate) | ONOS (you) |
|---|---|---|
| Authentication | Keystone token (POST to get token, cache it) | Basic Auth on every request |
| "VM" concept | Nova server instance | ONOS host (a MAC/IP seen by a device port) |
| "Network" concept | Neutron network (OVN logical switch) | ONOS intent or virtual network |
| "Router" concept | Neutron router (OVN logical router) | ONOS device with type ROUTER/OVS |
| "Firewall rules" | Neutron security group rules → OVN ACLs | ONOS ACL application rules |
| CRUD for VMs | Nova API (full support) | Not directly in ONOS — stub or use Nova |
| Tunnel protocol | VXLAN/Geneve | OpenFlow (ONOS manages via OF protocol) |
| Infrastructure check | `ovn-nbctl show` via shell | ONOS REST `/cluster/nodes` + `/devices` |
| Port format | Neutron port UUID | `deviceId/portNumber` format (e.g., `of:0000...0001/1`) |

---

## 📋 Prompt Template for Your AI

Use this prompt to instruct your AI assistant to implement the ONOS backend:

> "I have a React + Node.js SDN dashboard project (Vite/React 18 frontend, Express backend). My teammate built the backend (`server.js`) connecting to OpenStack Neutron + OVN. I need you to rewrite `server.js` to connect to an ONOS controller instead. The frontend (`src/Pages/Cloud.jsx`) calls these backend endpoints:
>
> 1. `GET /api/openstack/cloud-summary` → must return `{ stats, virtualMachines, networks, routers, ports, flows, securityRules, infrastructureStatus }`
> 2. `GET /api/openstack/ping` → connectivity diagnostic
> 3. `POST /api/openstack/security-groups/rules` → create ACL rule
> 4. `GET /api/openstack/acl-list/:logicalSwitch` → list ACLs
> 5. `POST /api/openstack/create-vm` → create VM
> 6. `POST /api/openstack/create-network` → create network
> 7. `POST /api/openstack/launch-instance` → launch instance
>
> The ONOS URL is `http://localhost:8181`, credentials are `onos:rocks` (Basic Auth). Use the ONOS REST API v1 (`/onos/v1/...`) and the ACL app (`/onos/acl/rules`). Keep the response shapes identical to what the teammate's OpenStack version returns, then also update the fetch URLs in `Cloud.jsx` from `/api/openstack/` to `/api/onos/`. Also update all OVN/OpenStack-specific UI labels in `Cloud.jsx` to ONOS equivalents."

---

*Generated on 2026-09-02 — Inspect the project at `Insa-dluxf/server.js` and `Insa-dluxf/src/Pages/Cloud.jsx` for the full implementation details.*
