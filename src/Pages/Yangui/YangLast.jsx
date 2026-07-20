import React, { useState, useEffect } from "react";
import axios from "axios";
import ReactJson from "react-json-view";
import "./yang.css";

const Yangman = () => {
	const [url, setUrl] = useState("");
	const [method, setMethod] = useState("GET");
	const [headers, setHeaders] = useState({ Accept: "application/json" });
	const [body, setBody] = useState("{}");
	const [response, setResponse] = useState(null);
	const [modules, setModules] = useState([]);

	const ODL_IP = "/api/rests/data"; // Change this based on your ODL instance
	const AUTH = "Basic " + btoa("admin:admin"); // Encode credentials

	// Fetch YANG models on mount
	useEffect(() => {
		axios
			.get(`${ODL_IP}/ietf-yang-library:yang-library`, {
				headers: { Authorization: AUTH, Accept: "application/json" },
			})

			.then((res) =>
				setModules(
					res.data["ietf-yang-library:yang-library"]["module-set"][0]
						.module
				)
			)
			.catch((err) => console.error("Error fetching modules:", err));
	}, []);

	// Handle RESTCONF API request
	const sendRequest = async () => {
		try {
			const config = {
				method,
				url: `${ODL_IP}${url}`,
				headers: { ...headers, Authorization: AUTH },
				data: method !== "GET" ? JSON.parse(body) : undefined,
			};
			console.log(config);
			const res = await axios(config);
			setResponse(res.data);
		} catch (error) {
			setResponse({
				error: error.response ? error.response.data : error.message,
			});
		}
	};

	return (
		<div className="sec_outer">
			<div className="p-6 max-w-3xl mx-auto bg-white rounded-lg shadow-md  sec_outer">
				{/* YANG Module Selection */}
				<label className="block mb-2">Select YANG Module:</label>
				<select
					className="w-full p-2 border rounded mb-4"
					onChange={async (e) => {
						const [module, revision] = e.target.value.split(":");
						const root = await fetchAndParseYangModule(
							module,
							revision
						);
						console.log(root);
						console.log("Paths", collectRestconfPaths(root));
						setUrl(`/restconf/data/${module}:`);
					}}
				>
					<option value="">-- Select Module --</option>
					{modules.map((mod) => (
						<option
							key={`${mod.name}:${mod.revision}`}
							value={`${mod.name}:${mod.revision}`}
						>
							{mod.name} - {mod.revision}
						</option>
					))}
				</select>

				{/* URL Input */}
				<input
					type="text"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					className="w-full p-2 border rounded mb-4"
					placeholder="Enter RESTCONF URL (e.g., /restconf/data/example-module:example)"
				/>

				{/* Method Selection */}
				<select
					value={method}
					onChange={(e) => setMethod(e.target.value)}
					className="w-full p-2 border rounded mb-4"
				>
					<option value="GET">GET</option>
					<option value="POST">POST</option>
					<option value="PUT">PUT</option>
					<option value="DELETE">DELETE</option>
				</select>

				{/* Body Input (only for POST/PUT) */}
				{(method === "POST" || method === "PUT") && (
					<textarea
						value={body}
						onChange={(e) => setBody(e.target.value)}
						className="w-full p-2 border rounded mb-4"
						placeholder='Enter JSON Body (e.g., { "example": "value" })'
					/>
				)}

				{/* Send Button */}
				<button
					onClick={sendRequest}
					className="w-full bg-blue-500 text-white p-2 rounded"
				>
					Send Request
				</button>

				{/* Display JSON Response */}
				{response && (
					<div className="mt-4 p-4 border rounded bg-gray-100">
						<h3 className="font-bold">Response:</h3>
						<ReactJson src={response} />
					</div>
				)}
			</div>
		</div>
	);
};

export default Yangman;

// Minimal working example in vanilla JavaScript to parse YANG YIN XML schema
// and extract RESTCONF paths

// HTML structure:
// <input id="module" placeholder="Module name (e.g. ietf-interfaces)">
// <input id="revision" placeholder="Revision (e.g. 2014-05-08)">
// <button onclick="loadAndParse()">Load Module</button>
// <pre id="output"></pre>

// async function loadAndParse(module, revision) {
// 	const url = `http://localhost:8181/restconf/modules/module/${module}/${revision}/schema`;
// 	try {
// 		const res = await fetch(url, {
// 			headers: {
// 				Authorization: "Basic " + btoa("admin:admin"),
// 			},
// 		});
// 		const xmlText = await res.text();
// 		const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");

// 		const root = parseYangNode(xmlDoc.documentElement);
// 		const paths = buildPaths(root, `${module}`);

// 		console.log(paths);
// 		// document.getElementById("output").textContent = paths
// 		// 	.map((p) => `${p.type}: /restconf/data/${p.path}`)
// 		// 	.join("\n");
// 	} catch (err) {
// 		document.getElementById("output").textContent = `Error: ${err}`;
// 	}
// }

