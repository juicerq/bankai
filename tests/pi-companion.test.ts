import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	ExtensionEvent,
	SessionEntry,
	SlashCommandInfo,
	ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { createTwoFilesPatch } from "diff";
import { describe, expect, it } from "vitest";
import {
	PI_COMPANION_ACTIVE_ENV,
	PI_COMPANION_PROTOCOL,
	PI_DISCOVERY_DIR_ENV,
	PI_REVIEW_ENTRY,
} from "@core/harness/pi/protocol";
import bankaiPiCompanion, { hasInvocationSessionDirectory } from "../src/pi-companion";
import { assertDefined } from "./utils/assertions";

type EventHandler = (event: ExtensionEvent, ctx: ExtensionContext) => unknown;

type Driver = {
	entries: { customType: string; data: unknown }[];
	emit(event: ExtensionEvent): Promise<void>;
};

function extensionDriver(input?: {
	tools?: ToolInfo[];
	commands?: SlashCommandInfo[];
	sessionId?: string;
	initialEntries?: SessionEntry[];
}): Driver {
	assertDefined(process.env.DATA_DIR);
	process.env[PI_COMPANION_ACTIVE_ENV] = "1";
	process.env[PI_DISCOVERY_DIR_ENV] = join(process.env.DATA_DIR, "pi-discovery");
	const handlers = new Map<string, EventHandler[]>();
	const entries: { customType: string; data: unknown }[] = [];
	const sessionEntries = [...(input?.initialEntries ?? [])];
	const api = {
		on(event: string, handler: EventHandler) {
			const related = handlers.get(event) ?? [];
			related.push(handler);
			handlers.set(event, related);
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ customType, data });
			sessionEntries.push({
				type: "custom",
				id: crypto.randomUUID().slice(0, 8),
				parentId: null,
				timestamp: new Date().toISOString(),
				customType,
				data,
			});
		},
		getAllTools: () => input?.tools ?? ["write", "edit"].map((name) => ({
			name,
			description: name,
			parameters: {},
			sourceInfo: {
				path: `<builtin:${name}>`,
				source: "builtin",
				scope: "temporary",
				origin: "top-level",
			},
		})),
		getCommands: () => input?.commands ?? [],
	} as unknown as ExtensionAPI;
	const sessionId = input?.sessionId ?? "pi-session";
	const context = {
		mode: "tui",
		cwd: process.env.DATA_DIR,
		sessionManager: {
			getSessionFile: () => join(process.env.DATA_DIR!, `${sessionId}.jsonl`),
			getSessionId: () => sessionId,
			getEntries: () => sessionEntries,
		},
	} as unknown as ExtensionContext;
	bankaiPiCompanion(api);

	return {
		entries,
		async emit(event) {
			for (const handler of handlers.get(event.type) ?? []) {
				await handler(event, context);
			}
		},
	};
}

function reviewEvents(driver: Driver): unknown[] {
	return driver.entries.flatMap((entry) => {
		if (entry.customType !== PI_REVIEW_ENTRY || !entry.data || typeof entry.data !== "object"
			|| !("event" in entry.data)) {
			return [];
		}
		return [entry.data.event];
	});
}

