import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

beforeEach(() => {
	process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "bankai-test-"));
});

afterEach(() => {
	if (process.env.DATA_DIR) {
		rmSync(process.env.DATA_DIR, { recursive: true, force: true });
		delete process.env.DATA_DIR;
	}
});
