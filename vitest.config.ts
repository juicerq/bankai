import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@core": resolve(import.meta.dirname, "./src/core"),
			"@ui": resolve(import.meta.dirname, "./src/ui"),
		},
	},
	test: {
		setupFiles: ["./tests/setup.ts"],
		exclude: ["**/node_modules/**", ".claude/**"],
	},
});
