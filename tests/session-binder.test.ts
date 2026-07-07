import { describe, expect, it } from "vitest";
import { type ProcSource, SessionBinder } from "@core/session/SessionBinder";

type ProcNode = { parent: number | null; files?: string[] };

function nodeAt(tree: Record<number, ProcNode>, pid: number): ProcNode {
	const node = tree[pid];
	if (!node) {
		throw new Error(`no proc ${pid}`);
	}

	return node;
}

function fakeProc(tree: Record<number, ProcNode>): ProcSource {
	return {
		pids: () => Promise.resolve(Object.keys(tree).map(Number)),
		parent: (pid) => Promise.resolve(nodeAt(tree, pid).parent),
		openFiles: (pid) => Promise.resolve(nodeAt(tree, pid).files ?? []),
	};
}

const CWD_DIR = "/home/jui/.claude/projects/-home-jui-app";

describe("SessionBinder.resolve", () => {
	it("binds a shell to the transcript its claude child keeps open", async () => {
		const proc = fakeProc({
			1: { parent: null },
			100: { parent: 1 },
			200: { parent: 100, files: ["/dev/pts/3", `${CWD_DIR}/aaaa-1111.jsonl`] },
		});

		const bound = await SessionBinder.resolve(proc, 100);

		expect(bound?.sessionId).toBe("aaaa-1111");
		expect(bound?.transcriptPath).toBe(`${CWD_DIR}/aaaa-1111.jsonl`);
	});

	it("finds a claude nested below an intermediate process", async () => {
		const proc = fakeProc({
			100: { parent: 1 },
			200: { parent: 100 },
			300: { parent: 200, files: [`${CWD_DIR}/deep-9999.jsonl`] },
		});

		expect((await SessionBinder.resolve(proc, 100))?.sessionId).toBe("deep-9999");
	});

	it("resolves two sessions in the same cwd to distinct session ids", async () => {
		const proc = fakeProc({
			100: { parent: 1 },
			101: { parent: 1 },
			200: { parent: 100, files: [`${CWD_DIR}/aaaa-1111.jsonl`] },
			201: { parent: 101, files: [`${CWD_DIR}/bbbb-2222.jsonl`] },
		});

		expect((await SessionBinder.resolve(proc, 100))?.sessionId).toBe("aaaa-1111");
		expect((await SessionBinder.resolve(proc, 101))?.sessionId).toBe("bbbb-2222");
	});

	it("returns null when the tab has no live claude", async () => {
		const proc = fakeProc({
			100: { parent: 1 },
			200: { parent: 100, files: ["/dev/pts/3", "/home/jui/app/notes.txt"] },
		});

		expect(await SessionBinder.resolve(proc, 100)).toBeNull();
	});

	it("maps a set of tabs to their bound session ids, skipping unbound ones", async () => {
		const proc = fakeProc({
			100: { parent: 1 },
			101: { parent: 1 },
			102: { parent: 1 },
			200: { parent: 100, files: [`${CWD_DIR}/aaaa-1111.jsonl`] },
			201: { parent: 101, files: [`${CWD_DIR}/bbbb-2222.jsonl`] },
		});

		const bound = await SessionBinder.resolveMany(proc, [
			{ tabId: "t1", pid: 100 },
			{ tabId: "t2", pid: 101 },
			{ tabId: "t3", pid: 102 },
		]);

		expect(bound).toEqual({ t1: "aaaa-1111", t2: "bbbb-2222" });
	});

	it("ignores jsonl files outside the claude projects tree", async () => {
		const proc = fakeProc({
			100: { parent: 1 },
			200: { parent: 100, files: ["/home/jui/app/data/other-3333.jsonl"] },
		});

		expect(await SessionBinder.resolve(proc, 100)).toBeNull();
	});
});
