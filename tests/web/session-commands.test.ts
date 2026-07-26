import { afterEach, expect, test } from "bun:test";
import type { ContinuityValue } from "@main/store/continuity";
import { useSessionCommands, type WorkspaceCommands } from "@renderer/routes/-utils/use-session-commands";
import { act, cleanup, renderHook } from "./testing-library";

afterEach(cleanup);

const RESTORED: ContinuityValue = {
	workspaces: [
		{ projectId: "p1", activeShellId: "s1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1 }] },
		{ projectId: "p2", activeShellId: "s2", shells: [{ id: "s2", label: "Shell 1", createdAt: 2 }] },
	],
};

function renderCommands() {
	const activated: string[] = [];
	const persisted: string[] = [];
	const closed: string[] = [];
	const { result } = renderHook(() =>
		useSessionCommands({
			restored: RESTORED,
			onActivateProject: (projectId: string) => activated.push(projectId),
			onPersistSelection: (projectId: string, shellId: string) => persisted.push(`${projectId}/${shellId}`),
			onPersistClose: (projectId: string, shellId: string) => closed.push(`${projectId}/${shellId}`),
		})
	);

	return { result, activated, persisted, closed };
}

function spyWorkspace() {
	const calls: string[] = [];
	const commands: WorkspaceCommands = {
		selectShell: (shellId) => calls.push(`select:${shellId}`),
		openShell: (plain) => calls.push(plain ? "open:plain" : "open"),
		closeShell: (shellId) => calls.push(`close:${shellId}`),
	};

	return { calls, commands };
}

test("the pushed value seeds the selection of every workspace", () => {
	const { result } = renderCommands();

	expect(result.current.byProject).toEqual({ p1: "s1", p2: "s2" });
});

test("selecting in an unmounted project persists and activates it", () => {
	const { result, activated, persisted } = renderCommands();

	act(() => result.current.selectSession("p2", "other"));

	expect(result.current.byProject.p2).toBe("other");
	expect(persisted).toEqual(["p2/other"]);
	expect(activated).toEqual(["p2"]);
});

test("selecting in a mounted project goes through its registered command", () => {
	const { result, activated, persisted } = renderCommands();
	const workspace = spyWorkspace();

	act(() => {
		result.current.registerWorkspace("p2", workspace.commands);
	});
	act(() => result.current.selectSession("p2", "other"));

	expect(workspace.calls).toEqual(["select:other"]);
	expect(persisted).toEqual([]);
	expect(activated).toEqual(["p2"]);
});

test("an unmounted workspace stops answering commands", () => {
	const { result, persisted } = renderCommands();
	const workspace = spyWorkspace();
	let unregister = () => {};

	act(() => {
		unregister = result.current.registerWorkspace("p2", workspace.commands);
	});
	act(() => unregister());
	act(() => result.current.selectSession("p2", "other"));

	expect(workspace.calls).toEqual([]);
	expect(persisted).toEqual(["p2/other"]);
});

test("a workspace reports the selection it made itself", () => {
	const { result } = renderCommands();

	act(() => result.current.noteSelection("p1", "s9"));

	expect(result.current.byProject.p1).toBe("s9");
});

test("creating in a mounted project opens through its command", () => {
	const { result, activated } = renderCommands();
	const workspace = spyWorkspace();

	act(() => {
		result.current.registerWorkspace("p1", workspace.commands);
	});
	act(() => result.current.createSession("p1", false));

	expect(workspace.calls).toEqual(["open"]);
	expect(activated).toEqual(["p1"]);
});

test("creating in an unmounted project activates it and waits for it to mount", () => {
	const { result, activated } = renderCommands();
	const workspace = spyWorkspace();

	act(() => result.current.createSession("p2", false));

	expect(activated).toEqual(["p2"]);
	expect(workspace.calls).toEqual([]);

	act(() => {
		result.current.registerWorkspace("p2", workspace.commands);
	});

	expect(workspace.calls).toEqual(["open"]);
});

test("a shell asked for without a harness carries that through the queue", () => {
	const { result } = renderCommands();
	const workspace = spyWorkspace();

	act(() => result.current.createSession("p2", true));
	act(() => {
		result.current.registerWorkspace("p2", workspace.commands);
	});

	expect(workspace.calls).toEqual(["open:plain"]);
});

test("a workspace mounting a second time does not open again", () => {
	const { result } = renderCommands();
	const workspace = spyWorkspace();

	act(() => result.current.createSession("p2", false));
	act(() => {
		result.current.registerWorkspace("p2", workspace.commands);
	});
	act(() => {
		result.current.registerWorkspace("p2", workspace.commands);
	});

	expect(workspace.calls).toEqual(["open"]);
});

test("closing in a mounted project goes through its command", () => {
	const { result, closed } = renderCommands();
	const workspace = spyWorkspace();

	act(() => {
		result.current.registerWorkspace("p1", workspace.commands);
	});
	act(() => result.current.closeSession("p1", "s1"));

	expect(workspace.calls).toEqual(["close:s1"]);
	expect(closed).toEqual([]);
});

test("closing in an unmounted project writes straight to continuity", () => {
	const { result, closed } = renderCommands();

	act(() => result.current.closeSession("p2", "s2"));

	expect(closed).toEqual(["p2/s2"]);
});
