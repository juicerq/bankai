import { open } from "node:fs/promises";
import { type } from "arktype";
import type { HarnessTrace } from "@main/activity/Harness";
import { transcriptPath } from "@main/activity/claudeTranscript";
import { Logger } from "@main/logger";

const TRACE_TAIL_BYTES = 64 * 1024;

const TOOL_TRACE: Record<string, string> = {
	bash: "Running commands",
	read: "Exploring",
	grep: "Exploring",
	glob: "Exploring",
	find: "Exploring",
	ls: "Exploring",
	toolsearch: "Exploring",
	edit: "Editing files",
	multiedit: "Editing files",
	write: "Editing files",
	notebookedit: "Editing files",
	agent: "Delegating",
	subagent: "Delegating",
	task: "Delegating",
	workflow: "Delegating",
	webfetch: "Searching the web",
	websearch: "Searching the web",
	skill: "Loading a skill",
};

const BLOCK_TRACE: Record<string, string> = {
	thinking: "Thinking",
	redacted_thinking: "Thinking",
	text: "Writing",
};

const THINKING_TRACE = "Thinking";

const traceRecordSchema = type({ type: "'assistant'", "uuid?": "string", message: { content: "unknown[]" } });

const turnedRecordSchema = type({ type: "'user'", "uuid?": "string" });

const traceBlockSchema = type({ type: "string", "name?": "string" });

function toolTrace(name: string): string {
	const bare = name.split("__").at(-1) ?? name;

	return TOOL_TRACE[bare.toLowerCase()] ?? bare;
}

function blockTrace(block: { type: string; name?: string }): string | null {
	if (block.type !== "tool_use") {
		return BLOCK_TRACE[block.type] ?? null;
	}

	if (!block.name) {
		return null;
	}

	return toolTrace(block.name);
}

export function recordTrace(raw: string): HarnessTrace | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}

	const turned = turnedRecordSchema(value);
	if (!(turned instanceof type.errors)) {
		return { label: THINKING_TRACE, recordId: turned.uuid ?? THINKING_TRACE };
	}

	const record = traceRecordSchema(value);
	if (record instanceof type.errors) {
		return null;
	}

	for (const entry of [...record.message.content].reverse()) {
		const block = traceBlockSchema(entry);
		if (block instanceof type.errors) {
			continue;
		}

		const label = blockTrace(block);
		if (label) {
			return { label, recordId: record.uuid ?? label };
		}
	}

	return null;
}

async function readTail(path: string): Promise<string> {
	const handle = await open(path, "r");

	try {
		const { size } = await handle.stat();
		const length = Math.min(size, TRACE_TAIL_BYTES);
		const { buffer, bytesRead } = await handle.read({
			buffer: Buffer.alloc(length),
			position: size - length,
		});

		return buffer.toString("utf8", 0, bytesRead);
	} finally {
		await handle.close();
	}
}

function missingFile(err: unknown): boolean {
	return err instanceof Error && "code" in err && err.code === "ENOENT";
}

export async function transcriptTrace(ref: { sessionId: string; cwd: string }): Promise<HarnessTrace | null> {
	const path = transcriptPath(ref);
	const tail = await readTail(path).catch((err: unknown) => {
		if (!missingFile(err)) {
			Logger.warn("claude:trace-unreadable", { path, err: String(err) });
		}

		return null;
	});
	if (tail === null) {
		return null;
	}

	for (const line of tail.split("\n").reverse()) {
		const trace = recordTrace(line);
		if (trace) {
			return trace;
		}
	}

	return null;
}
