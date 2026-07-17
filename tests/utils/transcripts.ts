import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertDefined } from "./assertions";

export function transcriptLine(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

export async function claudeTranscript(sessionId: string): Promise<string> {
	assertDefined(process.env.DATA_DIR);
	process.env.CLAUDE_CONFIG_DIR = join(process.env.DATA_DIR, "claude");
	const directory = join(process.env.CLAUDE_CONFIG_DIR, "projects", "project");
	await mkdir(directory, { recursive: true });
	const path = join(directory, `${sessionId}.jsonl`);
	await writeFile(path, "");
	return path;
}

export async function codexTranscript(sessionId: string): Promise<string> {
	assertDefined(process.env.DATA_DIR);
	process.env.CODEX_HOME = join(process.env.DATA_DIR, "codex");
	const directory = join(process.env.CODEX_HOME, "sessions", "2026", "07", "12");
	await mkdir(directory, { recursive: true });
	const path = join(directory, `${sessionId}.jsonl`);
	await writeFile(path, transcriptLine({
		type: "session_meta",
		payload: { id: sessionId },
	}));
	return path;
}