// function parseYangNode(xmlElement) {
// 	const name = xmlElement.getAttribute("name") || xmlElement.nodeName;
// 	const type = xmlElement.nodeName;

// 	const children = [];
// 	for (const child of xmlElement.children) {
// 		const validTags = ["container", "list", "leaf", "leaf-list", "rpc"];
// 		if (validTags.includes(child.nodeName)) {
// 			children.push(parseYangNode(child));
// 		}
// 	}
// 	return { name, type, children };
// }

// function buildPaths(node, prefix = "") {
// 	const validTypes = ["container", "list", "leaf-list"];
// 	const current = validTypes.includes(node.type)
// 		? `${prefix}/${node.name}`
// 		: prefix;

// 	let paths = [];
// 	if (validTypes.includes(node.type)) {
// 		paths.push({ path: current, type: node.type });
// 	}

// 	for (const child of node.children) {
// 		paths.push(...buildPaths(child, current));
// 	}

// 	return paths;
// }

// // To use, include this in a browser with access to the OpenDaylight RESTCONF API
// // and run the page on the same host/port (or use CORS proxy if needed).

// Fetches and parses YANG module info from backend schema endpoint
async function fetchAndParseYangModule(moduleName, revision) {
	const schemaUrl = `http://localhost:8181/restconf/modules/module/${moduleName}/${revision}/schema`;
	console.log(schemaUrl);
	const AUTH = "Basic " + btoa("admin:admin");
	const res = await axios.get(schemaUrl, {
		headers: { Authorization: AUTH },
	});
	const xmlText = await res.data;

	const parser = new DOMParser();
	const xmlDoc = parser.parseFromString(xmlText, "application/xml");

	if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
		throw new Error("Failed to parse YANG XML");
	}

	const moduleEl = xmlDoc.documentElement;
	const parsedModule = parseYangModule(moduleEl);
	console.log(parsedModule);
	console.log(parsedModule);
	return parsedModule;
}

// Recursively parses YANG XML DOM and builds node tree
function parseYangModule(moduleEl) {
	const moduleName = moduleEl.getAttribute("name");
	const revision =
		moduleEl.querySelector("revision")?.getAttribute("date") || "";
	const namespace =
		moduleEl.querySelector("namespace")?.getAttribute("uri") || "";

	const moduleNode = createNode(
		moduleName,
		"module",
		moduleName,
		namespace,
		null,
		revision
	);
	parseChildren(moduleEl, moduleNode);

	return moduleNode;
}

function parseChildren(xmlEl, parentNode) {
	for (const child of xmlEl.children) {
		const tag = child.tagName;
		const name = child.getAttribute("name");
		if (!name) continue;

		const type = tag;
		const keyAttr = child.querySelector("key")?.getAttribute("value");
		const newNode = createNode(
			name,
			type,
			parentNode.module,
			parentNode.namespace,
			parentNode,
			parentNode.moduleRevision
		);
		if (keyAttr) newNode.keyNames = keyAttr;

		parentNode.children.push(newNode);
		newNode.parent = parentNode;

		parseChildren(child, newNode);
	}
}

function createNode(label, type, module, namespace, parent, moduleRevision) {
	return {
		label,
		type,
		module,
		namespace,
		parent,
		moduleRevision,
		children: [],
	};
}

// Converts a parsed YANG node to a RESTCONF-style path
function generateRestconfPath(
	node,
	options = {
		includeIdentifiers: true,
		includeRestconfRoot: true,
		usePlaceholder: true,
	}
) {
	const pathParts = [];
	let current = node;
	let lastModule = null;

	while (current) {
		const { label, module, type, keyNames } = current;
		let part = "";

		const moduleChanged = module !== lastModule;
		if (moduleChanged && module) {
			part += `${module}:`;
		}

		part += label;

		if (options.includeIdentifiers && type === "list" && keyNames) {
			const keys = Array.isArray(keyNames)
				? keyNames
				: keyNames.split(" ");
			keys.forEach((k) => {
				const keyValue = options.usePlaceholder
					? `{${k}}`
					: current[k] || `{${k}}`;
				part += `/${keyValue}`;
			});
		}

		pathParts.unshift(part);
		lastModule = module;
		current = current.parent;
	}

	const restconfPrefix = options.includeRestconfRoot ? "/rests/data/" : "";
	return restconfPrefix + pathParts.join("/");
}

// Traverses the node tree and collects RESTCONF paths for nodes with identifiable paths
function collectRestconfPaths(node, filterFn = () => true, result = []) {
	if (filterFn(node)) {
		try {
			const path = generateRestconfPath(node);
			result.push({ label: node.label, path });
		} catch (e) {
			console.warn(`Failed to generate path for ${node.label}:`, e);
		}
	}

	for (const child of node.children) {
		collectRestconfPaths(child, filterFn, result);
	}

	return result;
}
