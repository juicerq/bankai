import { expect, test } from "bun:test";
import type { ContinuityShell, ContinuityValue } from "@main/store/continuity";
import { SESSION_AUTO_ARCHIVE_MS } from "@shared/continuity";
import { ContinuityReducers, nextShellNumber, type ShellName } from "@shared/continuity-reducers";

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
		{ projectId: "p1", shell: { id: "s1" }, now: NOW },
	);

	expect(opened).toEqual({
		selectedShellId: "s1",
		workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: NOW }] }],
	});
});

test("a shell is named one above the highest number its own project holds", () => {
	const before: ContinuityValue = {
		workspaces: [
			{ projectId: "p1", shells: [shell("a1", { label: "Shell 3" }), shell("a2", { label: "deploy watcher" })] },
			{ projectId: "p2", shells: [shell("b1", { label: "Shell 9" })] },
		],
	};

	const opened = ContinuityReducers.openShell(before, { projectId: "p1", shell: { id: "a3" }, now: NOW });

	expect(opened.workspaces[0]?.shells.at(-1)?.label).toBe("Shell 4");
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

	ContinuityReducers.openShell(before, { projectId: "p1", shell: { id: "a3" }, now: NOW });
	ContinuityReducers.closeShell(before, address);
	ContinuityReducers.selectShell(before, address);
	ContinuityReducers.archiveShell(before, address);
	ContinuityReducers.unarchiveShell(before, address);
	ContinuityReducers.renameShell(before, { ...address, title: "psql" });
	ContinuityReducers.nameShell(before, { ...address, title: "psql", source: "model" });
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

const A1 = { projectId: "p1", shellId: "a1" };

const AUTOMATIC_SOURCES: ShellName["source"][] = ["model", "published"];

function oneShell(extra: Partial<ContinuityShell> = {}): ContinuityValue {
	return { workspaces: [{ projectId: "p1", shells: [shell("a1", extra)] }] };
}

function onlyShell(value: ContinuityValue): ContinuityShell | undefined {
	return value.workspaces[0]?.shells[0];
}

test("a name the user typed by hand survives every automatic source", () => {
	const renamed = ContinuityReducers.renameShell(oneShell(), { ...A1, title: "psql" });

	for (const source of AUTOMATIC_SOURCES) {
		expect(ContinuityReducers.nameShell(renamed, { ...A1, title: "outra coisa", source })).toEqual(renamed);
	}
});

test("a model name counts as a naming and a published one does not", () => {
	const model = ContinuityReducers.nameShell(oneShell(), { ...A1, title: "ajusta o header", source: "model" });
	const published = ContinuityReducers.nameShell(oneShell(), { ...A1, title: "ajusta o header", source: "published" });

	expect(onlyShell(model)?.namings).toBe(1);
	expect(onlyShell(published)?.namings).toBeUndefined();
});

test("a published name outranks a model one, which cannot take it back", () => {
	const model = ContinuityReducers.nameShell(oneShell(), { ...A1, title: "modelo", source: "model" });
	const published = ContinuityReducers.nameShell(model, { ...A1, title: "publicado", source: "published" });

	expect(onlyShell(published)?.title).toBe("publicado");
	expect(ContinuityReducers.nameShell(published, { ...A1, title: "modelo", source: "model" })).toEqual(published);
});

test("writing the name a shell already carries counts nothing and changes nothing", () => {
	const model = ContinuityReducers.nameShell(oneShell(), { ...A1, title: "modelo", source: "model" });

	expect(ContinuityReducers.nameShell(model, { ...A1, title: "modelo", source: "model" })).toEqual(model);
});

test("a title stamped before name origins existed is still open to naming", () => {
	const named = ContinuityReducers.nameShell(oneShell({ title: "oi" }), {
		...A1,
		title: "sessao de naming",
		source: "model",
	});

	expect(onlyShell(named)?.title).toBe("sessao de naming");
});

test("the next shell number is one above the highest numbered label, ignoring named ones", () => {
	expect(nextShellNumber([])).toBe(1);
	expect(nextShellNumber([{ label: "Shell 1" }, { label: "Shell 4" }])).toBe(5);
	expect(nextShellNumber([{ label: "deploy watcher" }])).toBe(1);
});
