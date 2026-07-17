import { describe, expect, it } from "vitest";
import { retainTabSessions } from "@core/session/TabSessionMonitor";

const claude = { harness: "claude" as const, sessionId: "claude" };
const codex = { harness: "codex" as const, sessionId: "codex" };

describe("retainTabSessions", () => {
	it("clears the execution while retaining the last reviewable Session", () => {
		expect(retainTabSessions(
			[{ tabId: "t" }],
			{},
			{ t: { state: "bound", session: claude, running: { argv: ["claude"] } } },
		)).toEqual({ t: { state: "bound", session: claude } });
	});

	it("replaces both identities when another Harness takes foreground", () => {
		const running = {
			t: { state: "bound" as const, session: codex, running: { argv: ["codex"] } },
		};
		expect(retainTabSessions(
			[{ tabId: "t" }],
			running,
			{ t: { state: "bound", session: claude } },
		)).toEqual(running);
	});

	it("forgets captures for Tabs that no longer exist", () => {
		expect(retainTabSessions([], {}, {
			t: { state: "bound", session: claude },
		})).toEqual({});
	});
});
