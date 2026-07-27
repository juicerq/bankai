import { describe, expect, test } from "bun:test";
import type { AgentActivityState } from "@shared/activity";
import {
	type ResidencyShell,
	SHELL_ARCHIVE_GRACE_MS,
	shellResidency,
} from "@renderer/routes/-utils/shell-residency";

const NOW = 1_800_000_000_000;
const SESSION = { harness: "claude", sessionId: "abc", cwd: "/repo" };

function residencyOf(
	shells: ResidencyShell[],
	options: {
		activity?: Record<string, AgentActivityState>;
		statusSince?: Record<string, number>;
		woken?: string[];
		now?: number;
	} = {},
) {
	return shellResidency({
		shells,
		activity: new Map(Object.entries(options.activity ?? {})),
		statusSince: new Map(Object.entries(options.statusSince ?? {})),
		woken: new Set(options.woken ?? []),
		now: options.now ?? NOW,
	});
}

describe("what stays running", () => {
	test("an open shell is resident whether or not it can be resumed", () => {
		const { resident } = residencyOf([
			{ id: "s1", session: SESSION },
			{ id: "s2" },
		]);

		expect([...resident]).toEqual(["s1", "s2"]);
	});

	test("an archived shell that can be resumed sleeps", () => {
		const { resident } = residencyOf([{ id: "s1", archivedAt: NOW, session: SESSION }]);

		expect(resident.size).toBe(0);
	});

	test("an archived shell with nothing to resume stays running", () => {
		const { resident } = residencyOf([{ id: "s1", archivedAt: NOW }]);

		expect([...resident]).toEqual(["s1"]);
	});

	test("selecting an archived shell wakes it without unfiling it", () => {
		const { resident } = residencyOf([{ id: "s1", archivedAt: NOW, session: SESSION }], {
			woken: ["s1"],
		});

		expect([...resident]).toEqual(["s1"]);
	});
});

describe("the grace an archived shell gets to finish", () => {
	const archived: ResidencyShell[] = [{ id: "s1", archivedAt: NOW, session: SESSION }];

	test("a shell that just entered its state survives", () => {
		const { resident } = residencyOf(archived, {
			activity: { s1: "working" },
			statusSince: { s1: NOW },
			now: NOW + SHELL_ARCHIVE_GRACE_MS - 1,
		});

		expect([...resident]).toEqual(["s1"]);
	});

	test("the grace runs from when the state began, not from the archiving", () => {
		const { resident } = residencyOf(archived, {
			activity: { s1: "needs-attention" },
			statusSince: { s1: NOW - SHELL_ARCHIVE_GRACE_MS },
			now: NOW,
		});

		expect(resident.size).toBe(0);
	});

	test("without a timestamp the grace runs from the archiving", () => {
		const { resident } = residencyOf(archived, {
			activity: { s1: "needs-attention" },
			now: NOW + SHELL_ARCHIVE_GRACE_MS - 1,
		});

		expect([...resident]).toEqual(["s1"]);
	});

	test("an archived shell with no activity at all gets no grace", () => {
		const { resident } = residencyOf(archived, { now: NOW });

		expect(resident.size).toBe(0);
	});
});

describe("what can be resumed", () => {
	test("every shell holding a session ref is resumable, asleep or awake", () => {
		const { resumable } = residencyOf([
			{ id: "s1", session: SESSION },
			{ id: "s2", archivedAt: NOW, session: SESSION },
			{ id: "s3" },
		]);

		expect([...resumable]).toEqual(["s1", "s2"]);
	});
});
