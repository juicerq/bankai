import { afterEach, expect, test } from "bun:test";
import type { Project } from "@main/store/projects";
import type { AgentActivityState } from "@shared/activity";
import { ACTIVITY_LABEL } from "@renderer/routes/-utils/agent-activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { MobileSessionList } from "@renderer/routes/mobile/-components/mobile-session-list";
import { LONG_PRESS_MS } from "@renderer/routes/mobile/-utils/use-long-press";
import { get, query, slot } from "./dom";
import { act, cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const NOW = 1_800_000_000_000;

const BANKAI: Project = { id: "p1", name: "bankai", path: "/projects/bankai", createdAt: 1 };
const GHOSTAPI: Project = { id: "p2", name: "ghostapi", path: "/projects/ghostapi", createdAt: 2 };

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
		since: undefined,
		attention: undefined,
		...patch,
	};
}

function renderList(
	sessions: SessionRow[],
	options: {
		archived?: SessionRow[];
		projects?: Project[];
		projectActivity?: ReadonlyMap<string, AgentActivityState>;
		chosenProjectIds?: ReadonlySet<string>;
		onToggleProject?: (projectId: string) => void;
		onOpen?: (shellId: string) => void;
		onCreate?: (projectId: string) => Promise<void>;
		onRename?: (projectId: string, shellId: string, title: string) => void;
		onArchive?: (projectId: string, shellId: string) => void;
		onUnarchive?: (projectId: string, shellId: string) => void;
		onCloseSession?: (projectId: string, shellId: string) => void;
	} = {},
) {
	return render(
		<MobileSessionList
			sessions={sessions}
			archived={options.archived ?? []}
			projects={options.projects ?? [BANKAI, GHOSTAPI]}
			projectActivity={options.projectActivity ?? new Map()}
			chosenProjectIds={options.chosenProjectIds ?? new Set()}
			onToggleProject={options.onToggleProject ?? (() => {})}
			onOpen={options.onOpen ?? (() => {})}
			onCreate={options.onCreate ?? (async () => {})}
			onRename={options.onRename ?? (() => {})}
			onArchive={options.onArchive ?? (() => {})}
			onUnarchive={options.onUnarchive ?? (() => {})}
			onCloseSession={options.onCloseSession ?? (() => {})}
		/>,
	);
}

async function hold(element: HTMLElement) {
	fireEvent.pointerDown(element, { clientX: 0, clientY: 0 });
	await act(async () => {
		await Bun.sleep(LONG_PRESS_MS + 20);
	});
	fireEvent.pointerUp(element);
}

function cards() {
	return [...get("mobile-session-list").querySelectorAll<HTMLElement>('[data-component="mobile-session-card"]')];
}

function card(shellId: string) {
	return get("mobile-session-card", { shellId });
}

function badges() {
	return [...get("mobile-project-strip").querySelectorAll<HTMLElement>('[data-component="mobile-project-badge"]')];
}

function badge(projectId: string) {
	return get("mobile-project-badge", { projectId });
}

test("the list paints the sessions in the order it was handed", () => {
	renderList([row("waiting", { activity: "needs-attention" }), row("working", { activity: "working" }), row("idle")]);

	expect(cards().map((entry) => entry.dataset.shellId)).toEqual(["waiting", "working", "idle"]);
});

test("a card reads project, session name and the state the agent is in", () => {
	renderList([
		row("s1", {
			projectName: "ghostapi",
			title: "refund webhook",
			activity: "working",
		}),
	]);

	expect(card("s1").textContent).toContain("ghostapi");
	expect(card("s1").textContent).toContain("refund webhook");
	expect(slot(card("s1"), "session-state").textContent).toBe(ACTIVITY_LABEL.working);
});

test("a card with no activity falls back to the branch, quietly", () => {
	renderList([row("s1", { branch: "feat/cron-queue" })]);

	const state = slot(card("s1"), "session-state");

	expect(state.textContent).toBe("feat/cron-queue");
	expect(state.className).toContain("text-outline-strong");
});

test("a running session says how long it has been at it", () => {
	renderList([row("s1", { activity: "working", since: Date.now() - 74_000 })]);

	expect(slot(card("s1"), "session-elapsed").textContent).toContain("1m");
});

test("each state paints its own band down the left edge", () => {
	const states: AgentActivityState[] = ["working", "needs-attention", "done"];
	renderList(states.map((activity, index) => row(`s${index}`, { activity })));

	expect(card("s0").className).toContain("border-l-tertiary");
	expect(card("s1").className).toContain("border-l-terminal-blue");
	expect(card("s2").className).toContain("border-l-added");
	expect(card("s0").dataset.activity).toBe("working");
});

test("a session with nothing running has no band", () => {
	renderList([row("s1")]);

	expect(card("s1").className).toContain("border-l-transparent");
	expect(card("s1").dataset.activity).toBeUndefined();
});

test("tapping a card opens that session", () => {
	const opened: string[] = [];
	renderList([row("s1")], { onOpen: (shellId) => opened.push(shellId) });

	fireEvent.click(card("s1"));

	expect(opened).toEqual(["s1"]);
});

test("a badge per project sits above the list, in project order", () => {
	renderList([row("s1")]);

	expect(badges().map((badge) => badge.dataset.projectId)).toEqual(["p1", "p2"]);
	expect(badges().every((badge) => badge.getAttribute("aria-pressed") === "false")).toBe(true);
});

