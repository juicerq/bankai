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

const TOOL_SUBJECT: Record<string, { verb: string; keys: string[] }> = {
	bash: { verb: "", keys: ["description", "command"] },
	read: { verb: "Reading", keys: ["file_path", "path"] },
	edit: { verb: "Editing", keys: ["file_path", "path"] },
	multiedit: { verb: "Editing", keys: ["file_path", "path"] },
	write: { verb: "Editing", keys: ["file_path", "path"] },
	notebookedit: { verb: "Editing", keys: ["file_path", "path"] },
	ls: { verb: "Listing", keys: ["path"] },
	grep: { verb: "Grepping", keys: ["pattern"] },
	glob: { verb: "Looking for", keys: ["pattern"] },
	find: { verb: "Looking for", keys: ["pattern"] },
	websearch: { verb: "Searching the web for", keys: ["query"] },
	webfetch: { verb: "Fetching", keys: ["url"] },
	skill: { verb: "Loading", keys: ["skill"] },
	agent: { verb: "Delegating", keys: ["description"] },
	task: { verb: "Delegating", keys: ["description"] },
};

export const LABEL_CAP = 64;

const SHELL_OPERATOR = /\s*(?:\|\||&&|[|;]|\d*[<>])/;

const LEADING_CD = /^cd\s+\S+\s*&&\s*/;

const QUOTE = /["']/g;

const DANGLING_QUOTE = /["'][^"']*$/;

const SCHEME = /^\w+:\/\//;

const READABLE = /[\p{L}\p{N}]/u;

function baseName(value: string): string {
	return value.split("/").at(-1) ?? value;
}

function hostName(value: string): string {
	return value.replace(SCHEME, "").split("/")[0] ?? value;
}

function firstCommand(command: string): string {
	const cut = command.replace(LEADING_CD, "").split(SHELL_OPERATOR)[0] ?? command;
	const quotes = cut.match(QUOTE)?.length ?? 0;
	if (quotes % 2 === 0) {
		return cut;
	}

	return cut.slice(0, cut.search(DANGLING_QUOTE));
}

const SUBJECT_SHAPE: Record<string, (value: string) => string> = {
	file_path: baseName,
	path: baseName,
	url: hostName,
	command: firstCommand,
};

function readable(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const text = value.replace(/\s+/g, " ").trim();
	if (!READABLE.test(text)) {
		return undefined;
	}

	return text;
}

function capped(label: string): string {
	if (label.length <= LABEL_CAP) {
		return label;
	}

	return `${label.slice(0, LABEL_CAP).trimEnd()}…`;
}

function toolSubject(bare: string, input: Record<string, unknown>): string | undefined {
	const phrasing = TOOL_SUBJECT[bare];
	if (!phrasing) {
		return undefined;
	}

	for (const key of phrasing.keys) {
		const value = readable(input[key]);
		if (!value) {
			continue;
		}

		const shape = SUBJECT_SHAPE[key];

		return readable(`${phrasing.verb} ${shape ? shape(value) : value}`);
	}

	return undefined;
}

const BLOCK_TRACE: Record<string, string> = {
	thinking: "Thinking",
	redacted_thinking: "Thinking",
	text: "Writing",
};

const THINKING_TRACE = "Thinking";

const traceRecordSchema = type({ type: "'assistant'", "uuid?": "string", message: { content: "unknown[]" } });

const turnedRecordSchema = type({ type: "'user'", "uuid?": "string" });

const traceBlockSchema = type({
	type: "string",
	"name?": "string",
	"input?": "Record<string, unknown>",
});

function toolTrace(name: string, input: Record<string, unknown> | undefined): string {
	const bare = name.split("__").at(-1) ?? name;
	const family = bare.toLowerCase();
	const subject = input && toolSubject(family, input);
	if (subject) {
		return capped(subject);
	}

	return TOOL_TRACE[family] ?? bare;
}

function blockTrace(block: { type: string; name?: string; input?: Record<string, unknown> }): string | null {
	if (block.type !== "tool_use") {
		return BLOCK_TRACE[block.type] ?? null;
	}

	if (!block.name) {
		return null;
	}

	return toolTrace(block.name, block.input);
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
