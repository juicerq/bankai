import { expect, test } from "bun:test";
import type { ContinuityValue } from "@main/store/continuity";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";
import { ContinuityReducers, nextShellNumber } from "@shared/continuity-reducers";

const NOW = 1_700_000_000_000;

function workspace(
	shells: { id: string; label: string; createdAt?: number }[],
	activeShellId = shells[0]?.id,
): ContinuityValue {
	return {
		activeProjectId: "p1",
		workspaces: [{ projectId: "p1", activeShellId, shells: shells.map((shell) => ({ createdAt: NOW, ...shell })) }],
	};
}

test("opening a shell mounts an unknown project and stamps the injected clock", () => {
	const opened = ContinuityReducers.openShell(
		{ workspaces: [] },
		{ projectId: "p1", shell: { id: "s1", label: "Shell 1" }, now: NOW },
	);

	expect(opened.workspaces).toEqual([
		{ projectId: "p1", activeShellId: "s1", shells: [{ id: "s1", label: "Shell 1", createdAt: NOW }] },
	]);
});

test("the same value and the same clock always produce the same result", () => {
	const before = workspace([{ id: "s1", label: "Shell 1" }]);
	const input = { projectId: "p1", shellId: "s1", branch: "main", now: NOW };

	expect(ContinuityReducers.touchShell(before, input)).toEqual(ContinuityReducers.touchShell(before, input));
});

test("no reducer mutates the value it was given", () => {
	const before = workspace([{ id: "s1", label: "Shell 1" }, { id: "s2", label: "Shell 2" }]);
	const untouched = structuredClone(before);

	ContinuityReducers.openShell(before, { projectId: "p1", shell: { id: "s3", label: "Shell 3" }, now: NOW });
	ContinuityReducers.closeShell(before, { projectId: "p1", shellId: "s1" });
	ContinuityReducers.selectShell(before, { projectId: "p1", shellId: "s2", now: NOW });
	ContinuityReducers.archiveShell(before, { projectId: "p1", shellId: "s1", now: NOW });
	ContinuityReducers.unarchiveShell(before, { projectId: "p1", shellId: "s1", now: NOW });
	ContinuityReducers.renameShell(before, { projectId: "p1", shellId: "s1", title: "psql" });
	ContinuityReducers.touchShell(before, { projectId: "p1", shellId: "s1", branch: "main", now: NOW });
	ContinuityReducers.clearShellSession(before, { projectId: "p1", shellId: "s1" });
	ContinuityReducers.purgeProject(before, "p1");

	expect(before).toEqual(untouched);
});

test("selecting a shell idle past the archive window files it at the timestamp it was judged by", () => {
	const idleSince = NOW - SESSION_AUTO_ARCHIVE_MS - 1;
	const selected = ContinuityReducers.selectShell(workspace([{ id: "s1", label: "Shell 1", createdAt: idleSince }]), {
		projectId: "p1",
		shellId: "s1",
		now: NOW,
	});

	expect(selected.workspaces[0]?.shells[0]?.archivedAt).toBe(idleSince);
});

test("selecting a shell still inside the archive window leaves it unfiled", () => {
	const selected = ContinuityReducers.selectShell(
		workspace([{ id: "s1", label: "Shell 1", createdAt: NOW - SESSION_AUTO_ARCHIVE_MS }]),
		{ projectId: "p1", shellId: "s1", now: NOW },
	);

	expect(selected.workspaces[0]?.shells[0]?.archivedAt).toBeUndefined();
});

test("closing the active shell hands the selection to its previous neighbor", () => {
	const before = workspace([{ id: "s1", label: "Shell 1" }, { id: "s2", label: "Shell 2" }], "s2");

	expect(ContinuityReducers.closeShell(before, { projectId: "p1", shellId: "s2" }).workspaces[0]?.activeShellId).toBe(
		"s1",
	);
});

test("closing the last shell leaves the workspace with no selection", () => {
	const closed = ContinuityReducers.closeShell(workspace([{ id: "s1", label: "Shell 1" }]), {
		projectId: "p1",
		shellId: "s1",
	});

	expect(closed.workspaces[0]).toEqual({ projectId: "p1", shells: [] });
});

test("purging a project drops the active project only when it was that one", () => {
	const before = workspace([{ id: "s1", label: "Shell 1" }]);

	expect(ContinuityReducers.purgeProject(before, "p1")).toEqual({ workspaces: [] });
	expect(ContinuityReducers.purgeProject(before, "p2").activeProjectId).toBe("p1");
});

test("the next shell number is one above the highest numbered label, ignoring named ones", () => {
	expect(nextShellNumber([])).toBe(1);
	expect(nextShellNumber([{ label: "Shell 1" }, { label: "Shell 4" }])).toBe(5);
	expect(nextShellNumber([{ label: "deploy watcher" }])).toBe(1);
});
