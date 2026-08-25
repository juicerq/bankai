import { describe, expect, test } from "bun:test";
import { OpencodeBinding } from "@main/agents/harness/opencode/opencode-binding";

const DIRECTORY = "/repo";

function session(id: string, created: number, updated: number) {
	return { sessionId: id, cwd: DIRECTORY, timeCreated: created, timeUpdated: updated };
}

describe("two opencode tuis sharing one directory", () => {
	test("each process keeps the session it opened", () => {
		const bound = OpencodeBinding.bind(
			[{ pid: 1, startedAt: 1_000 }, { pid: 2, startedAt: 3_000 }],
			[session("ses_first", 1_500, 5_000), session("ses_second", 3_500, 4_000)],
		);

		expect(bound.get(1)).toBe("ses_first");
		expect(bound.get(2)).toBe("ses_second");
	});

	test("the process that has not opened a session yet takes none of the other's", () => {
		const bound = OpencodeBinding.bind(
			[{ pid: 1, startedAt: 1_000 }, { pid: 2, startedAt: 3_000 }],
			[session("ses_first", 1_500, 5_000)],
		);

		expect(bound.get(1)).toBe("ses_first");
		expect(bound.get(2)).toBeUndefined();
	});

	test("a resumed session belongs to the process that asked for it", () => {
		const bound = OpencodeBinding.bind(
			[{ pid: 1, startedAt: 1_000, sessionId: "ses_old" }, { pid: 2, startedAt: 3_000 }],
			[session("ses_old", 500, 6_000), session("ses_fresh", 3_500, 4_000)],
		);

		expect(bound.get(1)).toBe("ses_old");
		expect(bound.get(2)).toBe("ses_fresh");
	});
});

describe("a lone opencode tui", () => {
	test("follows the liveliest session of its directory", () => {
		const bound = OpencodeBinding.bind(
			[{ pid: 1, startedAt: 9_000 }],
			[session("ses_stale", 1_000, 2_000), session("ses_live", 500, 8_000)],
		);

		expect(bound.get(1)).toBe("ses_live");
	});

	test("prefers the session it opened over an older livelier one", () => {
		const bound = OpencodeBinding.bind(
			[{ pid: 1, startedAt: 9_000 }],
			[session("ses_live", 500, 20_000), session("ses_own", 9_500, 10_000)],
		);

		expect(bound.get(1)).toBe("ses_own");
	});

	test("binds nothing when the directory has no session", () => {
		expect(OpencodeBinding.bind([{ pid: 1, startedAt: 9_000 }], []).size).toBe(0);
	});
});
