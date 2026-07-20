// components/FlowForm.jsx
"use client";

import React, { useState } from "react";

const protocolTypes = [
	{
		name: "ARP",
		value: 2054,
	},
	{
		name: "IPv4",
		value: 2048,
	},

	// {
	// 	name: "TCP",
	// 	value: 2048,
	// },
	// {
	// 	name: "UDP",
	// 	value: 2048,
	// },
	// {
	// 	name: "ICMP",
	// 	value: 2048,
	// },
];
const FlowForm = ({ onSubmit, onClose, initialData, connectors }) => {
	const [form, setForm] = useState({
		...initialData,
		flowId: "flow-1",
		flowName: "Sample Flow",
		priority: 1000,
		ethType: undefined,
		inPort: undefined,
		outPort: undefined,
		ipv4Source: "0.0.0.0/0",
		ipv4Destination: "0.0.0.0/0",
	});

	const handleChange = (e) => {
		const { name, value } = e.target;
		setForm((prev) => ({
			...prev,
			[name]: ["priority", "tableId", "ethType"].includes(name)
				? Number(value)
				: value,
		}));
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		onSubmit(form);
		onClose();
	};

	return (
		<div className="fixed inset-0 bg-gray-600/50 flex justify-center items-center z-50 w-screen h-screen">
			<div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full min-w-96 relative">
				<header className="px-1 mb-6 flex justify-between items-center">
					<h2 className="text-gray-900 font-bold text-xl">
						Add/Update Flow
					</h2>
					<button
						onClick={onClose}
						className="text-gray-600 hover:text-black w-8 h-8 rounded-full hover:bg-gray-300 text-lg"
					>
						✕
					</button>
				</header>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="flex w-full justify-between">
						<label className="text-gray-900 text-lg">Node ID</label>
						<input
							name="nodeId"
							value={form.nodeId}
							// onChange={handleChange}
							className="border border-gray-600 rounded p-2 disabled:bg-gray-100"
							disabled={true}
						/>
					</div>
					<div className="flex w-full justify-between">
						<label className="text-gray-900 text-lg">
							Table ID
						</label>
						<input
							name="tableId"
							type="number"
							value={form.tableId}
							onChange={handleChange}
							className="border border-gray-600 rounded p-2"
						/>
					</div>
					<div className="flex w-full justify-between">
						<label className="text-gray-900 text-lg">Flow ID</label>
						<input
							name="flowId"
							value={form.flowId}
							onChange={handleChange}
							className="border border-gray-600 rounded p-2"
						/>
					</div>
					<div className="flex w-full justify-between">
						<label className="text-gray-900 text-lg">
							Flow Name
						</label>
						<input
							name="flowName"
							value={form.flowName}
							onChange={handleChange}
							className="border border-gray-600 rounded p-2"
						/>
					</div>
					<div className="flex w-full justify-between">
						<label className="text-gray-900 text-lg">
							Priority
						</label>
						<input
							name="priority"
							type="number"
							value={form.priority}
							onChange={handleChange}
							className="border border-gray-600 rounded p-2"
						/>
					</div>
					<div className="flex w-full justify-between">
						<label className="text-gray-900 text-lg">
							Protocol type
						</label>
						<select
							name="ethType"
							value={form.ethType}
							onChange={handleChange}
							className={`border border-gray-600 rounded p-2 ${
								form.ethType ? "text-gray-800" : "text-gray-500"
							}`}
						>
							<option selected disabled>
								Select a protocol type
							</option>
							{protocolTypes.map((protocol) => {
								return (
									<option
										key={protocol.name}
										value={protocol.value}
									>
										{protocol.name}
									</option>
								);
							})}
						</select>
					</div>
					<div className="flex w-full justify-between">
						<label className="text-gray-900 text-lg">In Port</label>
						<select
							name="inPort"
							value={form.inPort}
							onChange={handleChange}
							className={`border border-gray-600 rounded p-2 ${
								form.inPort ? "text-gray-800" : "text-gray-500"
							}`}
						>
							<option disabled={true} selected={true}>
								Select Incoming Port
							</option>
							{connectors.map((connector) => {
								return (
									<option
										key={connector.id}
										value={connector.portNumber}
									>
										{connector.name}
									</option>
								);
							})}
						</select>
						{/* <input
							name="inPort"
							value={form.inPort}
							type="number"
							onChange={handleChange}
							placeholder="Incoming port number"
							className="border border-gray-600 rounded p-2"
						/> */}
					</div>
					<div className="flex w-full justify-between">
						<label className="text-gray-900 text-lg">
							Out Port
						</label>
						<select
							name="outPort"
							value={form.outPort}
							onChange={handleChange}
							className={`border border-gray-600 rounded p-2 ${
								form.outPort ? "text-gray-800" : "text-gray-500"
							}`}
						>
							<option disabled={true} selected={true}>
								Select Outgoing Port
							</option>
							{connectors.map((connector) => {
								return (
									<option
										key={connector.id}
										value={connector.portNumber}
									>
										{connector.name}
									</option>
								);
							})}
							<option value={"FLOOD"}>Flood</option>
						</select>
						{/* <input
							name="outPort"
							type="number"
							value={form.outPort}
							onChange={handleChange}
							placeholder="Outgoing port number"
							className="border border-gray-600 rounded p-2"
						/> */}
					</div>
					<div className="flex w-full justify-between">
						<label className="text-gray-900 text-lg">
							IPv4 Source
						</label>
						<input
							name="ipv4Source"
							value={form.ipv4Source}
							onChange={handleChange}
							className="border border-gray-600 rounded p-2"
						/>
					</div>
					<div className="flex w-full justify-between">
						<label className="text-gray-900 text-lg">
							IPv4 Destination
						</label>
						<input
							name="ipv4Destination"
							value={form.ipv4Destination}
							onChange={handleChange}
							className="border border-gray-600 rounded p-2"
						/>
					</div>
					<button
						type="submit"
						className="px-4 py-2 bg-blue-600 text-white rounded"
					>
						Submit
					</button>
				</form>
			</div>
		</div>
	);
};

export default FlowForm;
