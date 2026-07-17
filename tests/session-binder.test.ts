import { describe, expect, it } from "vitest";
import type { SessionDiscoveryRecord } from "@core/harness/registry";
import { type BindInput, bindTabs } from "@core/session/SessionBinder";

type Node = { parent: number | null; start?: string };

function bind(
	tree: Record<number, Node>,
	records: SessionDiscoveryRecord[],
	foregrounds: BindInput["foregrounds"],
) {
	const children = new Map<number, number[]>();
	const procStartByPid = new Map<number, string | null>();
	for (const [pid, node] of Object.entries(tree)) {
		if (node.start !== undefined) {
			procStartByPid.set(Number(pid), node.start);
		}
		if (node.parent === null) {
			continue;
		}

		const siblings = children.get(node.parent) ?? [];
		siblings.push(Number(pid));
		children.set(node.parent, siblings);
	}

	return bindTabs({ children, records, procStartByPid, foregrounds });
}

describe("bindTabs", () => {
	it("binds only the foreground Harness, including below an intermediary", () => {
		const bound = bind(
			{
				100: { parent: 1 },
				200: { parent: 100 },
				300: { parent: 200, start: "a" },
				400: { parent: 100, start: "b" },
			},
			[
				{ pid: 300, harness: "codex", sessionId: "new", procStart: "a", kind: "interactive" },
				{ pid: 400, harness: "claude", sessionId: "background", procStart: "b", kind: "interactive" },
			],
			[{ tabId: "t", pid: 100, foreground: 200 }],
		);

		expect(bound).toEqual({
			t: { session: { harness: "codex", sessionId: "new" }, pid: 300, kind: "interactive" },
		});
	});

	it("clears the binding when the shell owns foreground", () => {
		expect(bind(
			{ 100: { parent: 1 }, 200: { parent: 100, start: "a" } },
			[{ pid: 200, harness: "claude", sessionId: "old", procStart: "a", kind: "interactive" }],
			[{ tabId: "t", pid: 100, foreground: 100 }],
		)).toEqual({});
	});

	it("rejects a recycled process id whose start no longer matches", () => {
		expect(bind(
			{ 100: { parent: 1 }, 200: { parent: 100, start: "new" } },
			[{ pid: 200, harness: "claude", sessionId: "stale", procStart: "old", kind: "interactive" }],
			[{ tabId: "t", pid: 100, foreground: 200 }],
		)).toEqual({});
	});

	it("clears the binding when the terminal has no foreground", () => {
		expect(bind(
			{ 100: { parent: 1 }, 200: { parent: 100, start: "a" } },
			[{ pid: 200, harness: "claude", sessionId: "old", procStart: "a", kind: "interactive" }],
			[{ tabId: "t", pid: 100, foreground: null }],
		)).toEqual({});
	});

	it("switches Harness when the terminal foreground changes", () => {
		const tree = {
			100: { parent: 1 },
			200: { parent: 100, start: "a" },
			300: { parent: 100, start: "b" },
		};
		const records: SessionDiscoveryRecord[] = [
			{ pid: 200, harness: "claude", sessionId: "claude", procStart: "a", kind: "interactive" },
			{ pid: 300, harness: "codex", sessionId: "codex", procStart: "b", kind: "interactive" },
		];

		expect(bind(tree, records, [{ tabId: "t", pid: 100, foreground: 200 }]).t?.session.harness).toBe("claude");
		expect(bind(tree, records, [{ tabId: "t", pid: 100, foreground: 300 }]).t?.session.harness).toBe("codex");
	});

	it("omits kind for a non-interactive session record", () => {
		const bound = bind(
			{ 100: { parent: 1 }, 200: { parent: 100, start: "a" } },
			[{ pid: 200, harness: "claude", sessionId: "batch", procStart: "a" }],
			[{ tabId: "t", pid: 100, foreground: 200 }],
		);

		expect(bound.t).toEqual({ session: { harness: "claude", sessionId: "batch" }, pid: 200 });
	});
});
