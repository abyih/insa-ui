import { useCallback, useEffect, useRef, useState } from "react";
import { DataSet } from "vis-data";
import { Network } from "vis-network";
import "./topology.css";
import { io } from "socket.io-client";
import { RefreshCw, Layout, Info, Server, Cpu, Network as NetIcon, Monitor, ShieldCheck } from "lucide-react";

const TopologySimple = ({ topologyData, currentFilter = "all", onFilterChange, onReload }) => {
	const containerRef = useRef(null);
	const edgesRef = useRef(null);

	const [selectedNode, setSelectedNode] = useState(null);

	const findNodeByMac = useCallback(
		(mac) => {
			const node = topologyData?.nodes?.find(
				(n) => (n.group === "host" || n.group === "vm") && n.id.includes(mac.toLowerCase())
			);
			return node?.id || null;
		},
		[topologyData?.nodes]
	);

	const buildGraph = useCallback(() => {
		const graph = {};
		(topologyData?.links || []).forEach(({ from, to }) => {
			if (!graph[from]) graph[from] = [];
			if (!graph[to]) graph[to] = [];
			graph[from].push(to);
			graph[to].push(from);
		});
		return graph;
	}, [topologyData?.links]);

	const findShortestPath = (graph, start, end) => {
		const queue = [[start]];
		const visited = new Set();

		while (queue.length > 0) {
			const path = queue.shift();
			const node = path[path.length - 1];

			if (node === end) return path;

			if (!visited.has(node)) {
				visited.add(node);
				(graph[node] || []).forEach((neighbor) => {
					queue.push([...path, neighbor]);
				});
			}
		}
		return null;
	};

	const highlightPath = (path) => {
		if (!path || path.length < 2) return;

		const edges = edgesRef.current;
		const highlightColor = { color: "#ef4444" };

		for (let i = 0; i < path.length - 1; i++) {
			const from = path[i];
			const to = path[i + 1];

			const edge = edges.get({
				filter: (e) =>
					(e.from === from && e.to === to) ||
					(e.from === to && e.to === from),
			})[0];

			if (edge) {
				edges.update({ ...edge, color: highlightColor, width: 4 });

				setTimeout(() => {
					edges.update({
						...edge,
						color: { color: "#52525b" },
						width: 2,
					});
				}, 1000);
			}
		}
	};

	useEffect(() => {
		console.log("Topology Data:", topologyData);
		if (!topologyData) return;

		const nodes = new DataSet(topologyData.nodes || []);
		const edges = new DataSet(topologyData.links || []);
		edgesRef.current = edges;

		const data = { nodes, edges };
		const portDots = topologyData.dots || [];

		const options = {
			width: "100%",
			height: "580px",
			nodes: {
				size: 30,
				font: {
					color: "#f4f4f5",
					face: "Inter",
					size: 12,
					background: "rgba(24, 24, 27, 0.85)",
					strokeWidth: 2,
					strokeColor: "#09090b",
				},
			},
			edges: {
				length: 220,
				color: {
					color: "#3f3f46",
					highlight: "#6366f1",
					hover: "#10b981",
				},
				smooth: false,
			},
			physics: {
				barnesHut: { gravitationalConstant: -8000, centralGravity: 0.3, springLength: 150 },
			},
			groups: {
				switch: {
					shape: "image",
					image: "/assets/images/Device_switch_3062_unknown_64.png",
					font: { color: "#38bdf8", background: "rgba(15, 23, 42, 0.9)", strokeWidth: 2, strokeColor: "#09090b" },
				},
				host: {
					shape: "image",
					image: "/assets/images/Device_pc_3045_default_64.png",
					font: { color: "#a7f3d0", background: "rgba(6, 78, 59, 0.9)", strokeWidth: 2, strokeColor: "#09090b" },
				},
				"ovs-host": {
					shape: "box",
					color: {
						background: "#1e1b4b",
						border: "#6366f1",
						highlight: { background: "#312e81", border: "#818cf8" },
					},
					font: { color: "#e0e7ff", face: "Inter", size: 13, bold: true },
					borderWidth: 2,
					shapeProperties: { borderRadius: 8 },
					margin: 12,
				},
				"bridge-int": {
					shape: "box",
					color: {
						background: "#064e3b",
						border: "#10b981",
						highlight: { background: "#065f46", border: "#34d399" },
					},
					font: { color: "#ecfdf5", face: "Inter", size: 13, bold: true },
					borderWidth: 2,
					shapeProperties: { borderRadius: 6 },
					margin: 10,
				},
				"bridge-ex": {
					shape: "box",
					color: {
						background: "#78350f",
						border: "#f59e0b",
						highlight: { background: "#92400e", border: "#fbbf24" },
					},
					font: { color: "#fffbeb", face: "Inter", size: 13, bold: true },
					borderWidth: 2,
					shapeProperties: { borderRadius: 6 },
					margin: 10,
				},
				vm: {
					shape: "image",
					image: "/assets/images/Device_pc_3045_default_64.png",
					font: { color: "#bae6fd", background: "rgba(12, 74, 110, 0.9)", strokeWidth: 2, strokeColor: "#09090b" },
				},
			},
		};

		const network = new Network(containerRef.current, data, options);

		portDots.forEach(({ id, mac, port }) => {
			const dot = document.createElement("div");
			dot.className = "port-dot";
			dot.id = id;

			const popup = document.createElement("div");
			popup.className = "port-popup";
			popup.innerHTML = `<b>MAC:</b> ${mac}<br><b>Port:</b> ${port}`;

			containerRef.current.appendChild(dot);
			containerRef.current.appendChild(popup);
		});

		const getDotPosition = (from, to, distance = 40) => {
			const dx = to.x - from.x;
			const dy = to.y - from.y;
			const len = Math.sqrt(dx * dx + dy * dy);
			if (len === 0) return { x: from.x, y: from.y };

			const ratio = distance / len;
			return {
				x: from.x + dx * ratio,
				y: from.y + dy * ratio,
			};
		};

		const updateDotPositions = () => {
			portDots.forEach(({ id, source, target }) => {
				const from = network.getPositions([source])[source];
				const to = network.getPositions([target])[target];
				if (!from || !to) return;

				const { x, y } = getDotPosition(from, to);
				const screen = network.canvasToDOM({ x, y });

				const dot = document.getElementById(id);
				const popup = dot?.nextSibling;

				if (dot && popup) {
					dot.style.left = `${screen.x}px`;
					dot.style.top = `${screen.y}px`;
					popup.style.left = `${screen.x}px`;
					popup.style.top = `${screen.y}px`;
				}
			});
		};

		network.once("stabilized", updateDotPositions);
		network.on("dragEnd", updateDotPositions);
		network.on("afterDrawing", updateDotPositions);

		network.on("click", function (params) {
			if (params.nodes.length > 0) {
				const nodeId = params.nodes[0];
				const clickedNode = nodes.get(nodeId);
				setSelectedNode(clickedNode);
			} else {
				setSelectedNode(null);
			}
		});

		const socket = io("http://localhost:5000", {
			autoConnect: false,
			reconnectionAttempts: 2,
			timeout: 3000,
		});

		const handlePacket = ({ src, dst }) => {
			const srcNode = findNodeByMac(src);
			const dstNode = findNodeByMac(dst);

			if (!srcNode || !dstNode) {
				console.warn("Host node not found for MACs:", src, dst);
				return;
			}

			const graph = buildGraph();
			const path = findShortestPath(graph, srcNode, dstNode);

			if (!path) {
				console.warn("No path found between", srcNode, dstNode);
				return;
			}

			console.log("Highlighting path:", path);
			highlightPath(path);
		};

		socket.on("packet", handlePacket);

		return () => {
			socket.off("packet", handlePacket);
			socket.disconnect();
			const dots = document.querySelectorAll(".port-dot, .port-popup");
			dots.forEach((el) => el.remove());
		};
	}, [buildGraph, findNodeByMac, topologyData]);

	const renderNodeDetails = () => {
		if (!selectedNode) {
			return (
				<p className="text-zinc-500 text-xs leading-relaxed">
					Click on any network node in the graph map to view interface metadata and connections.
				</p>
			);
		}

		const details = selectedNode.nodeDetails;
		if (!details) {
			return (
				<div className="space-y-4">
					<div>
						<span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Device ID</span>
						<span className="block text-sm font-semibold text-zinc-100 mt-1 break-all">{selectedNode.id}</span>
					</div>
					<div className="border-t border-zinc-800 pt-4">
						<span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Connected Interfaces</span>
						<div
							className="text-xs text-zinc-300 font-mono leading-relaxed space-y-1.5"
							dangerouslySetInnerHTML={{
								__html: selectedNode.title,
							}}
						/>
					</div>
				</div>
			);
		}

		if (details.type === "Virtual Machine") {
			return (
				<div className="space-y-3">
					<div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
						<Monitor className="w-4 h-4 text-cyan-400" />
						<span className="text-sm font-bold text-zinc-100">Virtual Machine</span>
						<span className={`ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full ${details.ifaceStatus === "active" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-zinc-800 text-zinc-400"}`}>
							{details.ifaceStatus?.toUpperCase()}
						</span>
					</div>

					<div className="space-y-2">
						<div>
							<span className="text-[10px] font-bold text-zinc-500 uppercase">VM UUID</span>
							<span className="block text-xs font-mono font-semibold text-zinc-200 break-all bg-zinc-950 p-1.5 rounded border border-zinc-800 mt-0.5">{details.vmUuid}</span>
						</div>

						<div>
							<span className="text-[10px] font-bold text-zinc-500 uppercase">Attached MAC</span>
							<span className="block text-xs font-mono text-indigo-300 mt-0.5">{details.mac}</span>
						</div>

						<div>
							<span className="text-[10px] font-bold text-zinc-500 uppercase">Interface ID</span>
							<span className="block text-xs font-mono text-zinc-400 mt-0.5 break-all">{details.ifaceId}</span>
						</div>

						<div>
							<span className="text-[10px] font-bold text-zinc-500 uppercase">TAP Port</span>
							<span className="block text-xs font-mono text-emerald-400 mt-0.5">{details.tapPort}</span>
						</div>

						<div>
							<span className="text-[10px] font-bold text-zinc-500 uppercase">Connected Bridge</span>
							<span className="block text-xs font-semibold text-zinc-300 mt-0.5">{details.connectedBridge}</span>
						</div>
					</div>
				</div>
			);
		}

		if (details.type === "Integration Bridge" || details.type === "External Bridge") {
			const isInt = details.type === "Integration Bridge";
			const extEntries = Object.entries(details.externalIds || {});
			const ctZones = extEntries.filter(([k]) => k.startsWith("ct-zone"));
			const otherExt = extEntries.filter(([k]) => !k.startsWith("ct-zone"));

			return (
				<div className="space-y-3">
					<div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
						<NetIcon className={`w-4 h-4 ${isInt ? "text-emerald-400" : "text-amber-400"}`} />
						<span className="text-sm font-bold text-zinc-100">{details.bridgeName}</span>
						<span className={`ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full ${isInt ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-amber-950 text-amber-400 border border-amber-800"}`}>
							{isInt ? "INT" : "EX"}
						</span>
					</div>

					<div className="space-y-2">
						<div>
							<span className="text-[10px] font-bold text-zinc-500 uppercase">Bridge UUID</span>
							<span className="block text-xs font-mono text-zinc-300 break-all">{details.bridgeUuid}</span>
						</div>

						{details.datapathType && (
							<div>
								<span className="text-[10px] font-bold text-zinc-500 uppercase">Datapath Type</span>
								<span className="block text-xs text-zinc-300 font-mono">{details.datapathType}</span>
							</div>
						)}

						{otherExt.length > 0 && (
							<div>
								<span className="text-[10px] font-bold text-zinc-500 uppercase mb-1 block">External Configs</span>
								<div className="space-y-1 bg-zinc-950 p-2 rounded border border-zinc-800 max-h-28 overflow-y-auto">
									{otherExt.map(([k, v]) => (
										<div key={k} className="text-[11px] font-mono flex justify-between gap-2 border-b border-zinc-900 pb-0.5">
											<span className="text-zinc-400 truncate">{k}</span>
											<span className="text-indigo-400 font-semibold shrink-0">{v}</span>
										</div>
									))}
								</div>
							</div>
						)}

						{ctZones.length > 0 && (
							<div>
								<span className="text-[10px] font-bold text-zinc-500 uppercase mb-1 block">CT Zones ({ctZones.length})</span>
								<div className="space-y-1 bg-zinc-950 p-2 rounded border border-zinc-800 max-h-28 overflow-y-auto">
									{ctZones.map(([k, v]) => {
										const cleanName = k.replace("ct-zone-", "").replace("neutron-", "").replace("provnet-", "");
										return (
											<div key={k} className="text-[11px] font-mono flex justify-between gap-2">
												<span className="text-zinc-400 truncate">{cleanName}</span>
												<span className="text-emerald-400 font-bold font-mono">Zone {v}</span>
											</div>
										);
									})}
								</div>
							</div>
						)}

						{details.tps && details.tps.length > 0 && (
							<div>
								<span className="text-[10px] font-bold text-zinc-500 uppercase mb-1 block">Attached Ports ({details.tps.length})</span>
								<div className="flex flex-wrap gap-1">
									{details.tps.map((tp) => (
										<span key={tp.tpId} className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-950 text-zinc-300 border border-zinc-800 rounded">
											{tp.tpId}
										</span>
									))}
								</div>
							</div>
						)}
					</div>
				</div>
			);
		}

		if (details.type === "OVS Host") {
			const extEntries = Object.entries(details.externalIds || {});
			return (
				<div className="space-y-3">
					<div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
						<Server className="w-4 h-4 text-indigo-400" />
						<span className="text-sm font-bold text-zinc-100">{details.hostname}</span>
						<span className="ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800">
							HOST
						</span>
					</div>

					<div className="space-y-2">
						<div>
							<span className="text-[10px] font-bold text-zinc-500 uppercase">OVS Version</span>
							<span className="block text-xs font-mono text-zinc-200 mt-0.5">{details.ovsVersion}</span>
						</div>

						{extEntries.length > 0 && (
							<div>
								<span className="text-[10px] font-bold text-zinc-500 uppercase mb-1 block">Host Configurations</span>
								<div className="space-y-1 bg-zinc-950 p-2 rounded border border-zinc-800 max-h-36 overflow-y-auto">
									{extEntries.map(([k, v]) => (
										<div key={k} className="text-[11px] font-mono flex justify-between gap-2 border-b border-zinc-900 pb-0.5">
											<span className="text-zinc-400 truncate">{k}</span>
											<span className="text-cyan-400 font-semibold truncate">{v}</span>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				</div>
			);
		}

		// Fallback
		return (
			<div className="space-y-3">
				<div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
					<Cpu className="w-4 h-4 text-zinc-400" />
					<span className="text-sm font-bold text-zinc-100">{selectedNode.label}</span>
				</div>
				<div
					className="text-xs text-zinc-300 font-mono leading-relaxed space-y-1.5"
					dangerouslySetInnerHTML={{
						__html: selectedNode.title,
					}}
				/>
			</div>
		);
	};

	return (
		<div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto">
			{/* Left side: Graph Container */}
			<div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg flex flex-col gap-4">
				<div className="flex flex-wrap justify-between items-center gap-3">
					<h3 className="text-base font-bold text-zinc-200 flex items-center gap-2">
						<Layout className="w-5 h-5 text-indigo-400" />
						Logical Network Topology
					</h3>

					<div className="flex items-center gap-3">
						{/* Topology Dropdown Selector */}
						{onFilterChange && (
							<div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs">
								<span className="text-zinc-500 font-semibold">View:</span>
								<select
									value={currentFilter}
									onChange={(e) => onFilterChange(e.target.value)}
									className="bg-transparent text-zinc-200 font-semibold focus:outline-none cursor-pointer"
								>
									<option value="all" className="bg-zinc-900 text-zinc-200">Merged (All Topologies)</option>
									<option value="ovsdb:1" className="bg-zinc-900 text-zinc-200">DevStack OVSDB (ovsdb:1)</option>
									<option value="flow:1" className="bg-zinc-900 text-zinc-200">OpenFlow (flow:1)</option>
								</select>
							</div>
						)}

						<button
							onClick={onReload}
							className="px-4 py-2 bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition duration-150 shadow-sm"
						>
							<RefreshCw className="w-3.5 h-3.5" />
							Reload Topology
						</button>
					</div>
				</div>

				{/* Vis-Network Canvas */}
				<div
					ref={containerRef}
					className="w-full h-[580px] border border-zinc-850 rounded-lg relative overflow-hidden bg-zinc-950"
				/>

				{/* Graph Legend */}
				<div className="flex flex-wrap items-center gap-5 text-xs text-zinc-300 bg-zinc-950/80 p-3.5 rounded-lg border border-zinc-800 shadow-inner">
					<span className="font-bold text-zinc-200 flex items-center gap-1.5">
						<Info className="w-3.5 h-3.5 text-indigo-400" />
						Legend:
					</span>
					<div className="flex items-center gap-2">
						<span className="w-3.5 h-3.5 rounded bg-indigo-950 border-2 border-indigo-500 inline-block shadow-sm"></span>
						<span>OVS Host</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="w-3.5 h-3.5 rounded bg-emerald-950 border-2 border-emerald-500 inline-block shadow-sm"></span>
						<span>br-int (Integration)</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="w-3.5 h-3.5 rounded bg-amber-950 border-2 border-amber-500 inline-block shadow-sm"></span>
						<span>br-ex (External)</span>
					</div>
					<div className="flex items-center gap-2">
						<img src="/assets/images/Device_pc_3045_default_64.png" alt="VM" className="w-4 h-4 object-contain inline-block" />
						<span>Virtual Machine</span>
					</div>
					<div className="flex items-center gap-2">
						<img src="/assets/images/Device_switch_3062_unknown_64.png" alt="Switch" className="w-4 h-4 object-contain inline-block" />
						<span>OpenFlow Switch</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="w-4 h-1 bg-indigo-400 rounded-full inline-block"></span>
						<span>Patch Link</span>
					</div>
				</div>
			</div>

			{/* Right side: Details Drawer */}
			<div className="w-full lg:w-80 bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg h-fit flex flex-col gap-4">
				<h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-3 flex items-center gap-2">
					<Info className="w-4 h-4 text-zinc-500" />
					Node Inspector
				</h3>
				{renderNodeDetails()}
			</div>
		</div>
	);
};

export default TopologySimple;
