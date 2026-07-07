import { describe, expect, it } from "vitest";
import { type HookEvent, HookGateway } from "@core/hooks/HookGateway";

type HttpEvent = "UserPromptSubmit" | "PostToolUse" | "Stop" | "Notification";

async function withGateway<T>(
	fn: (gw: HookGateway) => T | Promise<T>,
): Promise<T> {
	const gw = new HookGateway();
	await gw.start();
	try {
		return await fn(gw);
	} finally {
		await gw.stop();
	}
}

function hookUrl(gw: HookGateway, sessionId: string, event: HttpEvent) {
	const url = gw.settingsFor(sessionId).hooks[event][0]?.hooks[0]?.url;
	if (!url) {
		throw new Error(`no hook url for ${event}`);
	}

	return url;
}

function collect(gw: HookGateway) {
	const events: HookEvent[] = [];
	gw.onEvent((e) => {
		events.push(e);
	});

	return events;
}

describe("settingsFor", () => {
	it("registers the four http-deliverable events and omits SessionStart", async () => {
		await withGateway((gw) => {
			expect(Object.keys(gw.settingsFor("s").hooks).sort()).toEqual([
				"Notification",
				"PostToolUse",
				"Stop",
				"UserPromptSubmit",
			]);
		});
	});

	it("matches PostToolUse on Edit|Write only", async () => {
		await withGateway((gw) => {
			expect(gw.settingsFor("s").hooks.PostToolUse.at(0)?.matcher).toBe(
				"Edit|Write",
			);
		});
	});

	it("allowlists its own origin for http hooks", async () => {
		await withGateway((gw) => {
			const settings = gw.settingsFor("s");
			const origin = new URL(hookUrl(gw, "s", "Stop")).origin;
			expect(settings.allowedHttpHookUrls).toEqual([`${origin}/*`]);
		});
	});
});

describe("HookGateway (http round-trip)", () => {
	it("emits a typed event for an authenticated POST", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			const res = await fetch(hookUrl(gw, "abc", "Stop"), {
				method: "POST",
				body: JSON.stringify({ hook_event_name: "Stop", session_id: "abc" }),
			});

			expect(res.status).toBe(200);
			expect(events).toMatchObject([{ event: "Stop", sessionId: "abc" }]);
		});
	});

	it("carries Write content as the edit content", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			await fetch(hookUrl(gw, "sess-9", "PostToolUse"), {
				method: "POST",
				body: JSON.stringify({
					hook_event_name: "PostToolUse",
					session_id: "sess-9",
					tool_name: "Write",
					tool_input: { file_path: "/a/b.ts", content: "hello" },
					transcript_path: "/t.jsonl",
					cwd: "/a",
					unknown_future_field: 123,
				}),
			});

			expect(events).toMatchObject([
				{
					event: "PostToolUse",
					sessionId: "sess-9",
					filePath: "/a/b.ts",
					content: "hello",
				},
			]);
		});
	});

	it("carries Edit old_string, new_string, and replace_all as edit fields", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			await fetch(hookUrl(gw, "sess-9", "PostToolUse"), {
				method: "POST",
				body: JSON.stringify({
					hook_event_name: "PostToolUse",
					tool_name: "Edit",
					tool_input: {
						file_path: "/a/b.ts",
						old_string: "was",
						new_string: "changed",
						replace_all: true,
					},
				}),
			});

			expect(events[0]).toMatchObject({
				content: undefined,
				oldString: "was",
				newString: "changed",
				replaceAll: true,
			});
		});
	});

	it("captures the prompt on UserPromptSubmit", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			await fetch(hookUrl(gw, "sess-9", "UserPromptSubmit"), {
				method: "POST",
				body: JSON.stringify({
					hook_event_name: "UserPromptSubmit",
					prompt: "do the thing",
				}),
			});

			expect(events[0]?.prompt).toBe("do the thing");
		});
	});

	it("falls back to the path session id when the payload omits it", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			await fetch(hookUrl(gw, "path-sess", "Stop"), {
				method: "POST",
				body: JSON.stringify({ hook_event_name: "Stop" }),
			});

			expect(events[0]?.sessionId).toBe("path-sess");
		});
	});

	it("acks but emits nothing for an untracked event like SessionStart", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			const res = await fetch(hookUrl(gw, "abc", "Stop"), {
				method: "POST",
				body: JSON.stringify({ hook_event_name: "SessionStart" }),
			});

			expect(res.status).toBe(200);
			expect(events).toEqual([]);
		});
	});

	it("rejects a wrong token with 403 and emits nothing", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			const url = new URL(hookUrl(gw, "abc", "Stop"));
			url.searchParams.set("t", "wrong");
			const res = await fetch(url, {
				method: "POST",
				body: JSON.stringify({ hook_event_name: "Stop", session_id: "abc" }),
			});

			expect(res.status).toBe(403);
			expect(events).toEqual([]);
		});
	});

	it("rejects malformed json with 400 and emits nothing", async () => {
		await withGateway(async (gw) => {
			const events = collect(gw);
			const res = await fetch(hookUrl(gw, "abc", "Stop"), {
				method: "POST",
				body: "not json",
			});

			expect(res.status).toBe(400);
			expect(events).toEqual([]);
		});
	});
});
