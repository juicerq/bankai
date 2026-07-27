import { expect, test } from "bun:test";
import type { ContinuityShell, ContinuityValue } from "@main/store/continuity";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";
import { ContinuityReducers, nextShellNumber } from "@shared/continuity-reducers";

const NOW = 1_700_000_000_000;

function shell(id: string, extra: Partial<ContinuityShell> = {}): ContinuityShell {
	return { id, label: id, createdAt: NOW, ...extra };
}

function twoProjects(selectedShellId: string, ...shells: ContinuityShell[]): ContinuityValue {
	return {
		selectedShellId,
		workspaces: [
			{ projectId: "p1", shells: shells.filter((entry) => entry.id.startsWith("a")) },
			{ projectId: "p2", shells: shells.filter((entry) => entry.id.startsWith("b")) },
		],
	};
}

const OWN_AND_NEIGHBOUR = twoProjects(
	"a2",
	shell("a1", { createdAt: NOW - 3 }),
	shell("a2", { createdAt: NOW - 2 }),
	shell("b1", { createdAt: NOW - 1 }),
);

test("opening a shell mounts an unknown project, stamps the injected clock and selects it", () => {
	const opened = ContinuityReducers.openShell(
		{ workspaces: [] },
		{ projectId: "p1", shell: { id: "s1", label: "Shell 1" }, now: NOW },
	);

	expect(opened).toEqual({
		selectedShellId: "s1",
		workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: NOW }] }],
	});
});

test("the same value and the same clock always produce the same result", () => {
	const input = { projectId: "p1", shellId: "a1", branch: "main", now: NOW };

	expect(ContinuityReducers.touchShell(OWN_AND_NEIGHBOUR, input)).toEqual(
		ContinuityReducers.touchShell(OWN_AND_NEIGHBOUR, input),
	);
});

test("no reducer mutates the value it was given", () => {
	const before = OWN_AND_NEIGHBOUR;
	const untouched = structuredClone(before);
	const address = { projectId: "p1", shellId: "a1", now: NOW };

	ContinuityReducers.openShell(before, { projectId: "p1", shell: { id: "a3", label: "Shell 3" }, now: NOW });
	ContinuityReducers.closeShell(before, address);
	ContinuityReducers.selectShell(before, address);
	ContinuityReducers.archiveShell(before, address);
	ContinuityReducers.unarchiveShell(before, address);
	ContinuityReducers.renameShell(before, { ...address, title: "psql" });
	ContinuityReducers.touchShell(before, { ...address, branch: "main" });
	ContinuityReducers.clearShellSession(before, address);
	ContinuityReducers.purgeProject(before, { projectId: "p1", now: NOW });

	expect(before).toEqual(untouched);
});

test("selecting a shell idle past the archive window files it at the timestamp it was judged by", () => {
	const idle = NOW - SESSION_AUTO_ARCHIVE_MS - 1;
	const selected = ContinuityReducers.selectShell(twoProjects("b1", shell("a1", { createdAt: idle })), {
		projectId: "p1",
		shellId: "a1",
		now: NOW,
	});

	expect(selected.selectedShellId).toBe("a1");
	expect(selected.workspaces[0]?.shells[0]?.archivedAt).toBe(idle);
});

test("selecting a shell still inside the archive window leaves it unfiled", () => {
	const selected = ContinuityReducers.selectShell(
		twoProjects("b1", shell("a1", { createdAt: NOW - SESSION_AUTO_ARCHIVE_MS })),
		{ projectId: "p1", shellId: "a1", now: NOW },
	);

	expect(selected.workspaces[0]?.shells[0]?.archivedAt).toBeUndefined();
});

test("selecting a shell the workspace does not own changes nothing", () => {
	expect(ContinuityReducers.selectShell(OWN_AND_NEIGHBOUR, { projectId: "p1", shellId: "b1", now: NOW })).toEqual(
		OWN_AND_NEIGHBOUR,
	);
});

test("closing the selected shell hands the selection to its own project", () => {
	const closed = ContinuityReducers.closeShell(OWN_AND_NEIGHBOUR, { projectId: "p1", shellId: "a2", now: NOW });

	expect(closed.selectedShellId).toBe("a1");
	expect(closed.workspaces[0]?.shells.map((entry) => entry.id)).toEqual(["a1"]);
});

