import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { mapNodeDetails } from "../../mappers/node-details-mapper";
import { formatDate, formatSpeed } from "../../utils/helper";
import FlowForm from "../../Components/Nodes/FlowForm";
import { useNodeDetail } from "../../pipeline/DataPipelineContext";

const POLL_INTERVAL = 5_000;

const NodeConnector = () => {
	const { nodeId } = useParams();
	const { data: raw, loading, error, fetch: fetchDetail } = useNodeDetail(nodeId);

	useEffect(() => {
		let cancelled = false;
		const tick = () => { if (!cancelled) fetchDetail(true); };
		tick();
		const id = setInterval(tick, POLL_INTERVAL);
		return () => { cancelled = true; clearInterval(id); };
	}, [nodeId, fetchDetail]);

	const node = raw ? mapNodeDetails(raw) : null;

	if (loading) return <div className="p-8 text-center">Loading...</div>;
	if (error) return <div className="p-8 text-center text-red-600">Error: {error}</div>;
	return <NodeDetails node={node} />;
};

export default NodeConnector;

const NodeDetails = ({ node }) => {
	const [expandedFlows, setExpandedFlows] = useState({});
	// Sorting state for active flows
	const [activeSort, setActiveSort] = useState({
		column: "priority",
		asc: true,
	});

	const [formOpen, setFormOpen] = useState(false);
	// Sorting state for inactive tables
	const [inactiveSort, setInactiveSort] = useState({
		column: "id",
		asc: true,
	});
	const [inactiveRowsToShow, setInactiveRowsToShow] = useState(5);

	if (!node)
		return (
			<div className="text-center p-8 text-lg">
				No node data available
			</div>
		);

	const handleFormSubmit = async (data) => {
		const flowBody = {
			"flow-node-inventory:flow": [
				{
					id: data.flowId,
					"flow-name": data.flowName,
					table_id: data.tableId,
					priority: data.priority,
					match: {
						"ipv4-source": data.ipv4Source,
						"ipv4-destination": data.ipv4Destination,
						"in-port": data.inPort,
						"ethernet-match": {
							"ethernet-type": {
								type: data.ethType,
							},
						},
					},
					instructions: {
						instruction: [
							{
								order: 0,
								"apply-actions": {
									action: [
										{
											order: 0,
											"output-action": {
												"output-node-connector": `${data.outPort}`,
											},
										},
									],
								},
							},
						],
					},
				},
			],
		};

		const endpoint = `/api/rests/data/opendaylight-inventory:nodes/node=${data.nodeId}/flow-node-inventory:table=${data.tableId}/flow=${data.flowId}`;

		try {
			const response = await fetch(endpoint, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Basic " + btoa("admin:admin"), // Change for production
				},
				body: JSON.stringify(flowBody),
			});

			if (response.ok) {
				alert("Flow created successfully");
			} else {
				const errorText = await response.text();
				console.error(errorText);
				alert("Failed to create flow");
			}
		} catch (err) {
			console.error(err);
			alert("Error sending request");
		}
	};

	const activeTables = node.flowTables.filter((t) => t.stats.activeFlows > 0);
	const inactiveTables = node.flowTables.filter(
		(t) => t.stats.activeFlows === 0
	);

	const toggleFlow = (flowId) => {
		setExpandedFlows((prev) => ({ ...prev, [flowId]: !prev[flowId] }));
	};

	const sortFlows = (flows) => {
		const { column, asc } = activeSort;
		return [...flows].sort((a, b) => {
			if (column === "priority")
				return asc ? a.priority - b.priority : b.priority - a.priority;
			if (column === "id") return asc ? a.id - b.id : b.id - a.id;
			if (column === "packets")
				return asc
					? a.stats.packets - b.stats.packets
					: b.stats.packets - a.stats.packets;
			if (column === "duration")
				return asc
					? a.stats.duration - b.stats.duration
					: b.stats.duration - a.stats.duration;
			return 0;
		});
	};

	const sortInactiveTables = (tables) => {
		const { column, asc } = inactiveSort;
		return [...tables].sort((a, b) => {
			if (column === "id") return asc ? a.id - b.id : b.id - a.id;
			if (column === "activeFlows")
				return asc
					? a.stats.activeFlows - b.stats.activeFlows
					: b.stats.activeFlows - a.stats.activeFlows;
			if (column === "packetsMatched")
				return asc
					? a.stats.packetsMatched - b.stats.packetsMatched
					: b.stats.packetsMatched - a.stats.packetsMatched;
			if (column === "packetsLookedUp")
				return asc
					? a.stats.packetsLookedUp - b.stats.packetsLookedUp
					: b.stats.packetsLookedUp - a.stats.packetsLookedUp;
			return 0;
		});
	};

	const sortIndicator = (current, column, asc) => {
		return current === column ? (asc ? " ▲" : " ▼") : "";
	};

	return (
		<div className="py-8 pr-12 pl-12 space-y-12 bg-gray-50 min-h-screen text-gray-800">
			{formOpen && (
				<FlowForm
					onSubmit={handleFormSubmit}
					onClose={() => setFormOpen(false)}
					initialData={{
						nodeId: node.id,
						tableId: 0,
					}}
					connectors={node.connectors}
				/>
			)}
			{/* Node Overview Dashboard */}
			<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
				<div className="bg-white p-6 rounded-2xl border border-gray-700 shadow-sm">
					<h3 className="text-base text-gray-500 mb-1">Node ID</h3>
					<p className="text-xl font-bold break-all">{node.id}</p>
				</div>
				<div className="bg-white p-6 rounded-2xl border border-gray-700 shadow-sm">
					<h3 className="text-base text-gray-500 mb-1">IP Address</h3>
					<p className="text-xl font-bold break-all">
						{node.metadata.ip}
					</p>
				</div>
				<div className="bg-white p-6 rounded-2xl border border-gray-700 shadow-sm">
					<h3 className="text-base text-gray-500 mb-1">Connectors</h3>
					<p className="text-xl font-bold">
						{node.connectors.length}
					</p>
				</div>
				<div className="bg-white p-6 rounded-2xl border border-gray-700 shadow-sm">
					<h3 className="text-base text-gray-500 mb-1">
						Flow Tables
					</h3>
					<p className="text-xl font-bold">
						{node.flowTables.length}
					</p>
				</div>
			</div>

			{/* Metadata Section */}
			<section>
				<div className="bg-white border border-gray-700 rounded-xl shadow-sm p-6">
					<h2 className="text-2xl font-semibold mb-4">
						Node Metadata
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4 text-base mb-6">
						{Object.entries(node.metadata).map(([key, value]) => (
							<div key={key} className="flex items-center">
								<strong className="capitalize mr-2">
									{key.replace(/-/g, " ")}:
								</strong>
								<span>{value}</span>
							</div>
						))}
					</div>
					<div className="border-t pt-4 mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 text-base">
						<div>
							<h3 className="text-lg font-semibold mb-2">
								Group Capabilities
							</h3>
							<ul className="list-disc pl-6">
								{node.groupFeatures.capabilities.map(
									(cap, i) => (
										<li key={i}>
											{cap.replace(
												"opendaylight-group-types:",
												""
											)}
										</li>
									)
								)}
							</ul>
						</div>
						<div>
							<h3 className="text-lg font-semibold mb-2">
								Snapshot Info
							</h3>
							<div className="space-y-1">
								<p>
									<strong>Start:</strong>{" "}
									{formatDate(node.snapshot.start)}
								</p>
								<p>
									<strong>End:</strong>{" "}
									{formatDate(node.snapshot.end)}
								</p>
								<p>
									<strong>Status:</strong>{" "}
									{node.snapshot.succeeded
										? "✅ Success"
										: "❌ Failed"}
								</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Connector Table */}
			<section>
				<div className="bg-white border border-gray-700 rounded-xl shadow-sm p-6">
					<h2 className="text-2xl font-semibold mb-4">Connectors</h2>
					<div className="overflow-x-auto">
						<table className="min-w-full border border-gray-700 text-base">
							<thead className="bg-gray-200">
								<tr>
									<th className="border border-gray-700 px-4 py-2">
										Name
									</th>
									<th className="border border-gray-700 px-4 py-2">
										MAC
									</th>
									<th className="border border-gray-700 px-4 py-2">
										Speed
									</th>
									<th className="border border-gray-700 px-4 py-2">
										Packets (Rx/Tx)
									</th>
									<th className="border border-gray-700 px-4 py-2">
										Status
									</th>
								</tr>
							</thead>
							<tbody>
								{node.connectors.map((c) => (
									<tr key={c.id} className="hover:bg-gray-50">
										<td className="border border-gray-700 px-4 py-2">
											{c.name}
										</td>
										<td className="border border-gray-700 px-4 py-2">
											{c.mac}
										</td>
										<td className="border border-gray-700 px-4 py-2">
											{formatSpeed(c.currentSpeedMbps)}
										</td>
										<td className="border border-gray-700 px-4 py-2">
											<span className="text-green-700">
												{c.packetStats.rx}↓
											</span>{" "}
											/{" "}
											<span className="text-red-700">
												{c.packetStats.tx}↑
											</span>
										</td>
										<td className="border border-gray-700 px-4 py-2">
											{c.state.live ? (
												<span className="text-green-600 font-medium">
													Live
												</span>
											) : c.state.linkDown ? (
												<span className="text-red-600 font-medium">
													Down
												</span>
											) : (
												<span className="text-gray-600">
													Unknown
												</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			{/* Flow Tables */}
			<section>
				{activeTables.map((table) => (
					<div
						key={table.id}
						className="border border-gray-700 rounded-xl p-6 mb-8 bg-white shadow-sm"
					>
						<div className="flex justify-between items-center mb-4">
							<h2 className="text-2xl font-semibold ">
								Active Flow Tables
							</h2>
							<button
								className="px-4 py-2 bg-blue-600 text-gray-50 rounded"
								onClick={() => setFormOpen(true)}
							>
								+ Add FLow
							</button>
						</div>
						<div className="flex flex-col md:flex-row md:justify-between mb-2 gap-2">
							<h3 className="font-semibold text-lg">
								Table ID: {table.id}
							</h3>
							<p className="text-base text-gray-600">
								Active Flows: {table.stats.activeFlows} •
								Matched: {table.stats.packetsMatched} • Looked
								Up: {table.stats.packetsLookedUp}
							</p>
						</div>
						<table className="mt-2 w-full border border-gray-700 text-base">
							<thead className="bg-gray-100">
								<tr>
									<th
										className="border border-gray-700 px-4 py-2 cursor-pointer select-none"
										onClick={() =>
											setActiveSort((s) => ({
												column: "id",
												asc:
													s.column === "id"
														? !s.asc
														: true,
											}))
										}
									>
										Flow ID
										{sortIndicator(
											activeSort.column,
											"id",
											activeSort.asc
										)}
									</th>
									<th
										className="border border-gray-700 px-4 py-2 cursor-pointer select-none"
										onClick={() =>
											setActiveSort((s) => ({
												column: "priority",
												asc:
													s.column === "priority"
														? !s.asc
														: true,
											}))
										}
									>
										Priority
										{sortIndicator(
											activeSort.column,
											"priority",
											activeSort.asc
										)}
									</th>
									<th
										className="border border-gray-700 px-4 py-2 cursor-pointer select-none"
										onClick={() =>
											setActiveSort((s) => ({
												column: "packets",
												asc:
													s.column === "packets"
														? !s.asc
														: true,
											}))
										}
									>
										Packets
										{sortIndicator(
											activeSort.column,
											"packets",
											activeSort.asc
										)}
									</th>
									<th
										className="border border-gray-700 px-4 py-2 cursor-pointer select-none"
										onClick={() =>
											setActiveSort((s) => ({
												column: "duration",
												asc:
													s.column === "duration"
														? !s.asc
														: true,
											}))
										}
									>
										Duration
										{sortIndicator(
											activeSort.column,
											"duration",
											activeSort.asc
										)}
									</th>
								</tr>
							</thead>
							<tbody>
								{sortFlows(table.flows).map((flow) => (
									<React.Fragment key={flow.id}>
										<tr
											className="cursor-pointer hover:bg-gray-100"
											onClick={() => toggleFlow(flow.id)}
										>
											<td className="border border-gray-700 px-4 py-2">
												{flow.id}
											</td>
											<td className="border border-gray-700 px-4 py-2">
												{flow.priority}
											</td>
											<td className="border border-gray-700 px-4 py-2">
												{flow.stats.packets}
											</td>
											<td className="border border-gray-700 px-4 py-2">
												{flow.stats.duration}
											</td>
										</tr>
										{expandedFlows[flow.id] && (
											<tr>
												<td
													colSpan="4"
													className="border border-gray-700 p-4 bg-gray-50"
												>
													<pre className="whitespace-pre-wrap text-base text-gray-700">
														{JSON.stringify(
															flow,
															null,
															2
														)}
													</pre>
												</td>
											</tr>
										)}
									</React.Fragment>
								))}
							</tbody>
						</table>
					</div>
				))}

				{inactiveTables.length > 0 && (
					<div className="bg-white border border-gray-700 rounded-xl shadow-sm p-6">
						<h2 className="text-2xl font-semibold mb-4">
							Unused Flow Tables
						</h2>
						<table className="w-full border border-gray-700 text-base">
							<thead className="bg-gray-100">
								<tr>
									<th
										className="border border-gray-700 px-4 py-2 cursor-pointer select-none"
										onClick={() =>
											setInactiveSort((s) => ({
												column: "id",
												asc:
													s.column === "id"
														? !s.asc
														: true,
											}))
										}
									>
										Table ID
										{sortIndicator(
											inactiveSort.column,
											"id",
											inactiveSort.asc
										)}
									</th>
									<th
										className="border border-gray-700 px-4 py-2 cursor-pointer select-none"
										onClick={() =>
											setInactiveSort((s) => ({
												column: "activeFlows",
												asc:
													s.column === "activeFlows"
														? !s.asc
														: true,
											}))
										}
									>
										Active Flows
										{sortIndicator(
											inactiveSort.column,
											"activeFlows",
											inactiveSort.asc
										)}
									</th>
									<th
										className="border border-gray-700 px-4 py-2 cursor-pointer select-none"
										onClick={() =>
											setInactiveSort((s) => ({
												column: "packetsMatched",
												asc:
													s.column ===
													"packetsMatched"
														? !s.asc
														: true,
											}))
										}
									>
										Packets Matched
										{sortIndicator(
											inactiveSort.column,
											"packetsMatched",
											inactiveSort.asc
										)}
									</th>
									<th
										className="border border-gray-700 px-4 py-2 cursor-pointer select-none"
										onClick={() =>
											setInactiveSort((s) => ({
												column: "packetsLookedUp",
												asc:
													s.column ===
													"packetsLookedUp"
														? !s.asc
														: true,
											}))
										}
									>
										Packets Looked Up
										{sortIndicator(
											inactiveSort.column,
											"packetsLookedUp",
											inactiveSort.asc
										)}
									</th>
								</tr>
							</thead>
							<tbody>
								{sortInactiveTables(inactiveTables)
									.slice(0, inactiveRowsToShow)
									.map((table) => (
										<tr key={table.id}>
											<td className="border border-gray-700 px-4 py-2">
												{table.id}
											</td>
											<td className="border border-gray-700 px-4 py-2">
												{table.stats.activeFlows}
											</td>
											<td className="border border-gray-700 px-4 py-2">
												{table.stats.packetsMatched}
											</td>
											<td className="border border-gray-700 px-4 py-2">
												{table.stats.packetsLookedUp}
											</td>
										</tr>
									))}
							</tbody>
						</table>
						{inactiveRowsToShow < inactiveTables.length && (
							<div className="flex justify-center mt-4 gap-2">
								{inactiveRowsToShow > 5 && (
									<button
										className="px-6 py-2 border border-gray-700 text-blue-700 rounded hover:bg-blue-700 hover:text-white transition"
										onClick={() =>
											setInactiveRowsToShow(
												inactiveRowsToShow - 10
											)
										}
									>
										Show Less
									</button>
								)}
								<button
									className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
									onClick={() =>
										setInactiveRowsToShow(
											inactiveRowsToShow + 10
										)
									}
								>
									Show More
								</button>
							</div>
						)}
					</div>
				)}
			</section>
		</div>
	);
};
