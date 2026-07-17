import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

const originalClaudeConfig = process.env.CLAUDE_CONFIG_DIR;
const originalCodexHome = process.env.CODEX_HOME;

beforeEach(() => {
	process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "bankai-test-"));
});

afterEach(() => {
	if (process.env.DATA_DIR) {
		rmSync(process.env.DATA_DIR, { recursive: true, force: true });
		delete process.env.DATA_DIR;
	}

	if (originalClaudeConfig === undefined) {
		delete process.env.CLAUDE_CONFIG_DIR;
	} else {
		process.env.CLAUDE_CONFIG_DIR = originalClaudeConfig;
	}
	if (originalCodexHome === undefined) {
		delete process.env.CODEX_HOME;
	} else {
		process.env.CODEX_HOME = originalCodexHome;
	}
});
