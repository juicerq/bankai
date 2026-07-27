import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import type { Project } from "@main/store/projects";
import type { AgentActivityState } from "@shared/activity";
import { SessionSidebar } from "@renderer/routes/-components/session-sidebar";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const NOW = 1_800_000_000_000;

const DOGAMA: Project = { id: "p2", name: "dogama", path: "/projects/dogama", createdAt: 1 };
const BANKAI: Project = { id: "p1", name: "bankai", path: "/projects/bankai", createdAt: 2 };
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
		activity: undefined,
		trace: undefined,
		traceSince: undefined,
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
		onRename?: (projectId: string, shellId: string, title: string) => void;
		onRequestShell?: (plain: boolean) => void;
		onToggleProject?: (projectId: string) => void;
		canCreateShell?: boolean;
		numbersVisible?: boolean;
		projects?: Project[];
		chosenProjectIds?: ReadonlySet<string>;
	} = {},
) {
	function Harness() {
		const [archivedOpen, setArchivedOpen] = useState(true);
		const open = sections.open ?? [];
		const archived = sections.archived ?? [];

		return (
			<SessionSidebar
				list={{
					open,
					archived,
					numbered: [...open, ...(archivedOpen ? archived : [])].slice(0, 9),
					waiting: open.find((entry) => entry.activity === "needs-attention"),
					archivedOpen,
					toggleArchived: () => setArchivedOpen((current) => !current),
				}}
				projects={handlers.projects ?? PROJECTS}
				chosenProjectIds={handlers.chosenProjectIds ?? new Set()}
				selectedShellId={undefined}
				canCreateShell={handlers.canCreateShell ?? true}
				numbersVisible={handlers.numbersVisible ?? false}
				onSelect={handlers.onSelect ?? (() => {})}
				onCreate={handlers.onCreate ?? (() => {})}
				onRequestShell={handlers.onRequestShell ?? (() => {})}
				onToggleProject={handlers.onToggleProject ?? (() => {})}
				onClose={handlers.onClose ?? (() => {})}
				onArchive={handlers.onArchive ?? (() => {})}
				onUnarchive={handlers.onUnarchive ?? (() => {})}
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
	expect(slot(card, "session-trace").textContent).toBe("sessions-first-sidebar");
});

test("a session with no activity keeps the card it had, only quieter", () => {
	renderSidebar({ open: [row("s1", { title: "psql", branch: "main" })] });

	const card = sessionRow("s1");

	expect(card.dataset.activity).toBeUndefined();
	expect(card.dataset.archived).toBeUndefined();
	expect(slot(card, "session-trace").className).toContain("text-outline-strong");
});

test("the output line takes the trace slot while the agent is running", () => {
	renderSidebar({
		open: [row("s1", { branch: "main", activity: "working", trace: "Editing index.tsx" })],
	});

	const trace = slot(sessionRow("s1"), "session-trace");

	expect(trace.textContent).toBe("Editing index.tsx");
	expect(trace.className).toContain("text-tertiary");
});

test("a running session says how long it has been doing the thing the trace names", () => {
	renderSidebar({
		open: [
			row("s1", { activity: "working", trace: "Thinking", traceSince: Date.now() - 74_000 }),
		],
	});

	expect(slot(sessionRow("s1"), "session-elapsed").textContent).toContain("1m");
});

test("a trace stamped ahead of the clock reads as zero, never as a negative", () => {
	renderSidebar({
		open: [
			row("s1", { activity: "working", trace: "Thinking", traceSince: Date.now() + 5000 }),
		],
	});

	expect(slot(sessionRow("s1"), "session-elapsed").textContent).toContain("0s");
});

test("a session the harness gave no clock for shows the verb alone", () => {
	renderSidebar({ open: [row("s1", { activity: "working", trace: "Thinking" })] });

	expect(sessionRow("s1").querySelector('[data-slot="session-elapsed"]')).toBeNull();
});

test("a state each session can be in paints its own border", () => {
	const states: AgentActivityState[] = ["working", "needs-attention", "done-unseen"];
	renderSidebar({ open: states.map((activity, index) => row(`s${index}`, { activity })) });

	expect(sessionRow("s0").className).toContain("border-l-tertiary");
	expect(sessionRow("s1").className).toContain("border-l-terminal-blue");
	expect(sessionRow("s2").className).toContain("border-l-added");
});

test("the header counts the open sessions, not the filed ones", () => {
	renderSidebar({ open: [row("a"), row("b")], archived: [row("filed", { archivedAt: NOW })] });

	expect(get("session-sidebar").textContent).toContain("SESSIONS 2");
});

test("a badge per project sits above the list, named and in project order", () => {
	renderSidebar({ open: [row("s1")] });

	const badges = [...get("project-badges").querySelectorAll<HTMLElement>('[data-component="project-badge"]')];

	expect(badges.map((badge) => badge.textContent)).toEqual(["bankai", "dogama"]);
	expect(badges.every((badge) => badge.getAttribute("aria-pressed") === "false")).toBe(true);
});

test("clicking a badge names its project instead of touching the sessions", () => {
	const toggled: string[] = [];
	const selected: string[] = [];
	renderSidebar({ open: [row("s1")] }, {
		onToggleProject: (projectId) => toggled.push(projectId),
		onSelect: (projectId, shellId) => selected.push(`${projectId}/${shellId}`),
	});

	fireEvent.click(get("project-badge", { projectId: "p2" }));

	expect(toggled).toEqual(["p2"]);
	expect(selected).toEqual([]);
});

test("a chosen project wears its badge pressed", () => {
	renderSidebar({ open: [row("s1")] }, { chosenProjectIds: new Set(["p1"]) });

	expect(get("project-badge", { projectId: "p1" }).getAttribute("aria-pressed")).toBe("true");
	expect(get("project-badge", { projectId: "p2" }).getAttribute("aria-pressed")).toBe("false");
});

test("an empty list asks for a session without naming a project", () => {
	let requests = 0;
	renderSidebar({}, { chosenProjectIds: new Set(["p2"]), onRequestShell: () => (requests += 1) });

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

test("a single project has nothing to narrow, so no badges appear", () => {
	renderSidebar({ open: [row("s1")] }, { projects: [BANKAI] });

	expect(query("project-badges")).toBeNull();
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

test("an archived session renders slim, with no trace and nothing left to archive", () => {
	renderSidebar({ archived: [row("s1", { archivedAt: NOW, branch: "main" })] });

	const filed = sessionRow("s1");

	expect(filed.dataset.archived).toBe("");
	expect(filed.querySelector('[data-slot="session-trace"]')).toBeNull();
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

test("the row menu holds new shell, rename, archive and close", () => {
	renderSidebar({ open: [row("s1")] });

	fireEvent.contextMenu(sessionRow("s1"));

	expect(menuItems().map((item) => item.textContent)).toEqual([
		"New shell in this project",
		"Rename",
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

test("holding the modifier paints the numbers the keyboard reaches", () => {
	renderSidebar(
		{ open: [row("s1")], archived: [row("s2", { archivedAt: NOW })] },
		{ numbersVisible: true },
	);

	expect(slot(sessionRow("s1"), "session-number").textContent).toBe("1");
	expect(slot(sessionRow("s2"), "session-number").textContent).toBe("2");
});

test("releasing the modifier takes the numbers away", () => {
	renderSidebar({ open: [row("s1")] }, { numbersVisible: false });

	expect(sessionRow("s1").querySelector('[data-slot="session-number"]')).toBeNull();
});

test("a closed archive takes its rows out of the numbering", () => {
	renderSidebar({ open: [row("s1")], archived: [row("s2", { archivedAt: NOW })] }, { numbersVisible: true });

	fireEvent.click(get("session-shelf"));
	fireEvent.click(get("session-shelf"));

	expect(slot(sessionRow("s2"), "session-number").textContent).toBe("2");
});
