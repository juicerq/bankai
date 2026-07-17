import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type } from "arktype";
import type { HarnessDiscovery, NativeSessionRecord } from "@core/harness/Harness";
import { accepted, parsedJson } from "@core/harness/external";

const sessionRecord = type({
	pid: "number",
	sessionId: "string",
	procStart: "string",
	"kind?": "string",
}).pipe(({ pid, sessionId, procStart, kind }): NativeSessionRecord =>
	kind === undefined || kind === "interactive"
		? { pid, sessionId, procStart, kind: "interactive" }
		: { pid, sessionId, procStart },
);

function parseSession(raw: string): NativeSessionRecord | null {
	const parsed = parsedJson(raw);
	return parsed.ok ? accepted(sessionRecord, parsed.value) : null;
}

export const ClaudeDiscovery: HarnessDiscovery = {
	async discover() {
		const config = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
		const directory = join(config, "sessions");
		const files = await readdir(directory).catch((): string[] => []);
		const records = await Promise.all(files
			.filter((file) => file.endsWith(".json"))
			.map((file) => readFile(join(directory, file), "utf8").catch(() => null)));

		return records.flatMap((raw) => {
			const record = raw === null ? null : parseSession(raw);
			return record ? [record] : [];
		});
	},
};
