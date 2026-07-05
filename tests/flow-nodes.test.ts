import { describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@main/store/workspace";
import { reconcile } from "../src/renderer/src/routes/-utils/flow-nodes";

const saved: WorkspaceNode = {
	sessionId: "s1",
	cwd: "/repo",
	project: "/repo",
	x: 10,
	y: 20,
	width: 300,
	height: 200,
};

describe("reconcile", () => {
	it("keeps a persisted node with no live pty as a dead node", () => {
		const [node] = reconcile([], [], [saved]);

		expect(node.id).toBe("s1");
		expect(node.data.alive).toBe(false);
		expect(node.position).toEqual({ x: 10, y: 20 });
	});

	it("marks a persisted node with a live pty as alive", () => {
		const [node] = reconcile([], [{ sessionId: "s1", cwd: "/repo" }], [saved]);

		expect(node.data.alive).toBe(true);
	});

	it("revives a dead node to a fresh object when its pty comes back", () => {
		const dead = reconcile([], [], [saved]);
		const revived = reconcile(dead, [{ sessionId: "s1", cwd: "/repo" }], [saved]);

		expect(revived[0]).not.toBe(dead[0]);
		expect(revived[0].data.alive).toBe(true);
	});

	it("preserves node identity when nothing changed", () => {
		const first = reconcile([], [{ sessionId: "s1", cwd: "/repo" }], [saved]);
		const second = reconcile(
			first,
			[{ sessionId: "s1", cwd: "/repo" }],
			[saved],
		);

		expect(second[0]).toBe(first[0]);
	});

	it("shows a just-created live session not yet persisted as an alive orphan", () => {
		const [node] = reconcile([], [{ sessionId: "new", cwd: "/tmp" }], []);

		expect(node.data.alive).toBe(true);
		expect(node.data.cwd).toBe("/tmp");
	});
});
