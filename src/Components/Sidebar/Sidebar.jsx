import { Link, useLocation } from "react-router-dom";
// import "./Sidebar.css"; // Optional: Add your own styles

const links = [
	{ title: "Nodes", link: "/nodes" },
	{ title: "Topology", link: "/topology" },
	{ title: "Flows", link: "/flows" },
	{ title: "Flow Manager", link: "/flow-manager" },
	{ title: "Anomaly Detector", link: "/anomaly" },
	{ title: "Api-Tester", link: "/api-tester" },
	{ title: "Modules", link: "/modules" },
	{ title: "Yangman", link: "/yangui" },
	{ title: "Cloud", link: "/cloud" },
	{ title: "Network Slicing", link: "/network-slicing" },
];

const Sidebar = () => {
	const location = useLocation();
	return (
		<div className="fixed left-0 top-20 text-lg bg-gray-100 min-w-72 h-full">
			<nav className="py-1">
				<ul className="list-none px-2 flex flex-col gap-2">
					{links.map((link, idx) => {
						return (
							<Link
								to={link.link}
								key={idx}
								className={`${
									location.pathname === link.link &&
									"bg-blue-400 text-white"
								} px-4 py-2 rounded`}
							>
									{link.title}
							</Link>
						);
					})}
				</ul>
				{/* <li>
						<Link to="/nodes">Nodes</Link>
					</li>
					<li>
						<Link to="/topology">Topology</Link>
					</li>
					<li>
						<Link to="/api">ApiTester</Link>
					</li>
					<li>
						<Link to="/yangman">Modules</Link>
					</li>

					<li>
						<Link to="/yangui">Yangman</Link>
					</li> */}
			</nav>
		</div>
	);
};

export default Sidebar;
