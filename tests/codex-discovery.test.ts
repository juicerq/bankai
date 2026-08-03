import { describe, expect, test } from "bun:test";
import { codexPresence } from "@main/agents/harness/codex/codex-harness";
import { CODEX_HARNESS_ID } from "@main/agents/harness/harness";
import { CodexRollout } from "@main/agents/harness/codex/codex-rollout";

const SESSION = "019fb811-0fc5-7a41-a882-c9124384c979";

const PROCESS = {
	pid: 736530,
	argv: ["codex"],
	procStart: "994400",
	cwd: "/home/jui/projects/swarm",
};

describe("a codex the process table shows", () => {
	test("reaches the card before it has written a rollout", () => {
		expect(codexPresence(PROCESS)).toEqual({
			harness: CODEX_HARNESS_ID,
			pid: 736530,
			procStart: "994400",
			cwd: "/home/jui/projects/swarm",
			status: "idle",
		});
	});

	test("carries the session and its turn once the rollout exists", () => {
		expect(
			codexPresence({
				...PROCESS,
				session: { sessionId: SESSION, cwd: "/home/jui/projects/swarm", state: { turn: { turnId: "t1", startedAt: 8000 } } },
			}),
		).toEqual({
			harness: CODEX_HARNESS_ID,
			sessionId: SESSION,
			pid: 736530,
			procStart: "994400",
			cwd: "/home/jui/projects/swarm",
			status: "working",
			statusSince: 8000,
		});
	});

	test("prefers the rollout's own directory over the one the process reports", () => {
		const presence = codexPresence({
			...PROCESS,
			session: { sessionId: SESSION, cwd: "/home/jui/projects/other", state: CodexRollout.IDLE_ROLLOUT },
		});

		expect(presence?.cwd).toBe("/home/jui/projects/other");
	});

	test("stays absent when its working directory cannot be read", () => {
		expect(codexPresence({ ...PROCESS, cwd: null })).toBeNull();
	});

	test("stays absent when the command line is not the interactive TUI", () => {
		expect(codexPresence({ ...PROCESS, argv: ["codex", "exec", "name this"] })).toBeNull();
	});

	test("stays absent when the process is already gone", () => {
		expect(codexPresence({ ...PROCESS, procStart: null })).toBeNull();
	});
});