test("closing the last open shell of a project reaches the newest session anywhere", () => {
	const closed = ContinuityReducers.closeShell(
		twoProjects("a1", shell("a1"), shell("b1", { createdAt: NOW - 2 }), shell("b2", { createdAt: NOW - 1 })),
		{ projectId: "p1", shellId: "a1", now: NOW },
	);

	expect(closed.selectedShellId).toBe("b2");
});

test("an archived session of the same project loses to an open one elsewhere", () => {
	const closed = ContinuityReducers.closeShell(
		twoProjects("a2", shell("a1", { archivedAt: NOW }), shell("a2"), shell("b1")),
		{ projectId: "p1", shellId: "a2", now: NOW },
	);

	expect(closed.selectedShellId).toBe("b1");
});

test("a session left idle past the window loses like an archived one", () => {
	const closed = ContinuityReducers.closeShell(
		twoProjects("a2", shell("a1", { createdAt: NOW - SESSION_AUTO_ARCHIVE_MS - 1 }), shell("a2"), shell("b1")),
		{ projectId: "p1", shellId: "a2", now: NOW },
	);

	expect(closed.selectedShellId).toBe("b1");
});

test("with nothing open left the selection still lands on a filed session of its own project", () => {
	const closed = ContinuityReducers.closeShell(
		twoProjects("a2", shell("a1", { archivedAt: NOW }), shell("a2"), shell("b1", { archivedAt: NOW })),
		{ projectId: "p1", shellId: "a2", now: NOW },
	);

	expect(closed.selectedShellId).toBe("a1");
});

test("closing the last session anywhere leaves no selection", () => {
	const closed = ContinuityReducers.closeShell(twoProjects("a1", shell("a1")), {
		projectId: "p1",
		shellId: "a1",
		now: NOW,
	});

	expect(closed).toEqual({ workspaces: [{ projectId: "p1", shells: [] }, { projectId: "p2", shells: [] }] });
});

test("closing a session nobody selected leaves the selection where it was", () => {
	const closed = ContinuityReducers.closeShell(OWN_AND_NEIGHBOUR, { projectId: "p1", shellId: "a1", now: NOW });

	expect(closed.selectedShellId).toBe("a2");
});

test("archiving the selected session hands the selection over the same way", () => {
	const archived = ContinuityReducers.archiveShell(OWN_AND_NEIGHBOUR, { projectId: "p1", shellId: "a2", now: NOW });

	expect(archived.selectedShellId).toBe("a1");
	expect(archived.workspaces[0]?.shells[1]?.archivedAt).toBe(NOW);
});

test("archiving a session nobody selected leaves the selection where it was", () => {
	const archived = ContinuityReducers.archiveShell(OWN_AND_NEIGHBOUR, { projectId: "p1", shellId: "a1", now: NOW });

	expect(archived.selectedShellId).toBe("a2");
});

test("purging the project that owned the selection hands it to another project", () => {
	const purged = ContinuityReducers.purgeProject(OWN_AND_NEIGHBOUR, { projectId: "p1", now: NOW });

	expect(purged.selectedShellId).toBe("b1");
	expect(purged.workspaces.map((workspace) => workspace.projectId)).toEqual(["p2"]);
});

test("purging any other project leaves the selection alone", () => {
	const purged = ContinuityReducers.purgeProject(OWN_AND_NEIGHBOUR, { projectId: "p2", now: NOW });

	expect(purged.selectedShellId).toBe("a2");
});

test("purging the last project with sessions leaves no selection", () => {
	const purged = ContinuityReducers.purgeProject(twoProjects("a1", shell("a1")), { projectId: "p1", now: NOW });

	expect(purged).toEqual({ workspaces: [{ projectId: "p2", shells: [] }] });
});

test("the next shell number is one above the highest numbered label, ignoring named ones", () => {
	expect(nextShellNumber([])).toBe(1);
	expect(nextShellNumber([{ label: "Shell 1" }, { label: "Shell 4" }])).toBe(5);
	expect(nextShellNumber([{ label: "deploy watcher" }])).toBe(1);
});
