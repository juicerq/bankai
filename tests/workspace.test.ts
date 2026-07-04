import { describe, expect, it } from "vitest";
import { type WorkspaceNode, Workspace } from "@main/store/workspace";

const base: WorkspaceNode = {
	sessionId: "s1",
	cwd: "/repo",
	project: "/repo",
	x: 0,
	y: 0,
	width: 100,
	height: 100,
};

describe("workspace", () => {
	it("seeds with an empty canvas when the file is missing", async () => {
		const ws = await Workspace.get();
		expect(ws).toEqual({ viewport: { x: 0, y: 0, zoom: 1 }, nodes: [] });
	});

	it("adds a node and reads it back", async () => {
		await Workspace.addNode(base);
		const ws = await Workspace.get();
		expect(ws.nodes).toEqual([base]);
	});

	it("replaces the node with the same sessionId instead of duplicating", async () => {
		await Workspace.addNode({ ...base, x: 1 });
		const ws = await Workspace.addNode({ ...base, x: 2 });
		expect(ws.nodes).toHaveLength(1);
		expect(ws.nodes[0]?.x).toBe(2);
	});

	it("patches only the matching node on updateNode", async () => {
		await Workspace.addNode({ ...base, sessionId: "a" });
		await Workspace.addNode({ ...base, sessionId: "b" });
		const ws = await Workspace.updateNode({ sessionId: "a", x: 50 });
		expect(ws.nodes.find((n) => n.sessionId === "a")?.x).toBe(50);
		expect(ws.nodes.find((n) => n.sessionId === "b")?.x).toBe(0);
	});

	it("is a no-op when updateNode targets a missing node", async () => {
		await Workspace.addNode({ ...base, sessionId: "a" });
		const ws = await Workspace.updateNode({ sessionId: "missing", x: 9 });
		expect(ws.nodes).toEqual([{ ...base, sessionId: "a" }]);
	});

	it("removes a node by sessionId", async () => {
		await Workspace.addNode({ ...base, sessionId: "a" });
		await Workspace.addNode({ ...base, sessionId: "b" });
		const ws = await Workspace.removeNode("a");
		expect(ws.nodes.map((n) => n.sessionId)).toEqual(["b"]);
	});

	it("persists the viewport across reads", async () => {
		await Workspace.setViewport({ x: 10, y: 20, zoom: 2 });
		const ws = await Workspace.get();
		expect(ws.viewport).toEqual({ x: 10, y: 20, zoom: 2 });
	});
});
