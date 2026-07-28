import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { SERVER_DEFAULT_PORT } from "./src/shared/server";

const serverPort = process.env.SERVER_PORT ?? String(SERVER_DEFAULT_PORT);

const aliasNode = {
	"@main": resolve(import.meta.dirname, "./src/main"),
	"@preload": resolve(import.meta.dirname, "./src/preload"),
	"@shared": resolve(import.meta.dirname, "./src/shared"),
};

const aliasWeb = {
	"@renderer": resolve(import.meta.dirname, "./src/renderer/src"),
	"@main": resolve(import.meta.dirname, "./src/main"),
	"@shared": resolve(import.meta.dirname, "./src/shared"),
};

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		resolve: { alias: aliasNode },
		build: {
			rollupOptions: {
				input: {
					index: resolve(import.meta.dirname, "./src/main/index.ts"),
					"git-worker": resolve(import.meta.dirname, "./src/main/git/worker.ts"),
				},
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		resolve: { alias: aliasNode },
		build: {
			rollupOptions: {
				output: {
					format: "cjs",
					entryFileNames: "[name].cjs",
				},
			},
		},
	},
	renderer: {
		plugins: [
			tanstackRouter({ target: "react", autoCodeSplitting: true }),
			react(),
			tailwindcss(),
		],
		resolve: { alias: aliasWeb },
		worker: { format: "es" },
		server: {
			host: "127.0.0.1",
			port: 4697,
			strictPort: true,
			allowedHosts: [".ts.net"],
			proxy: {
				"/rpc": `http://127.0.0.1:${serverPort}`,
				"/stream": { target: `ws://127.0.0.1:${serverPort}`, ws: true },
			},
		},
	},
});
