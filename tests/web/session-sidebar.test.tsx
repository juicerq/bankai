import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import type { Project } from "@shared/projects";
import type { ProjectMarks } from "@renderer/routes/-features/projects/use-project-narrowing";
import type { AgentActivityState } from "@shared/activity";
import { SessionSidebar } from "@renderer/routes/-features/sessions/list/session-sidebar";
import { ACTIVITY_LABEL } from "@renderer/routes/-features/sessions/list/agent-activity";
import type { SessionRow } from "@renderer/routes/-features/sessions/list/session-rows";
import { searchSessions } from "@renderer/routes/-features/sessions/list/session-search";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const NOW = 1_800_000_000_000;

const DOGAMA: Project = { id: "p2", name: "dogama", path: "/projects/dogama", createdAt: 1, reviewClosedTargets: [] };
const BANKAI: Project = { id: "p1", name: "bankai", path: "/projects/bankai", createdAt: 2, reviewClosedTargets: [] };
const PROJECTS = [DOGAMA, BANKAI];

function row(shellId: string, patch: Partial<SessionRow> = {}): SessionRow {
	return {
		shellId,
		projectId: "p1",
		projectName: "bankai",
		title: shellId,
		branch: undefined,
		harness: undefined,
		createdAt: NOW,
		lastTouchedAt: NOW,
		archivedAt: undefined,
		pinnedAt: undefined,
		activity: undefined,
		since: undefined,
		...patch,
	};
}

function renderSidebar(
	sections: { open?: SessionRow[]; archived?: SessionRow[] },
	handlers: {
		onSelect?: (projectId: string, shellId: string) => void;
		onCreate?: (projectId: string) => void;
		onClose?: (projectId: string, shellId: string) => void;
		onArchive?: (projectId: string, shellId: string) => void;
		onUnarchive?: (projectId: string, shellId: string) => void;
		onPin?: (projectId: string, shellId: string) => void;
		onUnpin?: (projectId: string, shellId: string) => void;
		onRename?: (projectId: string, shellId: string, title: string) => void;
		onRequestShell?: (plain: boolean) => void;
		onAddProject?: () => void;
		onToggleProject?: (projectId: string) => void;
		onExcludeProject?: (projectId: string) => void;
		canCreateShell?: boolean;
		projects?: Project[];
		projectMarks?: ProjectMarks;
	} = {},
) {
	function Harness() {
		const [archivedOpen, setArchivedOpen] = useState(true);
		const [term, setTerm] = useState("");
		const open = searchSessions(sections.open ?? [], term);
		const archived = searchSessions(sections.archived ?? [], term);

		return (
			<SessionSidebar
				list={{
					open,
					archived,
					numbered: [...open, ...(archivedOpen ? archived : [])].slice(0, 9),
					openProjectIds: new Set(open.map((entry) => entry.projectId)),
					waiting: open.find((entry) => entry.activity === "needs-attention"),
					archivedOpen,
					toggleArchived: () => setArchivedOpen((current) => !current),
					term,
					searching: term.trim().length > 0,
					onSearch: setTerm,
				}}
				projects={handlers.projects ?? PROJECTS}
				projectMarks={handlers.projectMarks ?? new Map()}
				selectedShellId={undefined}
				canCreateShell={handlers.canCreateShell ?? true}
				onSelect={handlers.onSelect ?? (() => {})}
				onCreate={handlers.onCreate ?? (() => {})}
				onRequestShell={handlers.onRequestShell ?? (() => {})}
				onAddProject={handlers.onAddProject ?? (() => {})}
				onToggleProject={handlers.onToggleProject ?? (() => {})}
				onExcludeProject={handlers.onExcludeProject ?? (() => {})}
				onClose={handlers.onClose ?? (() => {})}
				onArchive={handlers.onArchive ?? (() => {})}
				onUnarchive={handlers.onUnarchive ?? (() => {})}
				onPin={handlers.onPin ?? (() => {})}
				onUnpin={handlers.onUnpin ?? (() => {})}
				onRename={handlers.onRename ?? (() => {})}
				footer={null}
			/>
		);
	}

	return render(<Harness />);
}

