import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

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
	},
});