test("tapping a badge names its project instead of touching the sessions", () => {
	const toggled: string[] = [];
	renderList([row("s1")], { onToggleProject: (projectId) => toggled.push(projectId) });

	fireEvent.click(badge("p2"));

	expect(toggled).toEqual(["p2"]);
	expect(cards()).toHaveLength(1);
});

test("a chosen badge reads as pressed", () => {
	renderList([row("s1")], { chosenProjectIds: new Set(["p2"]) });

	expect(badges().map((badge) => badge.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
});

test("a single project has nothing to narrow, so no strip", () => {
	renderList([row("s1")], { projects: [BANKAI] });

	expect(query("mobile-project-strip")).toBeNull();
});

test("an empty list says so instead of showing a bare screen", () => {
	renderList([]);

	expect(slot(get("mobile-session-list"), "empty").textContent).toContain("No open sessions");
	expect(cards()).toHaveLength(0);
});

test("archived sessions wait behind a shelf that counts them", () => {
	renderList([row("s1")], { archived: [row("old1"), row("old2")] });

	const shelf = get("mobile-archived-shelf");

	expect(slot(shelf, "toggle").textContent).toContain("ARCHIVED");
	expect(slot(shelf, "toggle").textContent).toContain("2");
	expect(shelf.querySelectorAll('[data-component="mobile-archived-row"]')).toHaveLength(0);

	fireEvent.click(slot(shelf, "toggle"));

	expect(
		[...get("mobile-archived-shelf").querySelectorAll<HTMLElement>('[data-component="mobile-archived-row"]')]
			.map((entry) => entry.dataset.shellId),
	).toEqual(["old1", "old2"]);
});

test("tapping an archived session opens it like any other", () => {
	const opened: string[] = [];
	renderList([], { archived: [row("old1")], onOpen: (shellId) => opened.push(shellId) });

	fireEvent.click(slot(get("mobile-archived-shelf"), "toggle"));
	fireEvent.click(get("mobile-archived-row", { shellId: "old1" }));

	expect(opened).toEqual(["old1"]);
});

test("with nothing archived the shelf stays out of the way", () => {
	renderList([row("s1")]);

	expect(query("mobile-archived-shelf")).toBeNull();
});

test("holding a card offers what right-click offers on the desktop", async () => {
	const opened: string[] = [];
	renderList([row("s1")], { onOpen: (shellId) => opened.push(shellId) });

	await hold(card("s1"));

	const sheet = get("mobile-session-actions");

	expect(slot(sheet, "rename").textContent).toBe("Rename");
	expect(slot(sheet, "archive").textContent).toBe("Archive");
	expect(slot(sheet, "close").textContent).toBe("Close");
	expect(opened).toEqual([]);
});

test("a hold that turns into a scroll leaves the sheet closed", async () => {
	renderList([row("s1")]);

	fireEvent.pointerDown(card("s1"), { clientX: 0, clientY: 0 });
	fireEvent.pointerMove(card("s1"), { clientX: 0, clientY: 60 });
	await act(async () => {
		await Bun.sleep(LONG_PRESS_MS + 20);
	});

	expect(query("mobile-session-actions")).toBeNull();
});

test("archiving from the sheet names the session it was held on", async () => {
	const archived: string[] = [];
	renderList([row("s1")], { onArchive: (projectId, shellId) => archived.push(`${projectId}/${shellId}`) });

	await hold(card("s1"));
	fireEvent.click(slot(get("mobile-session-actions"), "archive"));

	expect(archived).toEqual(["p1/s1"]);
	expect(query("mobile-session-actions")).toBeNull();
});

test("a held archived session offers to come back instead", async () => {
	const unarchived: string[] = [];
	renderList([], {
		archived: [row("old1")],
		onUnarchive: (projectId, shellId) => unarchived.push(`${projectId}/${shellId}`),
	});

	fireEvent.click(slot(get("mobile-archived-shelf"), "toggle"));
	await hold(get("mobile-archived-row", { shellId: "old1" }));

	const sheet = get("mobile-session-actions");

	expect(query("mobile-session-actions")?.querySelector('[data-slot="archive"]')).toBeNull();

	fireEvent.click(slot(sheet, "unarchive"));

	expect(unarchived).toEqual(["p1/old1"]);
});

test("renaming from the sheet sends the new name once", async () => {
	const renamed: string[] = [];
	renderList([row("s1")], { onRename: (_projectId, shellId, title) => renamed.push(`${shellId}:${title}`) });

	await hold(card("s1"));
	fireEvent.click(slot(get("mobile-session-actions"), "rename"));
	fireEvent.input(slot(get("mobile-session-actions"), "title"), { target: { value: "refund webhook" } });
	fireEvent.click(slot(get("mobile-session-actions"), "save"));

	expect(renamed).toEqual(["s1:refund webhook"]);
	expect(query("mobile-session-actions")).toBeNull();
});

test("closing asks before it ends the session", async () => {
	const closed: string[] = [];
	renderList([row("s1")], { onCloseSession: (projectId, shellId) => closed.push(`${projectId}/${shellId}`) });

	await hold(card("s1"));
	fireEvent.click(slot(get("mobile-session-actions"), "close"));

	expect(closed).toEqual([]);

	fireEvent.click(slot(get("mobile-session-actions"), "confirm-close"));

	expect(closed).toEqual(["p1/s1"]);
});