describe("Pi companion", () => {
	it("rejects invocation-local Session storage", () => {
		expect(hasInvocationSessionDirectory(["pi", "--session-dir", "/tmp/sessions"])).toBe(true);
		expect(hasInvocationSessionDirectory(["pi", "--session-dir=/tmp/sessions"])).toBe(true);
		expect(hasInvocationSessionDirectory(["pi"])).toBe(false);
	});

	it("marks startup Sessions eligible after Pi's initial metadata but not after conversation", async () => {
		const metadata: SessionEntry = {
			type: "model_change",
			id: "model001",
			parentId: null,
			timestamp: new Date().toISOString(),
			provider: "test",
			modelId: "test-model",
		};
		const fresh = extensionDriver({ initialEntries: [metadata] });
		await fresh.emit({ type: "session_start", reason: "startup" });
		expect(reviewEvents(fresh)).toEqual([{ type: "eligible" }]);

		const historical = extensionDriver({
			initialEntries: [metadata, {
				type: "message",
				id: "message1",
				parentId: metadata.id,
				timestamp: new Date().toISOString(),
				message: { role: "user", content: "existing", timestamp: Date.now() },
			}],
		});
		await historical.emit({ type: "session_start", reason: "startup" });
		expect(reviewEvents(historical)).toEqual([]);
	});

	it("records delivered raw prompts and exact successful built-in mutations", async () => {
		assertDefined(process.env.DATA_DIR);
		const template = join(process.env.DATA_DIR, "fix.md");
		const skill = join(process.env.DATA_DIR, "SKILL.md");
		await writeFile(template, "---\ndescription: fix\n---\nDo $1");
		await writeFile(skill, "---\nname: test\n---\nTest body");
		const sourceInfo = {
			source: "local",
			scope: "user" as const,
			origin: "top-level" as const,
		};
		const driver = extensionDriver({
			commands: [
				{
					name: "fix",
					source: "prompt",
					sourceInfo: { ...sourceInfo, path: template },
				},
				{
					name: "skill:test",
					source: "skill",
					sourceInfo: { ...sourceInfo, path: skill, baseDir: process.env.DATA_DIR },
				},
			],
		});
		await driver.emit({ type: "session_start", reason: "startup" });

		await driver.emit({
			type: "input",
			text: "ordinary prompt",
			source: "interactive",
		});
		await driver.emit({
			type: "before_agent_start",
			prompt: "ordinary prompt",
			systemPrompt: "",
			systemPromptOptions: { cwd: process.env.DATA_DIR },
		});
		await driver.emit({
			type: "input",
			text: "/fix cancelled",
			source: "interactive",
			streamingBehavior: "followUp",
		});
		await driver.emit({
			type: "input",
			text: "/fix \"hello world\"",
			source: "interactive",
			streamingBehavior: "followUp",
		});
		await driver.emit({
			type: "message_start",
			message: {
				role: "user",
				content: [{ type: "text", text: "Do hello world" }],
				timestamp: Date.now(),
			},
		});
		await driver.emit({
			type: "input",
			text: "/skill:test argument",
			source: "interactive",
			streamingBehavior: "steer",
		});
		await driver.emit({
			type: "message_start",
			message: {
				role: "user",
				content: [{
					type: "text",
					text: `<skill name="test" location="${skill}">\nReferences are relative to ${process.env.DATA_DIR}.\n\nTest body\n</skill>\n\nargument`,
				}],
				timestamp: Date.now(),
			},
		});
		await driver.emit({
			type: "input",
			text: "steer raw",
			source: "interactive",
			streamingBehavior: "steer",
		});
		await driver.emit({
			type: "message_start",
			message: {
				role: "user",
				content: [{ type: "text", text: "steer raw" }],
				timestamp: Date.now(),
			},
		});

		const path = join(process.env.DATA_DIR, "a.ts");
		await writeFile(path, "old");
		await driver.emit({
			type: "tool_call",
			toolName: "write",
			toolCallId: "write-failed",
			input: { path, content: "never" },
		});
		await driver.emit({
			type: "tool_execution_end",
			toolName: "write",
			toolCallId: "write-failed",
			result: { content: [], details: undefined },
			isError: true,
		});
		await driver.emit({
			type: "tool_call",
			toolName: "write",
			toolCallId: "write-1",
			input: { path, content: "middle" },
		});
		await driver.emit({
			type: "tool_call",
			toolName: "edit",
			toolCallId: "edit-1",
			input: { path, edits: [{ oldText: "middle", newText: "new" }] },
		});
		await writeFile(path, "middle");
		await driver.emit({
			type: "tool_execution_end",
			toolName: "write",
			toolCallId: "write-1",
			result: { content: [], details: undefined },
			isError: false,
		});

		await writeFile(path, "new");
		await driver.emit({
			type: "tool_execution_end",
			toolName: "edit",
			toolCallId: "edit-1",
			result: {
				content: [],
				details: { diff: "", patch: createTwoFilesPatch(path, path, "middle", "new") },
			},
			isError: false,
		});
		await writeFile(path, "external");
		await driver.emit({
			type: "tool_call",
			toolName: "write",
			toolCallId: "write-2",
			input: { path, content: "final" },
		});
		await writeFile(path, "final");
		await driver.emit({
			type: "tool_execution_end",
			toolName: "write",
			toolCallId: "write-2",
			result: { content: [], details: undefined },
			isError: false,
		});
		await driver.emit({ type: "agent_settled" });

		expect(reviewEvents(driver)).toEqual([
			{ type: "eligible" },
			{ type: "prompt", prompt: "ordinary prompt" },
			{ type: "prompt", prompt: "/fix \"hello world\"" },
			{ type: "prompt", prompt: "/skill:test argument" },
			{ type: "prompt", prompt: "steer raw" },
			{ type: "change", path, before: "old", after: "middle" },
			{ type: "change", path, before: "middle", after: "new" },
			{ type: "change", path, before: "external", after: "final" },
			{ type: "complete" },
		]);
	});

	it("publishes a fork as the same process's new eligible native Session", async () => {
		const parentEntry: SessionEntry = {
			type: "custom",
			id: "parent01",
			parentId: null,
			timestamp: new Date().toISOString(),
			customType: PI_REVIEW_ENTRY,
			data: {
				protocol: PI_COMPANION_PROTOCOL,
				originSessionId: "parent",
				event: { type: "eligible" },
			},
		};
		const parent = extensionDriver({ sessionId: "parent" });
		await parent.emit({ type: "session_start", reason: "startup" });
		const child = extensionDriver({
			sessionId: "child",
			initialEntries: [parentEntry],
		});
		await child.emit({
			type: "session_start",
			reason: "fork",
			previousSessionFile: "/sessions/parent.jsonl",
		});

		assertDefined(process.env.BANKAI_PI_DISCOVERY_DIR);
		const sidecar = JSON.parse(await readFile(
			join(process.env.BANKAI_PI_DISCOVERY_DIR, `${process.pid}.json`),
			"utf8",
		)) as { sessionId: string };
		expect(sidecar.sessionId).toBe("child");
		expect(reviewEvents(child)).toEqual([{ type: "eligible" }]);
	});

	it("accepts compatible file-tool overrides and rejects unverifiable results", async () => {
		assertDefined(process.env.DATA_DIR);
		const customTool: ToolInfo = {
			name: "write",
			description: "custom",
			parameters: {},
			sourceInfo: {
				path: "/foreign/write.ts",
				source: "local",
				scope: "user",
				origin: "top-level",
			},
		};
		const driver = extensionDriver({ tools: [customTool] });
		await driver.emit({ type: "session_start", reason: "startup" });

		const path = join(process.env.DATA_DIR, "override.ts");
		await driver.emit({
			type: "tool_call",
			toolName: "write",
			toolCallId: "compatible",
			input: { path, content: "verified" },
		});
		await writeFile(path, "verified");
		await driver.emit({
			type: "tool_execution_end",
			toolName: "write",
			toolCallId: "compatible",
			result: { content: [], details: undefined },
			isError: false,
		});
		await driver.emit({
			type: "tool_call",
			toolName: "write",
			toolCallId: "incompatible",
			input: { path, content: "claimed" },
		});
		await writeFile(path, "different");
		await driver.emit({
			type: "tool_execution_end",
			toolName: "write",
			toolCallId: "incompatible",
			result: { content: [], details: undefined },
			isError: false,
		});

		expect(reviewEvents(driver)).toEqual([
			{ type: "eligible" },
			{ type: "change", path, before: "", after: "verified" },
			{ type: "unavailable", reason: "unsafe" },
		]);
	});
});
