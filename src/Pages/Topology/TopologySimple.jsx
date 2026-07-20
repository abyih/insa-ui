import { useCallback, useEffect, useRef, useState } from "react";
import { DataSet } from "vis-data";
import { Network } from "vis-network";
import "./topology.css";
import { io } from "socket.io-client";

const socket = io("http://localhost:5000");

const TopologySimple = ({ topologyData, onReload }) => {
	const containerRef = useRef(null);
	const edgesRef = useRef(null); // Track edges outside useEffect

	const [selectedNode, setSelectedNode] = useState(null);

	// const [devices, setDevices] = useState(null);
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
		const highlightColor = { color: "red" };

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

				// Revert after 1s
				setTimeout(() => {
					edges.update({
						...edge,
						color: { color: "#070707" },
						width: 2,
					});
				}, 1000);
			}
		}
	};
	useEffect(() => {
		console.log("Topology Data:", topologyData);
		if (!topologyData) return;
		// setDevices(extractDevices(topologyData));

		const nodes = new DataSet(topologyData.nodes || []);
		const edges = new DataSet(topologyData.links || []);
		edgesRef.current = edges;

		const data = { nodes, edges };
		const portDots = topologyData.dots || [];

		const options = {
			width: "100%",
			height: "600px",
			nodes: {
				size: 30,
				font: { color: "#2B1B17" },
			},
			edges: {
				length: 200,
				color: {
					color: "#070707",
					highlight: "#0066FF",
					hover: "#33CC33",
				},
				smooth: false,
			},
			physics: {
				barnesHut: { gravitationalConstant: -7025 },
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

		// Create DOM elements
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

				console.log(screen);
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

		// Handle node click
		network.on("click", function (params) {
			if (params.nodes.length > 0) {
				const nodeId = params.nodes[0];
				const clickedNode = nodes.get(nodeId);
				setSelectedNode(clickedNode);
			} else {
				setSelectedNode(null); // Clicked empty space
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

		// Cleanup on unmount
		return () => {
			const dots = document.querySelectorAll(".port-dot, .port-popup");
			dots.forEach((el) => el.remove());
		};
	}, [buildGraph, findNodeByMac, topologyData]);

	// const highlightEdge = (src, dst) => {
	// 	const edges = edgesRef.current;
	// 	if (!edges) return;

	// 	// Try matching both directions
	// 	const edgeId1 = `${src}-${dst}`;
	// 	const edgeId2 = `${dst}-${src}`;
	// 	const edge = edges.get(edgeId1) || edges.get(edgeId2);
	// 	const edgeId = edge?.id;

	// 	if (!edgeId) {
	// 		console.warn(`No edge found between ${src} and ${dst}`);
	// 		return;
	// 	}

	// 	// Highlight
	// 	edges.update({ id: edgeId, color: { color: "red" }, width: 4 });

	// 	// Revert after 1s
	// 	setTimeout(() => {
	// 		edges.update({
	// 			id: edgeId,
	// 			color: { color: "#070707" },
	// 			width: 2,
	// 		});
	// 	}, 1000);
	// };

	return (
		<div className="topology-container" style={{ display: "flex" }}>
			{/* Left side: Graph and Button */}
			<div>
				<div style={{ marginBottom: "10px" }}>
					<button
						onClick={onReload}
						style={{
							padding: "10px 20px",
							backgroundColor: "#459BDE",
							color: "#fff",
							border: "none",
							borderRadius: "5px",
							cursor: "pointer",
						}}
					>
						Reload Topology
					</button>
				</div>
				<div
					ref={containerRef}
					style={{
						width: "800px",
						height: "600px",
						border: "1px solid #ccc",
						position: "relative",
					}}
				/>
			</div>

			{/* Right side: Node Details Panel */}
			<div
				style={{
					marginLeft: "20px",
					width: "300px",
					padding: "10px",
					border: "1px solid #ccc",
				}}
			>
				<h3>Node Details</h3>
				{selectedNode ? (
					<div>
						<p>
							<strong>ID:</strong> {selectedNode.id}
						</p>
						<div
							dangerouslySetInnerHTML={{
								__html: selectedNode.title,
							}}
						/>
					</div>
				) : (
					<p>Click on a node to see details.</p>
				)}
			</div>
		</div>
	);
};

export default TopologySimple;
