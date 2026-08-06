
# PNTC — Programmable Network Traffic Controller Dashboard

> **SDN Anomaly Detection & OpenStack Cloud Management Dashboard**
>
> Full-stack dashboard combining OpenDaylight (ODL) SDN topology monitoring,
> OpenStack (DevStack) cloud infrastructure management, and a Python ML-based
> anomaly detection engine.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Prerequisites — What You Need Before Starting](#3-prerequisites--what-you-need-before-starting)
4. [PART A — DevStack Installation (OpenStack)](#4-part-a--devstack-installation-openstack)
5. [PART B — OpenDaylight (ODL) Setup](#5-part-b--opendaylight-odl-setup)
6. [PART C — Python Anomaly Engine Setup](#6-part-c--python-anomaly-engine-setup)
7. [PART D — Node.js Dashboard Setup](#7-part-d--nodejs-dashboard-setup)
8. [Environment Configuration (.env)](#8-environment-configuration-env)
9. [Running the Full System](#9-running-the-full-system)
10. [Port Reference](#10-port-reference)
11. [Common Issues & Fixes](#11-common-issues--fixes)
12. [Network/IP Change Guide (e.g., Switching WiFi ↔ Ethernet)](#12-networkip-change-guide)
13. [What Each File/Folder Does](#13-what-each-filefolder-does)

---

## 1. System Overview

This project has **four running services** that must all be started for the full dashboard to work:

| Service | Technology | Port | Purpose |
|---|---|---|---|
| **DevStack (OpenStack)** | Python / Apache | 80 (HTTP) | Cloud infrastructure (VMs, networks, routers) |
| **OpenDaylight (ODL)** | Java | 8181 | SDN controller — topology, flows, nodes |
| **Node.js Backend** | Node.js / Express | 5000 | Proxy between React UI and OpenStack APIs |
| **React Frontend** | Vite + React | 5173 | Dashboard UI visible in browser |

> **IMPORTANT FOR ADVISOR / OTHER COMPUTERS:**
> DevStack **must be installed on the same machine** that runs the Node.js backend.
> The React frontend can run on the same machine or another machine on the same network.

---

## 2. Architecture

```
 Browser  (port 5173)
     │
     ▼
 React Frontend (Vite)
     │  /api/rests/*   ──────────────────────►  OpenDaylight (port 8181)
     │  /api/restconf/* ─────────────────────►  OpenDaylight (port 8181)
     │  /api/openstack/* ────────────────────►  Node.js Backend (port 5000)
                                                        │
                                                        ▼
                                                 OpenStack Keystone (port 80)
                                                 (auto-discovers Neutron, Nova, Glance)
```

---

## 3. Prerequisites — What You Need Before Starting

### Hardware Requirements

| Item | Minimum | Recommended |
|---|---|---|
| RAM | 8 GB | 16 GB or more |
| Disk Space | 60 GB free | 100 GB |
| CPU Cores | 4 cores | 8 cores |
| OS | Ubuntu 20.04 LTS | Ubuntu 22.04 LTS |
| Network | Any working interface | Ethernet preferred |

> ⚠️ **DevStack will NOT work on Windows or macOS natively.** It requires a Linux host
> (Ubuntu 20.04 or 22.04 recommended). If you use  on Windows/Mac, they must
> use a **virtual machine** running Ubuntu.

### Software That Must Be Installed on the Target Computer

Before anything else, make sure these are installed:

```bash
# 1. Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Git (required for DevStack)
sudo apt-get install -y git

# 3. Install curl and wget
sudo apt-get install -y curl wget

# 4. Install Python 3 and pip (required for the anomaly engine)
sudo apt-get install -y python3 python3-pip python3-venv

# 5. Install Java 11 (required for OpenDaylight)
sudo apt-get install -y openjdk-11-jdk

# 6. Install Node.js 18+ and npm (required for the dashboard)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify versions
node --version    # must be v18 or higher
npm --version     # must be v9 or higher
python3 --version # must be 3.8 or higher
java -version     # must be 11 or higher
```

---

## 4. PART A — DevStack Installation (OpenStack)

> ⚠️ **WARNING:** DevStack installs OpenStack on your machine. Do NOT run it on a
> production computer. Use a dedicated test machine or a virtual machine.
>
> ⚠️ **Do NOT run DevStack as root.** You must use a non-root user with `sudo` access.

### Step 1 — Create a dedicated user (skip if you already have one)

```bash
# If running on a fresh machine, create a stack user
sudo useradd -s /bin/bash -d /opt/stack -m stack
sudo passwd stack
echo "stack ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/stack
sudo chmod 0440 /etc/sudoers.d/stack

# Switch to the stack user
sudo -u stack -i
```

> If you already have a non-root user (e.g., your own login), you can use it directly —
> just make sure that user has passwordless sudo by running:
> ```bash
> echo "$USER ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/$USER
> ```

### Step 2 — Clone DevStack

```bash
# Clone the stable/2024.1 branch (Caracal release — tested and stable)
git clone https://opendev.org/openstack/devstack.git -b stable/2024.1 ~/devstack
cd ~/devstack
```

### Step 3 — Create the DevStack configuration file

```bash
# Create the local.conf file — this is the EXACT configuration used in this project
cat > ~/devstack/local.conf << 'EOF'
[[local|localrc]]

ADMIN_PASSWORD=secret
DATABASE_PASSWORD=$ADMIN_PASSWORD
RABBIT_PASSWORD=$ADMIN_PASSWORD
SERVICE_PASSWORD=$ADMIN_PASSWORD

# ✅ Bulletproof IP Discovery: Hardcoded to localhost so it never changes on a laptop
HOST_IP=127.0.0.1
SERVICE_HOST=127.0.0.1

# Enable core services
enable_service n-api n-cpu n-cond n-sch
enable_service key g-api g-reg
enable_service placement-api placement-client
enable_service horizon

# ❌ Disable old neutron agents
disable_service q-agt q-dhcp q-l3 q-meta

# ✅ OVN mode (correct modern setup)
Q_AGENT=ovn
Q_ML2_PLUGIN_MECHANISM_DRIVERS=ovn
Q_ML2_PLUGIN_TYPE_DRIVERS=geneve,flat,vlan
Q_ML2_TENANT_NETWORK_TYPES=geneve

# Enable OVN services
enable_service ovn-northd
enable_service ovn-controller
enable_service q-ovn-metadata-agent
enable_service q-svc

# Important for OVN
enable_service neutron
LOGFILE=$DEST/logs/stack.sh.log
LOG_COLOR=False
                                       

> ⚠️ **IMPORTANT:** If your network interface is NOT `eth0` (check with `ip link show`),
> change `PUBLIC_INTERFACE=eth0` to the correct interface name (e.g., `ens3`, `enp3s0`, `wlan0`).

### Step 4 — Run DevStack

```bash
cd ~/devstack

# This takes 20–60 minutes depending on internet speed and hardware
./stack.sh
```

**What happens during installation:**
- Downloads and installs ~2 GB of packages
- Configures OpenStack services (Keystone, Nova, Neutron, Glance)
- Configures OVN (Open Virtual Network)
- Creates a default admin user with password `secret`
- Opens a web dashboard at `http://<your-ip>/dashboard`

When finished, you will see:
```
This is your host IP address: <some IP>
Keystone is serving at http://<IP>/identity/
```

### Step 5 — Verify DevStack is working

```bash
# Load the OpenStack credentials
source ~/devstack/openrc admin admin

# List services (all should show "up" or "enabled")
openstack service list

# List any existing VMs (may be empty at first)
openstack server list

# List networks
openstack network list
```

### Step 6 — Configure sudo access for OVN commands

The Node.js backend runs `ovn-nbctl` via `sudo` to check OVN health.
You must allow this without a password prompt:

```bash
echo "$USER ALL=(ALL) NOPASSWD: /usr/bin/ovn-nbctl" | sudo tee /etc/sudoers.d/ovn-nbctl
sudo chmod 0440 /etc/sudoers.d/ovn-nbctl
```

### What to Do If DevStack Stops After Reboot

DevStack does **not** survive a reboot automatically. After rebooting, run:

```bash
cd ~/devstack
./rejoin-stack.sh
```

Or re-run the full stack:

```bash
cd ~/devstack
./unstack.sh   # clean up first
./stack.sh     # re-install (faster second time)
```

---

## 5. PART B — OpenDaylight (ODL) Setup

> ODL is optional for the Cloud dashboard tab but **required** for: Nodes, Flows,
> Topology, Stats, and API Tester tabs.

### Step 1 — Download OpenDaylight

```bash
# Create a directory for ODL
mkdir -p ~/odl && cd ~/odl

# Download Magnesium SR4 (stable release tested with this project)
wget https://nexus.opendaylight.org/content/repositories/opendaylight.release/org/opendaylight/integration/karaf/0.23.0karaf-0.23.0.tar.gz

# Extract
tar -xzf karaf-0.23.0.tar.gz
cd karaf-0.23.0
```

### Step 2 — Start OpenDaylight

```bash
# Start ODL
./bin/karaf
```

Inside the ODL Karaf console, install required features:

```
feature:install odl-restconf-all
feature:install odl-l2switch-switch-ui
feature:install odl-openflowplugin-flow-services-ui
feature:install odl-mdsal-apidocs
```

Wait about 2–3 minutes for features to load, then press `Ctrl+D` or type `logout` to exit.

### Step 3 — Verify ODL is running

```bash
# Check ODL REST API
curl -u admin:admin http://localhost:8181/restconf/operational/network-topology:network-topology/

# Should return JSON with topology data
```

---

## 6. PART C — Python Anomaly Engine Setup

The `anomaly/` folder contains the ML-based anomaly detection engine.

### Step 1 — Create a Python virtual environment

```bash
cd /path/to/Insa-dluxf

# Create virtual environment
python3 -m venv anomaly_env

# Activate it
source anomaly_env/bin/activate
```

### Step 2 — Install Python dependencies

```bash
pip install --upgrade pip

# Install all required packages
pip install numpy pandas scikit-learn joblib requests flask flask-cors scipy
```

### Complete list of Python packages required:

| Package | Purpose |
|---|---|
| `numpy` | Numerical computation |
| `pandas` | Data manipulation |
| `scikit-learn` | Isolation Forest & Random Forest ML models |
| `joblib` | Loading/saving `.pkl` model files |
| `requests` | HTTP calls to ODL REST API |
| `flask` | (optional) serving anomaly results as API |
| `flask-cors` | Cross-origin requests for Flask |
| `scipy` | Statistical functions |

```bash
# Install all at once
pip install numpy pandas scikit-learn joblib requests flask flask-cors scipy
```

### Step 3 — Verify model files exist

```bash
ls anomaly/*.pkl
# You should see:
# anomaly/pretrained_kdd_rf.pkl
# anomaly/pretrained_if.pkl
```

> ⚠️ These `.pkl` files are pre-trained ML models. **Do not delete them.**
> If they are missing, you must retrain by running:
> ```bash
> uv run python anomaly/retrain_kdd_rf.py --data dataset_sdn.csv --out anomaly/pretrained_kdd_rf.pkl
> python3 anomaly/train_if.py
> ```

---

## 7. PART D — Node.js Dashboard Setup

### Step 1 — Copy the project folder

Copy the entire `Insa-dluxf` folder to the target computer.
The folder structure must remain **exactly as-is** — do not move or rename files.

```
Insa-dluxf/
├── .env                  ← MUST be configured (see Section 8)
├── server.js             ← Node.js backend (runs on port 5000)
├── package.json          ← npm dependencies list
├── vite.config.js        ← Vite dev server config
├── index.html            ← HTML entry point
├── anomaly/              ← Python anomaly detection engine
├── src/                  ← React frontend source code
│   ├── App.jsx           ← App routes
│   ├── main.jsx          ← React entry point
│   ├── Components/       ← Reusable UI components
│   └── Pages/            ← Dashboard pages
└── public/               ← Static assets
```

### Step 2 — Install Node.js dependencies

```bash
cd Insa-dluxf

# Install all npm packages listed in package.json
npm install
```

> This installs all packages from `package.json` including React, Vite, Express,
> axios, MUI, recharts, vis-network, framer-motion, and others.
> Internet connection is required. Takes 1–3 minutes.

### Complete list of npm packages installed:

**Runtime (dependencies):**

| Package | Version | Purpose |
|---|---|---|
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | React DOM rendering |
| `react-router-dom` | ^7.0.2 | Client-side routing |
| `react-icons` | ^5.5.0 | Icon library |
| `react-spinners` | ^0.15.0 | Loading spinners |
| `react-json-view` | ^1.21.3 | JSON tree renderer |
| `react-json-tree` | ^0.19.0 | JSON tree renderer (alternate) |
| `recharts` | ^3.5.1 | Charts and graphs |
| `vis-network` | ^9.1.9 | Network topology visualization |
| `vis-data` | ^7.1.9 | vis.js data sets |
| `framer-motion` | ^12.23.6 | Animation library |
| `axios` | ^1.7.9 | HTTP client |
| `express` | ^4.21.2 | Node.js web server |
| `cors` | ^2.8.5 | CORS middleware |
| `dotenv` | ^17.4.2 | Environment variable loader |
| `bcryptjs` | ^3.0.3 | Password hashing |
| `jsonwebtoken` | ^9.0.3 | JWT authentication |
| `http-proxy-middleware` | ^3.0.3 | Proxy middleware |
| `socket.io-client` | ^4.8.1 | WebSocket client |
| `@mui/material` | ^6.3.1 | Material UI components |
| `@emotion/react` | ^11.14.0 | CSS-in-JS (MUI dependency) |
| `@emotion/styled` | ^11.14.0 | Styled components (MUI) |
| `tailwindcss` | ^4.1.11 | Utility CSS framework |
| `@tailwindcss/vite` | ^4.1.11 | Tailwind Vite plugin |

**Development (devDependencies):**

| Package | Version | Purpose |
|---|---|---|
| `vite` | ^6.0.1 | Build tool / dev server |
| `@vitejs/plugin-react` | ^4.3.4 | React support for Vite |
| `@vitejs/plugin-basic-ssl` | ^2.3.0 | HTTPS support for Vite |
| `vitest` | ^4.1.2 | Unit testing |
| `@testing-library/react` | ^16.3.2 | React testing utilities |
| `eslint` | ^9.15.0 | Code linting |

---

## 8. Environment Configuration (.env)

The `.env` file in the root of `Insa-dluxf/` controls how the Node.js backend
connects to OpenStack. **This file MUST be configured before starting the server.**

### Default `.env` content (already in the project):

```env
KEYSTONE_URL=http://127.0.0.1/identity/v3

OS_USERNAME=admin
OS_PASSWORD=secret
OS_PROJECT_NAME=admin
OS_USER_DOMAIN_NAME=default
OS_PROJECT_DOMAIN_NAME=default
```

### When to change `.env`:

| Situation | What to change |
|---|---|
| Running DevStack on the **same machine** as Node.js | Keep `127.0.0.1` — no change needed |
| Running DevStack on a **different machine** | Change `127.0.0.1` to that machine's IP address |
| You set a different password in DevStack | Change `OS_PASSWORD=secret` to your password |
| You used a different admin username | Change `OS_USERNAME=admin` |

### Example — DevStack on a different machine (IP: 192.168.1.50):

```env
KEYSTONE_URL=http://192.168.1.50/identity/v3

OS_USERNAME=admin
OS_PASSWORD=secret
OS_PROJECT_NAME=admin
OS_USER_DOMAIN_NAME=default
OS_PROJECT_DOMAIN_NAME=default
```

> ⚠️ **Do NOT change `NEUTRON_URL`, `NOVA_URL`, or `GLANCE_URL`** — these are
> automatically discovered from Keystone at startup. The backend's "Learning Phase"
> reads them from the Keystone service catalog.

---

## 9. Running the Full System

All four services must be running at the same time. Open **separate terminals** for each.

### Terminal 1 — Start DevStack services (if not already running)

```bash
source ~/devstack/openrc admin admin
openstack service list  # verify it's up
```

If DevStack is not running after a reboot:

```bash
cd ~/devstack
./rejoin-stack.sh
```

### Terminal 2 — Start OpenDaylight (optional, for SDN features)

```bash
cd ~/odl/karaf-0.12.3
./bin/start           # starts in background
# OR
./bin/karaf           # starts in foreground (shows logs)
```

### Terminal 3 — Start Node.js Backend

```bash
cd Insa-dluxf
npm run server
```

Expected output:

```
--- BEGINNING LEARNING PHASE (SERVICE DISCOVERY) ---
--- LEARNING PHASE COMPLETE: STARTING APIS ---
LEARNED IP ADDRESSES:
  Keystone (Registry): http://127.0.0.1/identity/v3
  Neutron  (Network):  http://127.0.0.1/networking/v2.0
  Nova     (Compute):  http://127.0.0.1/compute/v2.1/<project-id>
  Glance   (Image):    http://127.0.0.1/image/v2

Dashboard backend is now listening on Port 5000
```

> ⚠️ If you see `Warning: Failed to learn OpenStack environment addresses`, it means
> Keystone is not reachable. Check that DevStack is running and the `.env` file
> has the correct IP address.

### Terminal 4 — Start React Frontend

```bash
cd Insa-dluxf
npm run dev
```

Expected output:

```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://<your-ip>:5173/
```

Open your browser and go to: **http://localhost:5173**

### Login credentials (default):

The login page accepts these default credentials (configured in the Login component):

```
Username: admin
Password: secret
```

---

## 10. Port Reference

| Port | Service | Who uses it |
|---|---|---|
| **80** | OpenStack (Apache) — Keystone, Horizon | Node.js backend connects here |
| **5000** | Node.js Backend API | React frontend connects via Vite proxy |
| **5173** | React Frontend (Vite dev server) | Browser opens this |
| **8181** | OpenDaylight REST API | React frontend connects via Vite proxy |

### Firewall rules (if ports are blocked):

```bash
# Open required ports
sudo ufw allow 80/tcp
sudo ufw allow 5000/tcp
sudo ufw allow 5173/tcp
sudo ufw allow 8181/tcp
sudo ufw reload
```

---

## 11. Common Issues & Fixes

### Issue 1 — `ECONNREFUSED 127.0.0.1:80` in Node.js terminal

**Cause:** OpenStack (DevStack) is not running.

**Fix:**
```bash
cd ~/devstack
./rejoin-stack.sh
# Wait for it to finish, then restart the Node.js backend
```

---

### Issue 2 — `Warning: Failed to learn OpenStack environment addresses`

**Cause:** The `KEYSTONE_URL` in `.env` is wrong or DevStack is not running.

**Fix:**
1. Check DevStack is running: `curl http://127.0.0.1/identity/v3`
2. If it returns JSON, Keystone is up — restart the Node.js backend.
3. If it doesn't return anything, run `cd ~/devstack && ./rejoin-stack.sh`

---

### Issue 3 — Cloud dashboard shows "OpenStack unreachable"

**Cause:** DevStack stopped or the IP changed (e.g., after switching networks).

**Fix:** See Section 12 below.

---

### Issue 4 — `npm install` fails with permission errors

**Fix:**
```bash
# Fix npm permissions
sudo chown -R $USER ~/.npm
npm install
```

---

### Issue 5 — `npm run dev` says "port 5173 already in use"

**Fix:**
```bash
# Kill whatever is using port 5173
sudo fuser -k 5173/tcp
npm run dev
```

---

### Issue 6 — `npm run server` says "port 5000 already in use"

**Fix:**
```bash
sudo fuser -k 5000/tcp
npm run server
```

---

### Issue 7 — OVN infrastructure shows "Not Available" in Cloud dashboard

**Cause:** The `ovn-nbctl` command requires `sudo` access without a password.

**Fix:**
```bash
echo "$USER ALL=(ALL) NOPASSWD: /usr/bin/ovn-nbctl" | sudo tee /etc/sudoers.d/ovn-nbctl
sudo chmod 0440 /etc/sudoers.d/ovn-nbctl
```

Then restart the Node.js backend.

---

### Issue 8 — `node_modules` folder is missing

**Cause:** Project was copied without the `node_modules` folder (correct — it should NOT be copied).

**Fix:**
```bash
cd Insa-dluxf
npm install
```

---

### Issue 9 — Topology page shows "ODL controller not reachable"

**Cause:** OpenDaylight is not running.

**Fix:** Start ODL (see Part B, Step 2). The Cloud dashboard will still work without ODL.

---

### Issue 10 — `python3: command not found` when running anomaly scripts

**Fix:**
```bash
sudo apt-get install -y python3 python3-pip
```

---

### Issue 11 — Python `.pkl` model file errors

**Cause:** scikit-learn version mismatch — model was trained with a different version.

**Fix:**
```bash
cd Insa-dluxf
source anomaly_env/bin/activate
pip install scikit-learn==1.3.2  # use same version as original
python3 anomaly/train_classifier.py  # retrain the model
python3 anomaly/train_if.py
```

---

### Issue 12 — DevStack installation fails midway

**Fix:**
```bash
cd ~/devstack
./unstack.sh      # clean up partial install
./clean.sh        # deeper cleanup
./stack.sh        # try again
```

If it keeps failing, check the log:
```bash
cat /opt/stack/logs/stack.sh.log | tail -100
```

---

## 12. Network/IP Change Guide

This project is designed to be **network-agnostic**. When you switch networks
(e.g., from home WiFi to university Ethernet, or move to a different computer),
follow these steps:

### If DevStack and Dashboard are on the SAME machine:

```bash
# The .env uses 127.0.0.1 which never changes — no action needed
# Just restart the Node.js backend after rejoining DevStack:
cd ~/devstack && ./rejoin-stack.sh
cd Insa-dluxf && npm run server
```

### If DevStack is on Machine A and Dashboard is on Machine B:

1. Find Machine A's current IP:
   ```bash
   ip addr show | grep "inet " | grep -v "127.0.0.1"
   # Example output: inet 192.168.5.20/24 ...
   ```

2. Update `.env` on Machine B:
   ```env
   KEYSTONE_URL=http://192.168.5.20/identity/v3
   ```

3. Make sure port 80 is open on Machine A:
   ```bash
   sudo ufw allow 80/tcp
   ```

4. Restart Node.js backend on Machine B:
   ```bash
   npm run server
   ```

### Checking DevStack's current IP address:

```bash
# After DevStack is running
source ~/devstack/openrc admin admin
echo $OS_AUTH_URL
# Shows the current Keystone URL with IP
```

---

## 13. What Each File/Folder Does

| File/Folder | Language | Purpose |
|---|---|---|
| `server.js` | JavaScript (Node.js) | Backend API server. Connects to OpenStack Keystone, auto-discovers Neutron/Nova/Glance URLs, exposes `/api/openstack/*` endpoints to the React frontend |
| `.env` | Config | OpenStack credentials and Keystone URL. **Edit this when switching machines.** |
| `vite.config.js` | JavaScript | Vite build/dev config. Defines proxy rules: `/api/openstack/*` → port 5000, `/api/rests/*` → port 8181 |
| `package.json` | JSON | Lists all npm dependencies. Run `npm install` to install them |
| `index.html` | HTML | Browser entry point |
| `src/App.jsx` | React | Main app with all route definitions |
| `src/main.jsx` | React | React DOM bootstrap |
| `src/Pages/Cloud.jsx` | React | OpenStack Cloud management page — VMs, networks, security groups |
| `src/Components/CloudTopology.jsx` | React | Network topology graph (vis.js) for OpenStack networks |
| `src/Pages/AnomalyDetector/` | React | Anomaly detection UI — shows ML results |
| `src/Pages/Topology/` | React | ODL network topology visualization |
| `src/Pages/Nodes/` | React | ODL node listing and connector |
| `src/Pages/Flows.jsx` | React | OpenFlow flow table viewer |
| `src/Pages/Stats.jsx` | React | Statistics dashboard |
| `src/Components/Dashboard/` | React | Main dashboard with summary cards |
| `src/Components/Login/` | React | Login page |
| `src/Components/Sidebar/` | React | Navigation sidebar |
| `src/Components/Header/` | React | Top navigation bar |
| `anomaly/config.py` | Python | ML model configuration (polling interval, thresholds) |
| `anomaly/detector.py` | Python | Core anomaly detection logic |
| `anomaly/features.py` | Python | Feature extraction from ODL flow tables |
| `anomaly/model.py` | Python | Isolation Forest model wrapper |
| `anomaly/rf_detector.py` | Python | Random Forest detector |
| `anomaly/baseline.py` | Python | Baseline computation for normal traffic |
| `anomaly/coordinator.py` | Python | Orchestrates the detection pipeline |
| `anomaly/mitigation.py` | Python | Automated mitigation actions |
| `anomaly/pretrained_kdd_rf.pkl` | Binary | Pre-trained Random Forest replacement classifier |
| `anomaly/pretrained_if.pkl` | Binary | Pre-trained Isolation Forest model |
| `anomaly/train_classifier.py` | Python | Script to retrain the Random Forest |
| `anomaly/train_if.py` | Python | Script to retrain the Isolation Forest |
| `anomaly/evaluator.py` | Python | Model evaluation and accuracy reporting |

---

## Quick Start Summary (After All Installation is Done)

Once everything is installed, here is the daily startup sequence:

```bash
# Step 1 — Rejoin DevStack (if rebooted)
cd ~/devstack && ./rejoin-stack.sh

# Step 2 — Start OpenDaylight (optional)
cd ~/odl/karaf-0.12.3 && ./bin/start

# Step 3 — Start Node.js backend (in a new terminal)
cd ~/Insa-dluxf && npm run server/node server.js

# Step 4 — Start React frontend (in another new terminal)
cd ~/Insa-dluxf && npm run dev

# Step 5 — Open browser
# Go to: http://localhost:5173
# Login: admin / secret
```

---

*This project was developed as part of an SDN research project integrating
OpenDaylight, OpenStack OVN, and machine learning anomaly detection into a
unified programmable network management dashboard.*
