import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@main": resolve(import.meta.dirname, "./src/main"),
			"@shared": resolve(import.meta.dirname, "./src/shared"),
		},
	},
	test: {
		setupFiles: ["./tests/setup.ts"],
	},
});
