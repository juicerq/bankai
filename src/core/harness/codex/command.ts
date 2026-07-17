import { basename } from "node:path";

const EXCLUDED = new Set([
	"exec",
	"review",
	"app-server",
	"cloud",
	"mcp-server",
	"completion",
]);

export function interactiveCodexCommand(argv: string[]): boolean {
	const executable = argv[0];
	return !!executable
		&& basename(executable) === "codex"
		&& !(argv[1] && EXCLUDED.has(argv[1]));
}
