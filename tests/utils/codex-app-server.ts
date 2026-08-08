import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function installCodexAppServer() {
	const bin = mkdtempSync(join(tmpdir(), "bankai-codex-app-server-"));
	const previousPath = process.env.PATH;
	process.env.PATH = `${bin}:${previousPath}`;
	const executable = join(bin, "codex");
	writeFileSync(
		executable,
		'#!/bin/sh\nIFS= read -r initialize\nIFS= read -r initialized\nIFS= read -r request\necho "$BANKAI_TEST_CODEX_RESPONSE"\nIFS= read -r closed\nexit 0\n',
	);
	chmodSync(executable, 0o755);

	return {
		respond(response: unknown): void {
			process.env.BANKAI_TEST_CODEX_RESPONSE = JSON.stringify(response);
		},
		close(): void {
			rmSync(bin, { recursive: true, force: true });
			if (previousPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = previousPath;
			}
			delete process.env.BANKAI_TEST_CODEX_RESPONSE;
		},
	};
}

export const CodexAppServerTest = {
	install: installCodexAppServer,
};
