import { describe, expect, it } from "vitest";
import { interactiveCodexCommand } from "@core/harness/codex/command";

describe("interactiveCodexCommand", () => {
	it("accepts the interactive TUI with flags", () => {
		expect(interactiveCodexCommand(["/usr/bin/codex", "--model", "gpt-5"])).toBe(true);
	});

	it("rejects non-interactive subcommands", () => {
		for (const mode of ["exec", "review", "app-server", "cloud", "mcp-server", "completion"]) {
			expect(interactiveCodexCommand(["codex", mode])).toBe(false);
		}
	});

	it("rejects a different executable", () => {
		expect(interactiveCodexCommand(["node", "codex"])).toBe(false);
	});
});
