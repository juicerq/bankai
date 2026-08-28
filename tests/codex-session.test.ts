import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CodexHarness } from "@main/agents/harness/codex/codex-harness";
import { CodexSession } from "@main/agents/harness/codex/codex-session";
import { CodexAppServerTest } from "./utils/codex-app-server";

const SESSION = "019f898d-719d-7811-9b34-86470df90a52";
const TRANSCRIPT = `/home/jui/.codex/sessions/2026/08/08/rollout-${SESSION}.jsonl`;

let appServer: ReturnType<typeof CodexAppServerTest.install>;

beforeEach(() => {
	appServer = CodexAppServerTest.install();
});

afterEach(() => {
	appServer.close();
});

function respondWith(input: { name: string | null; preview: string; transcript?: string | null }): void {
	appServer.respond({
		id: 2,
		result: {
			thread: {
				id: SESSION,
				name: input.name,
				preview: input.preview,
				path: input.transcript ?? null,
			},
		},
	});
}

describe("the codex session", () => {
	test("keeps the session name pending when codex has only the first-message preview", async () => {
		respondWith({ name: null, preview: "oi", transcript: TRANSCRIPT });

		expect(await CodexSession.read(SESSION)).toEqual({ name: { state: "pending" }, transcript: TRANSCRIPT });
	});

	test("publishes the user-facing name codex returns", async () => {
		respondWith({ name: "Corrigir download da NFE", preview: "oi", transcript: TRANSCRIPT });

		expect(await CodexSession.read(SESSION)).toEqual({
			name: { state: "published", value: "Corrigir download da NFE" },
			transcript: TRANSCRIPT,
		});
	});

	test("returns no session when codex does not return a valid thread", async () => {
		appServer.respond({ id: 2, result: { thread: { id: 1 } } });

		expect(await CodexSession.read(SESSION)).toBeNull();
	});
});

describe("the codex harness", () => {
	test("gets the published name and conversation from the native session", async () => {
		respondWith({ name: "Corrigir download da NFE", preview: "oi", transcript: TRANSCRIPT });

		expect(await CodexHarness.publishedName({ sessionId: SESSION, cwd: "/x" })).toEqual({
			state: "published",
			value: "Corrigir download da NFE",
		});
		expect(await CodexHarness.conversation?.transcript({ sessionId: SESSION, cwd: "/x" })).toBe(TRANSCRIPT);
	});
});
