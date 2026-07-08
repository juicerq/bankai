import { describe, expect, it } from "vitest";
import { type ProcSource, SessionBinder, type SessionSource } from "@core/session/SessionBinder";

type ProcNode = { parent: number | null; start?: string };

function fakeProc(tree: Record<number, ProcNode>): ProcSource {
	const node = (pid: number): ProcNode => {
		const found = tree[pid];
		if (!found) {
			throw new Error(`no proc ${pid}`);
		}

		return found;
	};

	return {
		pids: () => Promise.resolve(Object.keys(tree).map(Number)),
		parent: (pid) => Promise.resolve(node(pid).parent),
		procStart: (pid) => {
			const start = node(pid).start;

			return Promise.resolve(start === undefined ? null : start);
		},
	};
}

function fakeSessions(records: { pid: number; sessionId: string; procStart: string; kind?: string }[]): SessionSource {
	return { list: () => Promise.resolve(records) };
}

describe("SessionBinder.resolveMany", () => {
	it("binds a shell to the claude descendant recorded in the sessions map", async () => {
		const proc = fakeProc({
			1: { parent: null },
			100: { parent: 1 },
			200: { parent: 100, start: "5471493" },
		});
		const sessions = fakeSessions([{ pid: 200, sessionId: "aaaa-1111", procStart: "5471493" }]);

		const bound = await SessionBinder.resolveMany(proc, sessions, [{ tabId: "t1", pid: 100 }]);

		expect(bound).toEqual({ t1: { sessionId: "aaaa-1111", pid: 200 } });
	});

	it("finds a claude nested below an intermediate process", async () => {
		const proc = fakeProc({
			100: { parent: 1 },
			200: { parent: 100 },
			300: { parent: 200, start: "9999" },
		});
		const sessions = fakeSessions([{ pid: 300, sessionId: "deep-9999", procStart: "9999" }]);

		const bound = await SessionBinder.resolveMany(proc, sessions, [{ tabId: "t1", pid: 100 }]);

		expect(bound).toEqual({ t1: { sessionId: "deep-9999", pid: 300 } });
	});

	it("skips a tab with no descendant in the sessions map", async () => {
		const proc = fakeProc({
			100: { parent: 1 },
			200: { parent: 100, start: "5471493" },
		});
		const sessions = fakeSessions([]);

		expect(await SessionBinder.resolveMany(proc, sessions, [{ tabId: "t1", pid: 100 }])).toEqual({});
	});

	it("rejects a recycled pid whose procStart no longer matches the record", async () => {
		const proc = fakeProc({
			100: { parent: 1 },
			200: { parent: 100, start: "5471493" },
		});
		const sessions = fakeSessions([{ pid: 200, sessionId: "stale-0000", procStart: "1111111" }]);

		expect(await SessionBinder.resolveMany(proc, sessions, [{ tabId: "t1", pid: 100 }])).toEqual({});
	});

	it("maps a set of tabs to their bound session ids, skipping unbound ones", async () => {
		const proc = fakeProc({
			100: { parent: 1 },
			101: { parent: 1 },
			102: { parent: 1 },
			200: { parent: 100, start: "111" },
			201: { parent: 101, start: "222" },
		});
		const sessions = fakeSessions([
			{ pid: 200, sessionId: "aaaa-1111", procStart: "111" },
			{ pid: 201, sessionId: "bbbb-2222", procStart: "222" },
		]);

		const bound = await SessionBinder.resolveMany(proc, sessions, [
			{ tabId: "t1", pid: 100 },
			{ tabId: "t2", pid: 101 },
			{ tabId: "t3", pid: 102 },
		]);

		expect(bound).toEqual({
			t1: { sessionId: "aaaa-1111", pid: 200 },
			t2: { sessionId: "bbbb-2222", pid: 201 },
		});
	});

	it("carries the session record kind through to the binding", async () => {
		const proc = fakeProc({
			100: { parent: 1 },
			200: { parent: 100, start: "111" },
		});
		const sessions = fakeSessions([
			{ pid: 200, sessionId: "aaaa-1111", procStart: "111", kind: "interactive" },
		]);

		const bound = await SessionBinder.resolveMany(proc, sessions, [{ tabId: "t1", pid: 100 }]);

		expect(bound).toEqual({ t1: { sessionId: "aaaa-1111", pid: 200, kind: "interactive" } });
	});
});
