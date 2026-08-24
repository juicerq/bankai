import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "bun:test";
import { DAEMON_ENV_FLAG } from "@shared/daemon";
import "./utils/electron-mock";

beforeEach(() => {
	process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "bankai-test-"));
	delete process.env[DAEMON_ENV_FLAG];
});

afterEach(() => {
	if (process.env.DATA_DIR) {
		rmSync(process.env.DATA_DIR, { recursive: true, force: true });
		delete process.env.DATA_DIR;
	}
});