function sessionRow(shellId: string) {
	return get("session-row", { shellId });
}

function openProjectFilter() {
	fireEvent.click(slot(get("session-sidebar"), "project-filter"));
}

function projectChoices() {
	return [...get("project-narrowing").querySelectorAll<HTMLElement>('[data-component="project-choice"]')];
}

function projectChoiceNames() {
	return projectChoices().map((choice) => choice.querySelector("span > span")?.textContent);
}

function menuItems() {
	return [...get("session-row-menu").querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

function menuItem(label: string) {
	const match = menuItems().find((item) => item.textContent === label);

	if (!match) {
		throw new Error(`Expected a ${label} menu item`);
	}

	return match;
}

test("an open session renders as a card carrying project, title and harness", () => {
	renderSidebar({
		open: [
			row("s1", {
				title: "flatten the sidebar",
				branch: "sessions-first-sidebar",
				harness: "claude",
			}),
		],
	});

	const card = sessionRow("s1");

	expect(card.textContent).toContain("flatten the sidebar");
	expect(card.textContent).toContain("bankai");
	expect(card.querySelector("[aria-label='Claude']")).not.toBeNull();
	expect(slot(card, "session-state").textContent).toBe("sessions-first-sidebar");
});

test("a session with no activity keeps the card it had, only quieter", () => {
	renderSidebar({ open: [row("s1", { title: "psql", branch: "main" })] });

	const card = sessionRow("s1");

	expect(card.dataset.activity).toBeUndefined();
	expect(card.dataset.archived).toBeUndefined();
	expect(slot(card, "session-branch").className).toContain("text-outline-strong");
});

test("a running session keeps its branch beside the state", () => {
	renderSidebar({
		open: [row("s1", { branch: "main", activity: "working" })],
	});

	const card = sessionRow("s1");

	expect(slot(card, "session-branch").textContent).toBe("main");
	expect(slot(card, "session-activity").textContent).toBe(ACTIVITY_LABEL.working);
	expect(slot(card, "session-activity").className).toContain("text-tertiary");
});

test("a running session says how long it has been working", () => {
	renderSidebar({
		open: [row("s1", { activity: "working", since: Date.now() - 74_000 })],
	});

	expect(slot(sessionRow("s1"), "session-elapsed").textContent).toContain("1m");
});

test("a state stamped ahead of the clock reads as zero, never as a negative", () => {
	renderSidebar({
		open: [row("s1", { activity: "working", since: Date.now() + 5000 })],
	});

	expect(slot(sessionRow("s1"), "session-elapsed").textContent).toContain("0s");
});

test("a session the harness gave no clock for shows the state alone", () => {
	renderSidebar({ open: [row("s1", { activity: "working" })] });

	expect(sessionRow("s1").querySelector('[data-slot="session-elapsed"]')).toBeNull();
});

test("a state each session can be in paints its own border", () => {
	const states: AgentActivityState[] = ["working", "needs-attention", "done"];
	renderSidebar({ open: states.map((activity, index) => row(`s${index}`, { activity })) });

	expect(sessionRow("s0").className).toContain("border-l-tertiary");
	expect(sessionRow("s1").className).toContain("border-l-terminal-blue");
	expect(sessionRow("s2").className).toContain("border-l-added");
});

test("the search row leaves the session count out", () => {
	renderSidebar({ open: [row("a"), row("b")], archived: [row("filed", { archivedAt: NOW })] });

	expect(get("session-sidebar").querySelector('[data-slot="session-count"]')).toBeNull();
});

test("the filter lists the projects in project order", () => {
	renderSidebar({ open: [row("s1"), row("s2", { projectId: "p2", projectName: "dogama" })] });
	openProjectFilter();

	expect(projectChoiceNames()).toEqual(["bankai", "dogama"]);
	expect(projectChoices().every((choice) => choice.getAttribute("aria-checked") === "false")).toBe(true);
});

test("the project filter opens as a menu and closes again", () => {
	renderSidebar({ open: [row("s1"), row("s2", { projectId: "p2", projectName: "dogama" })] });

	expect(query("project-narrowing")).toBeNull();

	openProjectFilter();

	expect(get("project-narrowing").className).toContain("fixed");

	openProjectFilter();

	expect(query("project-narrowing")).toBeNull();
});

test("a project with nothing but archived sessions leaves the header", () => {
	renderSidebar({
		open: [row("s1")],
		archived: [row("s2", { projectId: "p2", projectName: "dogama", archivedAt: NOW })],
	});

	expect(query("project-filter")).toBeNull();
});

test("a chosen project stays in the filter after its last session is archived", () => {
	renderSidebar({
		open: [row("s1")],
		archived: [row("s2", { projectId: "p2", projectName: "dogama", archivedAt: NOW })],
	}, { projectMarks: new Map([["p2", "chosen"]]) });
	openProjectFilter();

	expect(projectChoiceNames()).toEqual(["bankai", "dogama"]);
});

test("clicking a project choice names its project instead of touching the sessions", () => {
	const toggled: string[] = [];
	const selected: string[] = [];
	renderSidebar({ open: [row("s1"), row("s2", { projectId: "p2", projectName: "dogama" })] }, {
		onToggleProject: (projectId) => toggled.push(projectId),
		onSelect: (projectId, shellId) => selected.push(`${projectId}/${shellId}`),
	});
	openProjectFilter();

	fireEvent.click(get("project-choice", { projectId: "p2" }));

	expect(toggled).toEqual(["p2"]);
	expect(selected).toEqual([]);
});

test("a chosen project choice reads as checked", () => {
	renderSidebar({ open: [row("s1"), row("s2", { projectId: "p2", projectName: "dogama" })] }, {
		projectMarks: new Map([["p1", "chosen"]]),
	});
	openProjectFilter();

	expect(get("project-choice", { projectId: "p1" }).getAttribute("aria-checked")).toBe("true");
	expect(get("project-choice", { projectId: "p2" }).getAttribute("aria-checked")).toBe("false");
});

test("an empty list asks for a session without naming a project", () => {
	let requests = 0;
	renderSidebar({}, { onRequestShell: () => (requests += 1) });

	fireEvent.click(slot(get("session-sidebar"), "start-session"));

	expect(requests).toBe(1);
});

test("a list with sessions in it asks for nothing", () => {
	renderSidebar({ open: [row("s1")] });

	expect(get("session-sidebar").querySelector('[data-slot="start-session"]')).toBeNull();
});

test("with no project mounted there is no session to ask for", () => {
	renderSidebar({}, { canCreateShell: false });

	expect(get("session-sidebar").querySelector('[data-slot="start-session"]')).toBeNull();
});

test("a single project has nothing to narrow, so no filter button appears", () => {
	renderSidebar({ open: [row("s1")] }, { projects: [BANKAI] });

	expect(get("session-sidebar").querySelector('[data-slot="project-filter"]')).toBeNull();
});

test("an empty archive means no archive section", () => {
	renderSidebar({ open: [row("s1")] });

	expect(query("session-shelf")).toBeNull();
});

test("the archive collapses and hides its rows", () => {
	renderSidebar({ open: [row("s1")], archived: [row("s2", { archivedAt: NOW })] });

	expect(query("session-row", { shellId: "s2" })).not.toBeNull();

	fireEvent.click(get("session-shelf"));

	expect(query("session-row", { shellId: "s2" })).toBeNull();
});

test("an archived session renders slim, with no state line and nothing left to archive", () => {
	renderSidebar({ archived: [row("s1", { archivedAt: NOW, branch: "main" })] });

	const filed = sessionRow("s1");

	expect(filed.dataset.archived).toBe("");
	expect(filed.querySelector('[data-slot="session-state"]')).toBeNull();
	expect(filed.querySelector('[data-slot="archive-session"]')).toBeNull();
});

test("clicking an archived row opens it and leaves it in the archive", () => {
	const selected: string[] = [];
	const unarchived: string[] = [];
	renderSidebar({ archived: [row("s1", { projectId: "p2", archivedAt: NOW })] }, {
		onSelect: (projectId, shellId) => selected.push(`${projectId}/${shellId}`),
		onUnarchive: (projectId, shellId) => unarchived.push(`${projectId}/${shellId}`),
	});

	fireEvent.click(slot(sessionRow("s1"), "open-session"));

	expect(selected).toEqual(["p2/s1"]);
	expect(unarchived).toEqual([]);
});

test("the archived row's own button is the only way back to the open list", () => {
	const unarchived: string[] = [];
	renderSidebar({ archived: [row("s1", { projectId: "p2", archivedAt: NOW })] }, {
		onUnarchive: (projectId, shellId) => unarchived.push(`${projectId}/${shellId}`),
	});

	fireEvent.click(slot(sessionRow("s1"), "unarchive-session"));

	expect(unarchived).toEqual(["p2/s1"]);
});

test("an open row offers no way to unarchive what is not archived", () => {
	renderSidebar({ open: [row("s1")] });

	expect(sessionRow("s1").querySelector('[data-slot="unarchive-session"]')).toBeNull();
});

test("the archived row's menu swaps archive for unarchive", () => {
	const unarchived: string[] = [];
	renderSidebar({ archived: [row("s1", { projectId: "p2", archivedAt: NOW })] }, {
		onUnarchive: (projectId, shellId) => unarchived.push(`${projectId}/${shellId}`),
	});

	fireEvent.contextMenu(sessionRow("s1"));

	expect(menuItems().map((item) => item.textContent)).toEqual([
		"New shell in this project",
		"Rename",
		"Unarchive",
		"Close",
	]);

	fireEvent.click(menuItem("Unarchive"));

	expect(unarchived).toEqual(["p2/s1"]);
});

test("clicking a row hands back the project it belongs to", () => {
	const selected: string[] = [];
	renderSidebar({ open: [row("s1", { projectId: "p2" })] }, {
		onSelect: (projectId, shellId) => selected.push(`${projectId}/${shellId}`),
	});

	fireEvent.click(slot(sessionRow("s1"), "open-session"));

	expect(selected).toEqual(["p2/s1"]);
});

test("the header plus asks for a shell instead of naming a project itself", () => {
	const created: string[] = [];
	let requests = 0;
	renderSidebar(
		{ open: [row("s1")] },
		{ onCreate: (projectId) => created.push(projectId), onRequestShell: () => (requests += 1) },
	);

	fireEvent.click(slot(document.body, "new-session"));

	expect(requests).toBe(1);
	expect(created).toEqual([]);
});

test("the header folder asks to add a project", () => {
	let requests = 0;
	renderSidebar({ open: [row("s1")] }, { onAddProject: () => (requests += 1) });

	fireEvent.click(slot(document.body, "add-project"));

	expect(requests).toBe(1);
});

test("the header plus asks for a shell with no harness while Alt is held", () => {
	const asked: boolean[] = [];
	renderSidebar({ open: [row("s1")] }, { onRequestShell: (plain) => asked.push(plain) });

	fireEvent.click(slot(document.body, "new-session"), { altKey: true });
	fireEvent.click(slot(document.body, "new-session"));

	expect(asked).toEqual([true, false]);
});

test("the header plus is dead while no project is mounted", () => {
	let requests = 0;
	renderSidebar({}, { onRequestShell: () => (requests += 1), canCreateShell: false });

	fireEvent.click(slot(document.body, "new-session"));

	expect(requests).toBe(0);
});

test("the row cross closes without confirmation", () => {
	const closed: string[] = [];
	renderSidebar({ open: [row("s1", { projectId: "p2" })] }, {
		onClose: (projectId, shellId) => closed.push(`${projectId}/${shellId}`),
	});

	fireEvent.click(slot(sessionRow("s1"), "close-session"));

	expect(closed).toEqual(["p2/s1"]);
});

test("the row archive box files the session without closing it", () => {
	const archived: string[] = [];
	const closed: string[] = [];
	renderSidebar({ open: [row("s1", { projectId: "p2" })] }, {
		onArchive: (projectId, shellId) => archived.push(`${projectId}/${shellId}`),
		onClose: (projectId, shellId) => closed.push(`${projectId}/${shellId}`),
	});

	fireEvent.click(slot(sessionRow("s1"), "archive-session"));

	expect(archived).toEqual(["p2/s1"]);
	expect(closed).toEqual([]);
});

test("the row bookmark pins the session and the row then offers to unpin it", () => {
	const pinned: string[] = [];
	const unpinned: string[] = [];
	const handlers = {
		onPin: (projectId: string, shellId: string) => pinned.push(`${projectId}/${shellId}`),
		onUnpin: (projectId: string, shellId: string) => unpinned.push(`${projectId}/${shellId}`),
	};

	renderSidebar({ open: [row("s1", { projectId: "p2" })] }, handlers);
	fireEvent.click(slot(sessionRow("s1"), "pin-session"));

	expect(pinned).toEqual(["p2/s1"]);

	cleanup();
	renderSidebar({ open: [row("s1", { projectId: "p2", pinnedAt: NOW })] }, handlers);
	fireEvent.click(slot(sessionRow("s1"), "unpin-session"));

	expect(unpinned).toEqual(["p2/s1"]);
});

test("a pinned row carries its mark and an archived row offers no pin at all", () => {
	renderSidebar({ open: [row("s1", { pinnedAt: NOW })], archived: [row("s2", { archivedAt: NOW })] });

	expect(slot(sessionRow("s1"), "pinned-mark")).toBeDefined();
	expect(sessionRow("s2").querySelector('[data-slot="pin-session"]')).toBeNull();
});

test("the menu of a pinned row offers to unpin it", () => {
	renderSidebar({ open: [row("s1", { pinnedAt: NOW })] });

	fireEvent.contextMenu(sessionRow("s1"));

	expect(menuItems().map((item) => item.textContent)).toContain("Unpin");
});

test("the row menu holds new shell, rename, pin, archive and close", () => {
	renderSidebar({ open: [row("s1")] });

	fireEvent.contextMenu(sessionRow("s1"));

	expect(menuItems().map((item) => item.textContent)).toEqual([
		"New shell in this project",
		"Rename",
		"Pin",
		"Archive",
		"Close",
	]);
});

test("archive from the menu files that row's session", () => {
	const archived: string[] = [];
	renderSidebar({ open: [row("s1", { projectId: "p3" })] }, {
		onArchive: (projectId, shellId) => archived.push(`${projectId}/${shellId}`),
	});

	fireEvent.contextMenu(sessionRow("s1"));
	fireEvent.click(menuItem("Archive"));

	expect(archived).toEqual(["p3/s1"]);
});

test("new shell in this project creates in that row's project", () => {
	const created: string[] = [];
	const selected: string[] = [];
	renderSidebar({ open: [row("s1", { projectId: "p3" })] }, {
		onCreate: (projectId) => created.push(projectId),
		onSelect: (projectId, shellId) => selected.push(`${projectId}/${shellId}`),
	});

	fireEvent.contextMenu(sessionRow("s1"));
	fireEvent.click(menuItem("New shell in this project"));

	expect(created).toEqual(["p3"]);
	expect(selected).toEqual([]);
});

test("rename commits the typed name on Enter", () => {
	const renamed: string[] = [];
	renderSidebar({ open: [row("s1", { projectId: "p2", title: "Shell 1" })] }, {
		onRename: (projectId, shellId, title) => renamed.push(`${projectId}/${shellId}/${title}`),
	});

	fireEvent.contextMenu(sessionRow("s1"));
	fireEvent.click(menuItem("Rename"));

	const input = slot(sessionRow("s1"), "rename-session");
	fireEvent.change(input, { target: { value: "deploy watcher" } });
	fireEvent.keyDown(input, { key: "Enter" });

	expect(renamed).toEqual(["p2/s1/deploy watcher"]);
	expect(sessionRow("s1").querySelector('[data-slot="rename-session"]')).toBeNull();
});

test("escape leaves the name alone", () => {
	const renamed: string[] = [];
	renderSidebar({ open: [row("s1")] }, { onRename: (_p, _s, title) => renamed.push(title) });

	fireEvent.contextMenu(sessionRow("s1"));
	fireEvent.click(menuItem("Rename"));

	const input = slot(sessionRow("s1"), "rename-session");
	fireEvent.change(input, { target: { value: "nope" } });
	fireEvent.keyDown(input, { key: "Escape" });

	expect(renamed).toEqual([]);
});

test("a double click on a row does not start a rename", () => {
	renderSidebar({ open: [row("s1")] });

	fireEvent.doubleClick(slot(sessionRow("s1"), "open-session"));

	expect(sessionRow("s1").querySelector('[data-slot="rename-session"]')).toBeNull();
});

test("session rows leave shortcut numbers out of project names", () => {
	renderSidebar({ open: [row("s1", { harness: "codex" })], archived: [row("s2", { archivedAt: NOW })] });

	expect(sessionRow("s1").textContent).not.toContain("alt +");
	expect(sessionRow("s2").textContent).not.toContain("alt +");
	expect(sessionRow("s1").querySelector("[aria-label='Codex']")).not.toBeNull();
});

function searchInput() {
	const input = slot(document.body, "session-search-input");

	if (!(input instanceof HTMLInputElement)) {
		throw new Error("Expected the session search to be an input");
	}

	return input;
}

function listedShellIds() {
	return [...document.querySelectorAll<HTMLElement>('[data-component="session-row"]')]
		.map((entry) => entry.dataset.shellId);
}

test("the search narrows the open list and the archive alike", () => {
	renderSidebar({
		open: [row("s1", { title: "flatten the sidebar" }), row("s2", { title: "psql" })],
		archived: [row("s3", { title: "sidebar spike", archivedAt: NOW })],
	});

	fireEvent.input(searchInput(), { target: { value: "sidebar" } });

	expect(listedShellIds()).toEqual(["s1", "s3"]);
});

test("a search that matches nothing says so instead of showing an empty list", () => {
	renderSidebar({ open: [row("s1", { title: "psql" })] });

	fireEvent.input(searchInput(), { target: { value: "nothing here" } });

	expect(listedShellIds()).toEqual([]);
	expect(slot(document.body, "no-match").textContent).toContain("nothing here");
	expect(query("session-sidebar")?.querySelector('[data-slot="start-session"]')).toBeNull();
});

test("clearing the search puts every session back", () => {
	renderSidebar({ open: [row("s1", { title: "flatten the sidebar" }), row("s2", { title: "psql" })] });

	fireEvent.input(searchInput(), { target: { value: "psql" } });
	fireEvent.click(slot(document.body, "clear-session-search"));

	expect(searchInput().value).toBe("");
	expect(listedShellIds()).toEqual(["s1", "s2"]);
});

test("Escape clears the search the same way the button does", () => {
	renderSidebar({ open: [row("s1"), row("s2")] });

	fireEvent.input(searchInput(), { target: { value: "s1" } });
	fireEvent.keyDown(searchInput(), { key: "Escape" });

	expect(listedShellIds()).toEqual(["s1", "s2"]);
});

test("clicking a chosen project hides that project alone", () => {
	const excluded: string[] = [];
	renderSidebar({ open: [row("s1"), row("s2", { projectId: "p2", projectName: "dogama" })] }, {
		onExcludeProject: (projectId) => excluded.push(projectId),
		projectMarks: new Map([["p2", "chosen"]]),
	});
	openProjectFilter();

	fireEvent.click(get("project-choice", { projectId: "p2" }));

	expect(excluded).toEqual(["p2"]);
});

test("a hidden project reads as struck out and stays in the filter", () => {
	renderSidebar({ open: [row("s1"), row("s2", { projectId: "p2", projectName: "dogama" })] }, {
		projectMarks: new Map([["p2", "excluded"]]),
	});
	openProjectFilter();

	const hidden = get("project-choice", { projectId: "p2" });

	expect(hidden.dataset.mark).toBe("excluded");
	expect(hidden.innerHTML).toContain("line-through");
	expect(hidden.getAttribute("aria-checked")).toBe("false");
});
