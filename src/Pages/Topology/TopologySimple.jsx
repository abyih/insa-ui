import { useCallback, useEffect, useRef, useState } from "react";
import { DataSet } from "vis-data";
import { Network } from "vis-network";
import "./topology.css";
import { io } from "socket.io-client";
import { RefreshCw, Layout, Info } from "lucide-react";

const socket = io("http://localhost:5000");

const TopologySimple = ({ topologyData, onReload }) => {
	const containerRef = useRef(null);
	const edgesRef = useRef(null);

	const [selectedNode, setSelectedNode] = useState(null);

	const findNodeByMac = useCallback(
		(mac) => {
			const node = topologyData.nodes.find(
				(n) => n.group === "host" && n.id.includes(mac.toLowerCase())
			);
			return node?.id || null;
		},
		[topologyData.nodes]
	);

	const buildGraph = useCallback(() => {
		const graph = {};
		topologyData.links.forEach(({ from, to }) => {
			if (!graph[from]) graph[from] = [];
			if (!graph[to]) graph[to] = [];
			graph[from].push(to);
			graph[to].push(from);
		});
		return graph;
	}, [topologyData.links]);

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
			height: "550px",
			nodes: {
				size: 30,
				font: { color: "#fafafa", face: "Inter" },
			},
			edges: {
				length: 200,
				color: {
					color: "#27272a",
					highlight: "#6366f1",
					hover: "#10b981",
				},
				smooth: false,
			},
			physics: {
				barnesHut: { gravitationalConstant: -7000 },
			},
			groups: {
				switch: {
					shape: "image",
					image: "assets/images/Device_switch_3062_unknown_64.png",
				},
				host: {
					shape: "image",
					image: "assets/images/Device_pc_3045_default_64.png",
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

		socket.on("packet", ({ src, dst }) => {
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
		});

		return () => {
			const dots = document.querySelectorAll(".port-dot, .port-popup");
			dots.forEach((el) => el.remove());
		};
	}, [buildGraph, findNodeByMac, topologyData]);

	return (
		<div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto">
			{/* Left side: Graph Container */}
			<div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg flex flex-col gap-4">
				<div className="flex justify-between items-center">
					<h3 className="text-base font-bold text-zinc-200 flex items-center gap-2">
						<Layout className="w-5 h-5 text-indigo-400" />
						Logical Network Topology
					</h3>
					<button
						onClick={onReload}
						className="px-4 py-2 bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition duration-150 shadow-sm"
					>
						<RefreshCw className="w-3.5 h-3.5" />
						Reload Topology
					</button>
				</div>
				<div
					ref={containerRef}
					className="w-full h-[550px] border border-zinc-850 rounded-lg relative overflow-hidden bg-zinc-950"
				/>
			</div>

			{/* Right side: Details Drawer */}
			<div className="w-full lg:w-80 bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg h-fit flex flex-col gap-4">
				<h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-3 flex items-center gap-2">
					<Info className="w-4 h-4 text-zinc-500" />
					Node Inspector
				</h3>
				{selectedNode ? (
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
				) : (
					<p className="text-zinc-500 text-xs leading-relaxed">
						Click on any network node in the graph map to view interface metadata and connections.
					</p>
				)}
			</div>
		</div>
	);
};

export default TopologySimple;
