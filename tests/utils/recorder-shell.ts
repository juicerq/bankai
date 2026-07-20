import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function recorderShell(): { shell: string; recordFile: string } {
	const dir = mkdtempSync(join(tmpdir(), "bankai-shell-"));
	const shell = join(dir, "recorder.sh");
	const recordFile = join(dir, "invocation");
	writeFileSync(
		shell,
		[
			"#!/bin/sh",
			'if [ -n "$BANKAI_RECORD_FILE" ]; then printf \'%s\' "$2" > "$BANKAI_RECORD_FILE"; fi',
			"exec cat",
			"",
		].join("\n"),
	);
	chmodSync(shell, 0o755);
	return { shell, recordFile };
}
