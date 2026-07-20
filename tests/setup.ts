import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

const originalClaudeConfig = process.env.CLAUDE_CONFIG_DIR;
const originalCodexHome = process.env.CODEX_HOME;
const originalPiAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalPiSessionDir = process.env.PI_CODING_AGENT_SESSION_DIR;
const originalPiDiscoveryDir = process.env.BANKAI_PI_DISCOVERY_DIR;
const originalPiCompanion = process.env.BANKAI_PI_COMPANION;

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
	if (originalPiAgentDir === undefined) {
		delete process.env.PI_CODING_AGENT_DIR;
	} else {
		process.env.PI_CODING_AGENT_DIR = originalPiAgentDir;
	}
	if (originalPiSessionDir === undefined) {
		delete process.env.PI_CODING_AGENT_SESSION_DIR;
	} else {
		process.env.PI_CODING_AGENT_SESSION_DIR = originalPiSessionDir;
	}
	if (originalPiDiscoveryDir === undefined) {
		delete process.env.BANKAI_PI_DISCOVERY_DIR;
	} else {
		process.env.BANKAI_PI_DISCOVERY_DIR = originalPiDiscoveryDir;
	}
	if (originalPiCompanion === undefined) {
		delete process.env.BANKAI_PI_COMPANION;
	} else {
		process.env.BANKAI_PI_COMPANION = originalPiCompanion;
	}
});
