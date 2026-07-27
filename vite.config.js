import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const odlTarget = env.VITE_ODL_HOST || "https://localhost:8443";

	return {
		plugins: [react(), tailwindcss()],
		server: {
			proxy: {
				"/api/rests": {
					target: odlTarget,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, ""),
					timeout: 5000,
					proxyTimeout: 5000,
				},
				// Legacy ODL (Carbon/Nitrogen/Oxygen) uses /restconf/operational/
				"/api/restconf": {
					target: odlTarget,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, ""),
					timeout: 5000,
					proxyTimeout: 5000,
				},
				// OpenStack Cloud backend (Node.js proxy on port 5000)
				"/api/openstack": {
					target: "http://127.0.0.1:5000",
					changeOrigin: true,
					timeout: 15000,
					proxyTimeout: 15000,
				},
			},
		},
	};
});
