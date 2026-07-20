// components/FlowForm.jsx
"use client";

import React, { useState } from "react";
import Input from "../common/Input";

const protocolTypes = [
	{ name: "ARP", value: 2054 },
	{ name: "IPv4", value: 2048 },
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
		<div className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm flex justify-center items-center z-50 w-screen h-screen px-4 animate-in fade-in duration-200">
			<div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl max-w-md w-full relative animate-in zoom-in-95 duration-200">
				
				<header className="mb-6 flex justify-between items-center">
					<h2 className="text-zinc-50 font-bold text-lg">
						Inject Flow Rule
					</h2>
					<button
						onClick={onClose}
						className="text-zinc-400 hover:text-zinc-100 w-8 h-8 rounded-full hover:bg-zinc-800 flex items-center justify-center transition-colors text-sm focus:outline-none"
					>
						✕
					</button>
				</header>

				<form onSubmit={handleSubmit} className="space-y-4">
					
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Node ID</label>
							<input
								name="nodeId"
								value={form.nodeId}
								className="w-full px-3 py-2 bg-zinc-950 border border-zinc-850 rounded-lg text-sm text-zinc-500 opacity-60 cursor-not-allowed outline-none"
								disabled={true}
							/>
						</div>
						<div>
							<label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Table ID</label>
							<input
								name="tableId"
								type="number"
								value={form.tableId}
								onChange={handleChange}
								className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition"
							/>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Flow ID</label>
							<input
								name="flowId"
								value={form.flowId}
								onChange={handleChange}
								className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition"
							/>
						</div>
						<div>
							<label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Priority</label>
							<input
								name="priority"
								type="number"
								value={form.priority}
								onChange={handleChange}
								className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition"
							/>
						</div>
					</div>

					<div>
						<label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Flow Name</label>
						<input
							name="flowName"
							value={form.flowName}
							onChange={handleChange}
							className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition"
						/>
					</div>

					<div className="grid grid-cols-3 gap-3">
						<div>
							<label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Protocol</label>
							<select
								name="ethType"
								value={form.ethType}
								onChange={handleChange}
								className="w-full px-2 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-400 transition"
							>
								<option value="" disabled selected>Select</option>
								{protocolTypes.map((p) => (
									<option key={p.name} value={p.value}>{p.name}</option>
								))}
							</select>
						</div>

						<div>
							<label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">In Port</label>
							<select
								name="inPort"
								value={form.inPort}
								onChange={handleChange}
								className="w-full px-2 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-400 transition"
							>
								<option value="" disabled selected>Select</option>
								{connectors.map((c) => (
									<option key={c.id} value={c.portNumber}>{c.name}</option>
								))}
							</select>
						</div>

						<div>
							<label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Out Port</label>
							<select
								name="outPort"
								value={form.outPort}
								onChange={handleChange}
								className="w-full px-2 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-zinc-400 transition"
							>
								<option value="" disabled selected>Select</option>
								{connectors.map((c) => (
									<option key={c.id} value={c.portNumber}>{c.name}</option>
								))}
								<option value="FLOOD">Flood</option>
							</select>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">IPv4 Source</label>
							<input
								name="ipv4Source"
								value={form.ipv4Source}
								onChange={handleChange}
								className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition"
							/>
						</div>
						<div>
							<label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">IPv4 Dest</label>
							<input
								name="ipv4Destination"
								value={form.ipv4Destination}
								onChange={handleChange}
								className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition"
							/>
						</div>
					</div>

					<button
						type="submit"
						className="w-full mt-6 py-2.5 bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-semibold rounded-lg text-sm transition duration-200 focus:outline-none"
					>
						Inject Flow Rule
					</button>

				</form>
			</div>
		</div>
	);
};

export default FlowForm;
