import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HOOK_COMMAND, type HookEvent, HookGateway } from "@core/hooks/HookGateway";
import { HookInstaller } from "@core/hooks/HookInstaller";
import { atomicWrite } from "@core/store/atomic";

async function withGateway<T>(fn: (gw: HookGateway) => T | Promise<T>): Promise<T> {
	const gw = new HookGateway();
	await gw.start(0);
	try {
		return await fn(gw);
	} finally {
		await gw.stop();
	}
}

function collect(gw: HookGateway) {
	const events: HookEvent[] = [];
	gw.onEvent((e) => {
		events.push(e);
	});

	return events;
}

function post(gw: HookGateway, body: string) {
	return fetch(`http://127.0.0.1:${gw.port}/hooks`, { method: "POST", body });
}

describe("HookGateway", () => {
	it("emits a typed event for a Stop payload", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			const res = await post(gw, JSON.stringify({ hook_event_name: "Stop", session_id: "abc" }));

			expect(res.status).toBe(200);
			expect(events).toMatchObject([{ event: "Stop", sessionId: "abc" }]);
		});
	});

	it("normalizes cwd and transcript_path", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			await post(
				gw,
				JSON.stringify({
					hook_event_name: "Stop",
					session_id: "s1",
					cwd: "/home/jui/app",
					transcript_path: "/t.jsonl",
				}),
			);

			expect(events[0]?.cwd).toBe("/home/jui/app");
			expect(events[0]?.transcriptPath).toBe("/t.jsonl");
		});
	});

	it("carries Write content as the edit content", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			await post(
				gw,
				JSON.stringify({
					hook_event_name: "PostToolUse",
					session_id: "sess-9",
					tool_name: "Write",
					tool_input: { file_path: "/a/b.ts", content: "hello" },
					unknown_future_field: 123,
				}),
			);

			expect(events).toMatchObject([
				{ event: "PostToolUse", sessionId: "sess-9", filePath: "/a/b.ts", content: "hello" },
			]);
		});
	});

	it("carries Edit old_string, new_string, and replace_all", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			await post(
				gw,
				JSON.stringify({
					hook_event_name: "PostToolUse",
					session_id: "sess-9",
					tool_name: "Edit",
					tool_input: {
						file_path: "/a/b.ts",
						old_string: "was",
						new_string: "changed",
						replace_all: true,
					},
				}),
			);

			expect(events[0]).toMatchObject({
				oldString: "was",
				newString: "changed",
				replaceAll: true,
			});
		});
	});

	it("captures the prompt on UserPromptSubmit", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			await post(
				gw,
				JSON.stringify({
					hook_event_name: "UserPromptSubmit",
					session_id: "sess-9",
					prompt: "do the thing",
				}),
			);

			expect(events[0]?.prompt).toBe("do the thing");
		});
	});

	it("acks but emits nothing without a session id", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			const res = await post(gw, JSON.stringify({ hook_event_name: "Stop" }));

			expect(res.status).toBe(200);
			expect(events).toEqual([]);
		});
	});

	it("acks but emits nothing for an untracked event", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			const res = await post(
				gw,
				JSON.stringify({ hook_event_name: "SessionStart", session_id: "abc" }),
			);

			expect(res.status).toBe(200);
			expect(events).toEqual([]);
		});
	});

	it("rejects malformed json with 400 and emits nothing", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			const res = await post(gw, "not json");

			expect(res.status).toBe(400);
			expect(events).toEqual([]);
		});
	});

	it("404s a non-hook path", async () => {
		await withGateway(async (gw) => {
			const res = await fetch(`http://127.0.0.1:${gw.port}/other`, { method: "POST" });
			expect(res.status).toBe(404);
		});
	});
});

describe("HookInstaller", () => {
	let home: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "project-j-home-"));
		process.env.HOME = home;
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
		delete process.env.HOME;
	});

	async function readSettings() {
		const raw = await readFile(join(home, ".claude", "settings.json"), "utf8");
		return JSON.parse(raw) as Record<string, unknown>;
	}

	function groupsFor(settings: Record<string, unknown>, event: string) {
		const groups = (settings.hooks as Record<string, unknown[]>)[event];
		if (!groups) {
			throw new Error(`no groups for ${event}`);
		}

		return groups;
	}

	it("creates the four hooks when settings are absent", async () => {
		await HookInstaller.install();
		const settings = await readSettings();

		expect(Object.keys(settings.hooks as object).sort()).toEqual([
			"Notification",
			"PostToolUse",
			"Stop",
			"UserPromptSubmit",
		]);
	});

	it("matches PostToolUse on Edit|Write with the curl command", async () => {
		await HookInstaller.install();
		const settings = await readSettings();
		const group = groupsFor(settings, "PostToolUse")[0] as {
			matcher: string;
			hooks: { command: string }[];
		};

		expect(group.matcher).toBe("Edit|Write");
		expect(group.hooks[0]?.command).toBe(HOOK_COMMAND);
	});

	it("is idempotent across repeated installs", async () => {
		await HookInstaller.install();
		await HookInstaller.install();
		const settings = await readSettings();

		expect(groupsFor(settings, "Stop")).toHaveLength(1);
	});

	it("preserves existing hooks and unrelated keys", async () => {
		const path = join(home, ".claude", "settings.json");
		await atomicWrite(
			path,
			JSON.stringify(
				{
					model: "opus",
					hooks: {
						UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo mine" }] }],
					},
				},
				null,
				2,
			),
		);

		await HookInstaller.install();
		const settings = await readSettings();

		expect(settings.model).toBe("opus");
		const submit = groupsFor(settings, "UserPromptSubmit") as {
			hooks: { command: string }[];
		}[];
		expect(submit).toHaveLength(2);
		expect(submit[0]?.hooks[0]?.command).toBe("echo mine");
		expect(submit[1]?.hooks[0]?.command).toBe(HOOK_COMMAND);
	});
});
