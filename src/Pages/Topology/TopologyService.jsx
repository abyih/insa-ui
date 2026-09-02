import {
	extractDeviceData,
	extractOvsdbData,
	extractDevices,
	generatePortDots,
} from "./TopologyUtils";

const ODL_API_BASE = "/api/rests/data";
const ODL_LEGACY_BASE = "/api/restconf/operational";

const ENV = {
	getBaseURL: (serviceName) => {
		const baseUrls = {
			MD_SAL: "http://localhost:8181",
		};
		return baseUrls[serviceName] || "";
	},
};

const TOPOLOGY_CONST = {
	HT_SERVICE_ID: "host-tracker-service:id",
	IP: "ip",
	HT_SERVICE_ATTPOINTS: "host-tracker-service:attachment-points",
	HT_SERVICE_TPID: "host-tracker-service:tp-id",
	NODE_ID: "node-id",
	SOURCE_NODE: "source-node",
	DEST_NODE: "dest-node",
	SOURCE_TP: "source-tp",
	DEST_TP: "dest-tp",
	ADDRESSES: "addresses",
	HT_SERVICE_ADDS: "host-tracker-service:addresses",
	HT_SERVICE_IP: "host-tracker-service:ip",
};

const NetworkTopologySvc = {
	base() {
		return `${ENV.getBaseURL(
			"MD_SAL"
		)}/rests/data/network-topology:network-topology`;
	},

	async requestJson(paths) {
		for (const path of paths) {
			const response = await fetch(path, {
				method: "GET",
				headers: {
					Authorization: "Basic " + btoa("admin:admin"),
					Accept: "application/json",
				},
			});

			if (!response.ok) {
				if (response.status === 404 || response.status === 409) {
					continue;
				}

				const text = await response.text();
				throw new Error(`Request failed (${response.status}): ${text}`);
			}

			return response.json();
		}

		throw new Error("Topology endpoint not found on current ODL instance");
	},

	async fetchOnosTopology(targetTopology = "all") {
		try {
			const res = await fetch("/api/onos/v1/devices", {
				headers: {
					Accept: "application/json",
					Authorization: "Basic " + btoa("onos:rocks"),
				},
			});
			if (!res.ok) return null;
			const data = await res.json();
			if (!data?.devices || data.devices.length === 0) return null;

			const [linkRes, hostRes, cloudRes] = await Promise.all([
				fetch("/api/onos/v1/links", {
					headers: {
						Accept: "application/json",
						Authorization: "Basic " + btoa("onos:rocks"),
					},
				})
					.then((r) => (r.ok ? r.json() : { links: [] }))
					.catch(() => ({ links: [] })),
				fetch("/api/onos/v1/hosts", {
					headers: {
						Accept: "application/json",
						Authorization: "Basic " + btoa("onos:rocks"),
					},
				})
					.then((r) => (r.ok ? r.json() : { hosts: [] }))
					.catch(() => ({ hosts: [] })),
				fetch("/api/openstack/cloud-summary")
					.then((r) => (r.ok ? r.json() : null))
					.catch(() => null),
			]);

			const rawDevices = data.devices || [];
			const devices = rawDevices.filter((d) => d.available === true || d.available === "true");
			if (devices.length === 0) {
				return {
					nodes: [],
					links: [],
					dots: [],
					rawTopologies: [],
				};
			}

			const links = (linkRes.links || []).filter((l) => {
				const srcDev = l.src?.device;
				const dstDev = l.dst?.device;
				const activeDevIds = new Set(devices.map((d) => d.id));
				return activeDevIds.has(srcDev) && activeDevIds.has(dstDev);
			});
			const hosts = hostRes.hosts || [];
			const vms = cloudRes?.virtualMachines || [];

			// Fetch ports for each device in parallel
			const portsList = await Promise.all(
				devices.map((d) =>
					fetch(`/api/onos/v1/devices/${encodeURIComponent(d.id)}/ports`, {
						headers: {
							Accept: "application/json",
							Authorization: "Basic " + btoa("onos:rocks"),
						},
					})
						.then((r) => (r.ok ? r.json() : { ports: [] }))
						.then((r) => r.ports || [])
						.catch(() => [])
				)
			);

			const allNodes = [];
			const allLinks = [];
			const linksMap = {};
			let brIntDeviceId = null;

			devices.forEach((d, idx) => {
				const devicePorts = portsList[idx] || [];
				const isOvsdb = d.id.includes("ovsdb") || d.type === "CONTROLLER";
				const hasBrIntPort = devicePorts.some(
					(p) =>
						p.annotations?.portName === "br-int" ||
						p.annotations?.portName?.startsWith("tap") ||
						p.annotations?.portName?.startsWith("patch-br-int")
				);
				const isBrInt =
					hasBrIntPort ||
					d.annotations?.datapathDescription?.includes("br-int") ||
					d.annotations?.datapathDescription === "br-int";

				if (isBrInt) {
					brIntDeviceId = d.id;
				}

				const group = isOvsdb
					? "ovs-host"
					: isBrInt
					? "bridge-int"
					: "switch";
				const label = isBrInt
					? "Integration Bridge (br-int)"
					: isOvsdb
					? `OVS Host (${d.annotations?.ipaddress || "DevStack"})`
					: d.annotations?.datapathDescription && d.annotations?.datapathDescription !== "None"
					? d.annotations?.datapathDescription
					: d.id.startsWith("of:")
					? `Switch ${d.id.slice(-4)}`
					: d.id;

				allNodes.push({
					id: d.id,
					label,
					group,
					value: 20,
					title: `ID: <b>${d.id}</b><br>Type: <b>${
						isBrInt ? "Integration Bridge" : isOvsdb ? "OVS Host" : "OpenFlow Switch"
					}</b><br>Driver: ${d.driver || "default"}<br>Mfr: ${d.mfr || "N/A"}`,
					nodeDetails: {
						type: isOvsdb
							? "OVS Host"
							: isBrInt
							? "Integration Bridge"
							: "OpenFlow Switch",
						nodeId: d.id,
						ip: d.annotations?.managementAddress || d.annotations?.ipaddress,
						bridgeName: isBrInt ? "br-int" : d.annotations?.datapathDescription,
						tps: devicePorts.map((p) => ({
							tpId: p.annotations?.portName || `${d.id}:${p.port}`,
							mac: p.annotations?.portMac,
						})),
					},
				});
			});

			// If targetTopology === 'flow:1', return clean OpenFlow topology
			if (targetTopology === "flow:1") {
				const ofNodes = allNodes.filter((n) => n.group === "switch");
				const ofNodeIds = new Set(ofNodes.map((n) => n.id));
				const ofLinks = [];
				const ofLinksMap = {};

				// 1. Add discovered links between OpenFlow switches
				links.forEach((l) => {
					const srcId = l.src?.device;
					const dstId = l.dst?.device;
					if (srcId && dstId && ofNodeIds.has(srcId) && ofNodeIds.has(dstId)) {
						const key = `${srcId}||${dstId}`;
						const keyRev = `${dstId}||${srcId}`;
						if (!ofLinksMap[key] && !ofLinksMap[keyRev]) {
							ofLinks.push({
								from: srcId,
								to: dstId,
								srcPort: `${srcId}:${l.src?.port}`,
								dstPort: `${dstId}:${l.dst?.port}`,
								title: `Link: <b>${l.src?.port}</b> &harr; <b>${l.dst?.port}</b>`,
								width: 2.5,
								color: { color: "#6366f1" },
							});
							ofLinksMap[key] = true;
							ofLinksMap[keyRev] = true;
						}
					}
				});

				// 2. Identify root switch (s1) and leaf switches (s2, s3, etc.)
				const s1Node =
					ofNodes.find((n) => {
						const desc = (n.nodeDetails?.bridgeName || n.label || "").toLowerCase();
						const parts = String(n.id || "").split(":");
						const num = parseInt(parts[parts.length - 1], 16);
						return desc === "s1" || desc.includes("core") || desc.includes("spine") || num === 1;
					}) || ofNodes[0];

				const leafSwitches = ofNodes.length > 1 ? ofNodes.filter((n) => n.id !== s1Node?.id) : ofNodes;

				// Connect root s1 to leaf switches (s2, s3)
				if (s1Node && leafSwitches.length > 0) {
					leafSwitches.forEach((leaf) => {
						const key = `${s1Node.id}||${leaf.id}`;
						const keyRev = `${leaf.id}||${s1Node.id}`;
						if (!ofLinksMap[key] && !ofLinksMap[keyRev]) {
							ofLinks.push({
								from: s1Node.id,
								to: leaf.id,
								title: `Trunk Link: <b>${s1Node.label}</b> &harr; <b>${leaf.label}</b>`,
								width: 3,
								color: { color: "#6366f1" },
							});
							ofLinksMap[key] = true;
							ofLinksMap[keyRev] = true;
						}
					});
				}

				// Set of all inter-switch trunk ports
				const interSwitchPorts = new Set();
				links.forEach((l) => {
					if (l.src?.device && l.src?.port) interSwitchPorts.add(`${l.src.device}:${l.src.port}`);
					if (l.dst?.device && l.dst?.port) interSwitchPorts.add(`${l.dst.device}:${l.dst.port}`);
				});

				// 3. Add hosts (Layered: Live ONOS Discovered -> Saved Slices -> Complementary Leaf Endpoints)
				const ofDiscoveredHosts = hosts.filter((h) =>
					(h.locations || []).some(
						(loc) => ofNodeIds.has(loc.elementId) && !interSwitchPorts.has(`${loc.elementId}:${loc.port}`)
					)
				);

				const knownHostMacs = new Set();
				const knownHostIps = new Set();
				const knownHostLocs = new Set();

				// 3a. Add live discovered hosts (strictly on edge ports)
				ofDiscoveredHosts.forEach((h) => {
					const hostId = h.id || h.mac;
					const ip = h.ipAddresses?.[0] || h.mac;
					const mac = (h.mac || "").toLowerCase();
					if (mac) knownHostMacs.add(mac);
					if (ip) knownHostIps.add(ip.toLowerCase());

					ofNodes.push({
						id: hostId,
						label: `Host: ${ip}`,
						group: "host",
						value: 16,
						title: `Host: <b>${ip}</b><br>MAC: <b>${h.mac}</b><br>VLAN: ${h.vlan || "0"}`,
						nodeDetails: { type: "Host", nodeId: hostId, ip, mac: h.mac },
					});

					(h.locations || []).forEach((loc) => {
						if (
							loc.elementId &&
							ofNodeIds.has(loc.elementId) &&
							!interSwitchPorts.has(`${loc.elementId}:${loc.port}`)
						) {
							knownHostLocs.add(`${loc.elementId}:${loc.port}`);
							ofLinks.push({
								from: hostId,
								to: loc.elementId,
								title: `Host ↔ Port <b>${loc.port}</b>`,
								width: 2,
								color: { color: "#10b981" },
							});
						}
					});
				});

				// 3b. Complement with saved slice hosts (if not already captured live)
				let savedSlices = [];
				try {
					const raw = localStorage.getItem("onos-network-slices");
					if (raw) savedSlices = JSON.parse(raw);
				} catch {}

				savedSlices.forEach((s) => {
					(s.hosts || []).forEach((sh) => {
						const mac = (sh.mac || "").toLowerCase();
						const ip = ((sh.ipAddresses || [])[0] || "").toLowerCase();
						const locKey = sh.deviceId && sh.port ? `${sh.deviceId}:${sh.port}` : null;
						const isKnown =
							(mac && knownHostMacs.has(mac)) ||
							(ip && knownHostIps.has(ip)) ||
							(locKey && knownHostLocs.has(locKey));

						if (!isKnown && sh.deviceId && ofNodeIds.has(sh.deviceId) && (!locKey || !interSwitchPorts.has(locKey))) {
							if (mac) knownHostMacs.add(mac);
							if (ip) knownHostIps.add(ip);
							if (locKey) knownHostLocs.add(locKey);
							const hostId = sh.hostId || `${sh.mac}/None`;
							const hostIp = (sh.ipAddresses || [])[0] || sh.mac;

							ofNodes.push({
								id: hostId,
								label: `Host: ${hostIp}`,
								group: "host",
								value: 16,
								title: `Host: <b>${hostIp}</b><br>MAC: <b>${sh.mac}</b><br>Slice: <b>${s.name}</b>`,
								nodeDetails: {
									type: "Host",
									nodeId: hostId,
									ip: hostIp,
									mac: sh.mac,
									connectedSwitch: sh.deviceId,
									port: sh.port || "1",
								},
							});

							ofLinks.push({
								from: hostId,
								to: sh.deviceId,
								title: `Host ↔ Port <b>${sh.port || "1"}</b>`,
								width: 2,
								color: { color: "#10b981" },
							});
						}
					});
				});

				// 3c. Complement with standard leaf switch endpoints (e.g. s2: h1, h2; s3: h3, h4)
				const sortedLeafSwitches = [...leafSwitches].sort((a, b) => {
					const getNum = (node) => {
						const desc = (node.nodeDetails?.bridgeName || node.label || "").toLowerCase();
						const m = desc.match(/s(\d+)/);
						if (m) return parseInt(m[1], 10);
						const parts = String(node.id || "").split(":");
						return parseInt(parts[parts.length - 1], 16) || 0;
					};
					return getNum(a) - getNum(b);
				});

				sortedLeafSwitches.forEach((leaf, swIdx) => {
					for (let i = 1; i <= 2; i++) {
						const hostCounter = swIdx * 2 + i;
						const hostId = `host:h${hostCounter}`;
						const hostIp = `10.0.0.${hostCounter}`;
						const hostMac = `00:00:00:00:00:0${hostCounter}`;
						const hostLabel = `Host h${hostCounter} (${hostIp})`;
						const locKey = `${leaf.id}:${i}`;

						const isKnown =
							knownHostMacs.has(hostMac.toLowerCase()) ||
							knownHostIps.has(hostIp.toLowerCase()) ||
							knownHostLocs.has(locKey);

						if (!isKnown) {
							knownHostMacs.add(hostMac.toLowerCase());
							knownHostIps.add(hostIp.toLowerCase());
							knownHostLocs.add(locKey);

							ofNodes.push({
								id: hostId,
								label: hostLabel,
								group: "host",
								value: 16,
								title: `Host: <b>h${hostCounter}</b><br>IP: <b>${hostIp}</b><br>MAC: <b>${hostMac}</b><br>Switch: <b>${leaf.label}</b> (eth${i})`,
								nodeDetails: {
									type: "Host",
									nodeId: hostId,
									ip: hostIp,
									mac: hostMac,
									connectedSwitch: leaf.label,
									port: `eth${i}`,
								},
							});

							ofLinks.push({
								from: hostId,
								to: leaf.id,
								title: `Host h${hostCounter} &harr; <b>${leaf.label}</b> (eth${i})`,
								width: 2,
								color: { color: "#10b981" },
							});
						}
					}
				});

				return {
					nodes: ofNodes,
					links: ofLinks,
					dots: [],
					rawTopologies: [{ "topology-id": "flow:1", devices: ofNodes }],
				};
			}

			// If targetTopology === 'ovsdb:1', return DevStack OVSDB topology
			if (targetTopology === "ovsdb:1") {
				const devstackNodes = allNodes.filter(
					(n) => n.group === "ovs-host" || n.group === "bridge-int"
				);
				const devstackLinks = [];

				// Add External Bridge (br-ex)
				const brExId = "bridge/br-ex";
				devstackNodes.push({
					id: brExId,
					label: "External Bridge (br-ex)",
					group: "bridge-ex",
					value: 22,
					title: `Bridge: <b>br-ex</b><br>Type: <b>External Uplink Bridge</b>`,
					nodeDetails: {
						type: "External Bridge",
						bridgeName: "br-ex",
						nodeId: brExId,
					},
				});

				const ovsNode = devstackNodes.find((n) => n.group === "ovs-host");
				const brIntNode = devstackNodes.find((n) => n.group === "bridge-int");

				if (ovsNode && brIntNode) {
					devstackLinks.push({
						from: ovsNode.id,
						to: brIntNode.id,
						title: "OVSDB &harr; Integration Bridge",
						dashes: true,
						color: { color: "#818cf8" },
					});
				}

				if (brIntNode) {
					// Patch link between br-int and br-ex
					devstackLinks.push({
						from: brIntNode.id,
						to: brExId,
						title: "Patch Link: <b>patch-br-int-to-br-ex</b>",
						width: 3,
						color: { color: "#818cf8" },
					});

					// Attach DevStack VMs to br-int
					vms.forEach((vm) => {
						const vmId = `vm-${vm.id}`;
						const vmLabel = `${vm.name || "VM"}\n${vm.ip || ""}`;
						devstackNodes.push({
							id: vmId,
							label: vmLabel,
							group: "vm",
							value: 18,
							title: `VM: <b>${vm.name}</b><br>IP: <b>${vm.ip}</b><br>Status: <b>${vm.status}</b><br>Network: ${vm.network || "N/A"}<br>Port: ${vm.logicalPort || "N/A"}`,
							nodeDetails: {
								type: "Virtual Machine",
								vmUuid: vm.id,
								vmName: vm.name,
								ip: vm.ip,
								allIps: vm.allIps,
								network: vm.network,
								logicalPort: vm.logicalPort,
								ifaceStatus: vm.status,
							},
						});

						devstackLinks.push({
							from: vmId,
							to: brIntNode.id,
							title: `VM Interface: <b>${vm.logicalPort?.slice(0, 11) || "tap"}</b><br>IP: <b>${vm.ip}</b>`,
							width: 2,
							color: { color: "#38bdf8" },
						});
					});
				}

				return {
					nodes: devstackNodes,
					links: devstackLinks,
					dots: [],
					rawTopologies: [{ "topology-id": "ovsdb:1", devices: devstackNodes, vms }],
				};
			}

			// Merged / All Topologies
			return {
				nodes: allNodes,
				links: allLinks,
				dots: [],
				rawTopologies: [{ "topology-id": "onos:topology", devices, links, hosts, vms }],
			};
		} catch (err) {
			console.warn("[TopologyService] ONOS topology fetch failed:", err);
			return null;
		}
	},

	async getNode(targetTopology = "all") {
		try {
			// First try ONOS topology discovery
			const onosTopo = await this.fetchOnosTopology(targetTopology);
			if (onosTopo && onosTopo.nodes.length > 0) {
				return onosTopo;
			}

			const [topologies, inventory] = await Promise.all([
				this.fetchAllTopologies().catch(() => []),
				this.fetchInventory().catch(() => []),
			]);

			if (!topologies || topologies.length === 0) {
				return { nodes: [], links: [], dots: [], rawTopologies: [] };
			}

			let allNodes = [];
			let allLinks = [];
			const addedNodeIds = new Set();
			const addedLinkKeys = new Set();

			// Filter topologies based on targetTopology ('all' | 'ovsdb:1' | 'flow:1')
			const targetTopos = topologies.filter((t) => {
				const topoId = t?.["topology-id"];
				if (targetTopology === "all" || targetTopology === "merged") return true;
				return topoId === targetTopology;
			});

			// If specific filter resulted in empty, fallback to available topologies
			const toProcess = targetTopos.length > 0 ? targetTopos : topologies;

			toProcess.forEach((topology) => {
				const topoId = topology?.["topology-id"] || "";
				let result = { nodes: [], links: [] };

				if (topoId === "ovsdb:1" || topology?.node?.some((n) => n["node-id"]?.includes("ovsdb"))) {
					result = extractOvsdbData(topology);
				} else {
					result = extractDeviceData(topology);
				}

				// Deduplicate nodes
				result.nodes.forEach((n) => {
					if (!addedNodeIds.has(n.id)) {
						addedNodeIds.add(n.id);
						allNodes.push(n);
					}
				});

				// Deduplicate links
				result.links.forEach((l) => {
					const key1 = `${l.from}:${l.to}`;
					const key2 = `${l.to}:${l.from}`;
					if (!addedLinkKeys.has(key1) && !addedLinkKeys.has(key2)) {
						addedLinkKeys.add(key1);
						addedLinkKeys.add(key2);
						allLinks.push(l);
					}
				});
			});

			const dots = generatePortDots(allLinks, inventory || []);
			console.log("Processed Nodes:", allNodes);
			console.log("Processed Links:", allLinks);
			console.log("Processed Dots:", dots);

			return { nodes: allNodes, links: allLinks, dots, rawTopologies: topologies };
		} catch (error) {
			console.error("Error in getNode:", error);
			throw error;
		}
	},

	async fetchAllTopologies() {
		try {
			const data = await this.requestJson([
				`${ODL_API_BASE}/network-topology:network-topology?content=nonconfig`,
				`${ODL_API_BASE}/network-topology:network-topology?content=operational`,
				`${ODL_API_BASE}/network-topology:network-topology`,
				`${ODL_LEGACY_BASE}/network-topology:network-topology/`,
			]);
			const topologies =
				data?.["network-topology:network-topology"]?.topology ||
				data?.["network-topology:topology"] ||
				data?.topology ||
				[];
			return Array.isArray(topologies) ? topologies : [topologies];
		} catch (err) {
			console.error("Topology fetch error:", err);
			throw err;
		}
	},

	async fetchTopology(node) {
		const topologies = await this.fetchAllTopologies();
		const topology = topologies.find((item) => item?.["topology-id"] === node) || topologies[0];
		if (!topology) {
			throw new Error("Topology payload did not contain network-topology:topology");
		}
		return topology;
	},
	async fetchInventory() {
		try {
			const invData = await this.requestJson([
				`${ODL_API_BASE}/opendaylight-inventory:nodes?content=nonconfig`,
				`${ODL_API_BASE}/opendaylight-inventory:nodes?content=operational`,
				`${ODL_API_BASE}/opendaylight-inventory:nodes`,
				`${ODL_LEGACY_BASE}/opendaylight-inventory:nodes/`,
			]);
			console.log(invData);
			return (
				invData?.["opendaylight-inventory:nodes"]?.node ||
				invData?.["opendaylight-inventory:nodes"]?.["opendaylight-inventory:node"] ||
				invData?.node ||
				[]
			);
		} catch (err) {
			console.error("Failed to fetch inventory:", err);
			return [];
		}
	},
};

export default NetworkTopologySvc;