import { readFileSync } from "node:fs";
import {
	mkdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	InputEvent,
	SessionStartEvent,
	ToolCallEvent,
	WriteToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { applyPatch } from "diff";
import {
	PI_COMPANION_ACTIVE_ENV,
	PI_COMPANION_PROTOCOL,
	PI_DISCOVERY_DIR_ENV,
	PI_REVIEW_ENTRY,
} from "@core/harness/pi/protocol";

type ReviewEvent =
	| { type: "eligible" }
	| { type: "prompt"; prompt: string }
	| { type: "change"; path: string; before: string; after: string }
	| { type: "complete" }
	| { type: "unavailable"; reason: "unsafe" | "tool-conflict" };

type PendingPrompt = {
	raw: string;
	expanded: string;
	queuedAt: number;
	streaming: boolean;
};

type PendingMutation =
	| { type: "write"; path: string; input: { content: string } }
	| { type: "edit"; path: string };

export function hasInvocationSessionDirectory(argv: string[]): boolean {
	return argv.some((argument) =>
		argument === "--session-dir" || argument.startsWith("--session-dir="));
}

async function procStart(): Promise<string | null> {
	const raw = await readFile("/proc/self/stat", "utf8").catch(() => null);
	if (!raw) {
		return null;
	}

	const start = raw.slice(raw.lastIndexOf(")") + 2).split(" ")[19];
	return start === undefined ? null : start;
}

function stripFrontmatter(content: string): string {
	const normalized = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
	if (!normalized.startsWith("---")) {
		return normalized;
	}

	const end = normalized.indexOf("\n---", 3);
	return end < 0 ? normalized : normalized.slice(end + 4).trim();
}

function commandArguments(raw: string): string[] {
	const result: string[] = [];
	let current = "";
	let quote: "'" | "\"" | null = null;
	for (const character of raw) {
		if (quote) {
			if (character === quote) {
				quote = null;
			} else {
				current += character;
			}
		} else if (character === "'" || character === "\"") {
			quote = character;
		} else if (/\s/.test(character)) {
			if (current) {
				result.push(current);
				current = "";
			}
		} else {
			current += character;
		}
	}
	if (current) {
		result.push(current);
	}
	return result;
}

function substituteArguments(content: string, args: string[]): string {
	const all = args.join(" ");
	return content.replaceAll(
		/\$\{(\d+):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
		(_match, defaultNumber, defaultValue, sliceStart, sliceLength, simple) => {
			if (defaultNumber) {
				return args[Number(defaultNumber) - 1] || defaultValue;
			}
			if (sliceStart) {
				const start = Math.max(0, Number(sliceStart) - 1);
				return sliceLength
					? args.slice(start, start + Number(sliceLength)).join(" ")
					: args.slice(start).join(" ");
			}
			if (simple === "ARGUMENTS" || simple === "@") {
				return all;
			}
			return args[Number(simple) - 1] ?? "";
		},
	);
}

function expandedInput(pi: ExtensionAPI, raw: string): string {
	if (!raw.startsWith("/")) {
		return raw;
	}

	const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(raw);
	if (!match?.[1]) {
		return raw;
	}
	const command = pi.getCommands().find((candidate) => candidate.name === match[1]);
	if (!command || command.source === "extension") {
		return raw;
	}

	const content = readFileSync(command.sourceInfo.path, "utf8");
	if (command.source === "skill") {
		const body = stripFrontmatter(content).trim();
		const name = command.name.slice("skill:".length);
		const base = command.sourceInfo.baseDir ?? dirname(command.sourceInfo.path);
		const skill = `<skill name="${name}" location="${command.sourceInfo.path}">\nReferences are relative to ${base}.\n\n${body}\n</skill>`;
		const args = match[2]?.trim();
		return args ? `${skill}\n\n${args}` : skill;
	}

	return substituteArguments(stripFrontmatter(content), commandArguments(match[2] ?? ""));
}

function messageText(message: unknown): string | null {
	if (!message || typeof message !== "object" || !("role" in message) || message.role !== "user") {
		return null;
	}
	if (!("content" in message)) {
		return null;
	}
	if (typeof message.content === "string") {
		return message.content;
	}
	if (!Array.isArray(message.content)) {
		return null;
	}

	return message.content.flatMap((block) =>
		block && typeof block === "object" && "type" in block && block.type === "text"
			&& "text" in block && typeof block.text === "string"
			? [block.text]
			: []).join("\n");
}

function toolPath(path: string, cwd: string): string {
	const withoutAt = path.startsWith("@") ? path.slice(1) : path;
	if (withoutAt === "~") {
		return homedir();
	}
	const expanded = withoutAt.startsWith("~/")
		? join(homedir(), withoutAt.slice(2))
		: withoutAt;
	return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

function lineEnding(content: string): "\n" | "\r\n" {
	const crlf = content.indexOf("\r\n");
	const lf = content.indexOf("\n");
	return lf >= 0 && crlf >= 0 && crlf < lf ? "\r\n" : "\n";
}

function editAfter(before: string, patch: string): string | null {
	const bom = before.startsWith("\uFEFF") ? "\uFEFF" : "";
	const content = bom ? before.slice(1) : before;
	const ending = lineEnding(content);
	const normalized = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
	const after = applyPatch(normalized, patch);
	if (after === false) {
		return null;
	}

	return bom + (ending === "\r\n" ? after.replaceAll("\n", "\r\n") : after);
}

function writeCall(event: ToolCallEvent): WriteToolCallEvent | null {
	if (event.toolName !== "write" || typeof event.input.path !== "string"
		|| typeof event.input.content !== "string") {
		return null;
	}
	return event as WriteToolCallEvent;
}

function editCall(event: ToolCallEvent): { input: { path: string } } | null {
	if (event.toolName !== "edit" || typeof event.input.path !== "string") {
		return null;
	}
	return { input: { path: event.input.path } };
}

function editPatch(result: unknown): string | null {
	if (!result || typeof result !== "object" || !("details" in result)
		|| !result.details || typeof result.details !== "object"
		|| !("patch" in result.details) || typeof result.details.patch !== "string") {
		return null;
	}
	return result.details.patch;
}

function ownsEligibility(entry: unknown, sessionId: string): boolean {
	if (!entry || typeof entry !== "object" || !("type" in entry) || entry.type !== "custom") {
		return false;
	}
	if (!("customType" in entry) || entry.customType !== PI_REVIEW_ENTRY || !("data" in entry)) {
		return false;
	}
	return !!entry.data && typeof entry.data === "object"
		&& "protocol" in entry.data && entry.data.protocol === PI_COMPANION_PROTOCOL
		&& "originSessionId" in entry.data && entry.data.originSessionId === sessionId
		&& "event" in entry.data && !!entry.data.event && typeof entry.data.event === "object"
		&& "type" in entry.data.event && entry.data.event.type === "eligible";
}

function shouldCreateEligibility(
	event: SessionStartEvent,
	ctx: ExtensionContext,
	sessionId: string,
): boolean {
	if (event.reason === "new" || event.reason === "fork") {
		return true;
	}

	const entries = ctx.sessionManager.getEntries();
	if (entries.some((entry) => ownsEligibility(entry, sessionId))) {
		return false;
	}
	return event.reason === "startup" && entries.length === 0;
}

export default function bankaiPiCompanion(pi: ExtensionAPI): void {
	if (
		process.env[PI_COMPANION_ACTIVE_ENV] !== "1"
		|| hasInvocationSessionDirectory(process.argv)
	) {
		return;
	}

	let discoveryPath: string | null = null;
	let sessionId: string | null = null;
	let captureSafe = true;
	let pendingPrompts: PendingPrompt[] = [];
	const pendingMutations = new Map<string, PendingMutation>();
	const fileContents = new Map<string, string>();

	const append = (event: ReviewEvent) => {
		if (!sessionId) {
			return;
		}
		pi.appendEntry(PI_REVIEW_ENTRY, {
			protocol: PI_COMPANION_PROTOCOL,
			originSessionId: sessionId,
			event,
		});
	};
	const unavailable = (reason: "unsafe" | "tool-conflict") => {
		if (captureSafe) {
			append({ type: "unavailable", reason });
			captureSafe = false;
		}
	};

	pi.on("session_start", async (event, ctx) => {
		const directory = process.env[PI_DISCOVERY_DIR_ENV];
		const transcriptPath = ctx.sessionManager.getSessionFile();
		const start = await procStart();
		if (ctx.mode !== "tui" || !directory || !transcriptPath || !start) {
			return;
		}

		sessionId = ctx.sessionManager.getSessionId();
		captureSafe = true;
		pendingPrompts = [];
		pendingMutations.clear();
		fileContents.clear();
		if (shouldCreateEligibility(event, ctx, sessionId)) {
			append({ type: "eligible" });
		}

		const tools = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));
		const conflict = ["write", "edit"].some((name) => {
			const tool = tools.get(name);
			return tool !== undefined && tool.sourceInfo.source !== "builtin";
		});
		if (conflict) {
			unavailable("tool-conflict");
		}

		await mkdir(directory, { recursive: true });
		discoveryPath = join(directory, `${process.pid}.json`);
		const temporary = `${discoveryPath}.${crypto.randomUUID()}.tmp`;
		await writeFile(temporary, JSON.stringify({
			protocol: PI_COMPANION_PROTOCOL,
			pid: process.pid,
			procStart: start,
			sessionId,
			transcriptPath,
			mode: "interactive",
		}));
		await rename(temporary, discoveryPath);
	});

	pi.on("input", (event: InputEvent) => {
		if (event.source !== "interactive" || !sessionId) {
			return { action: "continue" };
		}
		if (event.streamingBehavior === undefined) {
			pendingPrompts = pendingPrompts.filter((pending) => pending.streaming);
		}
		const expanded = (() => {
			try {
				return expandedInput(pi, event.text);
			} catch {
				unavailable("unsafe");
				return null;
			}
		})();
		if (expanded === null) {
			return { action: "continue" };
		}
		pendingPrompts.push({
			raw: event.text,
			expanded,
			queuedAt: Date.now(),
			streaming: event.streamingBehavior !== undefined,
		});
		return { action: "continue" };
	});

	pi.on("before_agent_start", (event) => {
		const index = pendingPrompts.findLastIndex((pending) =>
			!pending.streaming && pending.expanded === event.prompt);
		if (index < 0) {
			return;
		}
		const [pending] = pendingPrompts.splice(index, 1);
		if (pending) {
			append({ type: "prompt", prompt: pending.raw });
		}
	});

	pi.on("message_start", (event) => {
		const text = messageText(event.message);
		if (text === null || !("timestamp" in event.message)) {
			return;
		}
		const candidates = pendingPrompts
			.map((pending, index) => ({ pending, index }))
			.filter(({ pending }) => pending.streaming && pending.expanded === text)
			.sort((left, right) =>
				Math.abs(left.pending.queuedAt - event.message.timestamp)
				- Math.abs(right.pending.queuedAt - event.message.timestamp));
		const match = candidates[0];
		if (!match) {
			return;
		}

		pendingPrompts.splice(match.index, 1);
		append({ type: "prompt", prompt: match.pending.raw });
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!captureSafe) {
			return;
		}
		const write = writeCall(event);
		const edit = editCall(event);
		const input = write?.input ?? edit?.input;
		if (!input) {
			return;
		}

		const activeTool = pi.getAllTools().find((tool) => tool.name === event.toolName);
		if (activeTool?.sourceInfo.source !== "builtin") {
			unavailable("tool-conflict");
			return;
		}

		const path = toolPath(input.path, ctx.cwd);
		const pathAlreadyPending = [...pendingMutations.values()]
			.some((pending) => pending.path === path);
		if (!pathAlreadyPending) {
			const before = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") {
					return "";
				}
				return null;
			});
			if (before === null) {
				unavailable("unsafe");
				return;
			}
			fileContents.set(path, before);
		}

		pendingMutations.set(event.toolCallId, write
			? { type: "write", path, input: write.input }
			: { type: "edit", path });
	});

	pi.on("tool_execution_end", (event) => {
		const pending = pendingMutations.get(event.toolCallId);
		if (!pending) {
			return;
		}
		pendingMutations.delete(event.toolCallId);
		if (event.isError || !captureSafe) {
			return;
		}

		const before = fileContents.get(pending.path);
		if (before === undefined) {
			unavailable("unsafe");
			return;
		}
		const patch = pending.type === "edit" ? editPatch(event.result) : null;
		const after = pending.type === "write"
			? pending.input.content
			: patch
				? editAfter(before, patch)
				: null;
		if (after === null) {
			unavailable("unsafe");
			return;
		}

		fileContents.set(pending.path, after);
		append({ type: "change", path: pending.path, before, after });
	});

	pi.on("agent_settled", () => {
		pendingPrompts = [];
		if (captureSafe) {
			append({ type: "complete" });
		}
	});

	pi.on("session_shutdown", async (event) => {
		pendingPrompts = [];
		pendingMutations.clear();
		if (event.reason === "quit" && discoveryPath) {
			await unlink(discoveryPath).catch(() => {});
		}
	});
}
