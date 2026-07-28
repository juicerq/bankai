import { afterEach, expect, test } from "bun:test";
import type { Project } from "@main/store/projects";
import type { AgentActivityState } from "@shared/activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { MobileSessionList } from "@renderer/routes/mobile/-components/mobile-session-list";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

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
		trace: undefined,
		traceSince: undefined,
		attention: undefined,
		...patch,
	};
}

function renderList(
	sessions: SessionRow[],
	options: {
		projects?: Project[];
		projectActivity?: ReadonlyMap<string, AgentActivityState>;
		chosenProjectIds?: ReadonlySet<string>;
		onToggleProject?: (projectId: string) => void;
		onOpen?: (shellId: string) => void;
		onCreate?: (projectId: string) => Promise<void>;
	} = {},
) {
	return render(
		<MobileSessionList
			sessions={sessions}
			projects={options.projects ?? [BANKAI, GHOSTAPI]}
			projectActivity={options.projectActivity ?? new Map()}
			chosenProjectIds={options.chosenProjectIds ?? new Set()}
			onToggleProject={options.onToggleProject ?? (() => {})}
			onOpen={options.onOpen ?? (() => {})}
			onCreate={options.onCreate ?? (async () => {})}
		/>,
	);
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

test("a card reads project, session name and what the agent is doing", () => {
	renderList([
		row("s1", {
			projectName: "ghostapi",
			title: "refund webhook",
			activity: "working",
			trace: "Editing files",
		}),
	]);

	expect(card("s1").textContent).toContain("ghostapi");
	expect(card("s1").textContent).toContain("refund webhook");
	expect(slot(card("s1"), "session-trace").textContent).toBe("Editing files");
});

test("a card with no trace falls back to the branch, quietly", () => {
	renderList([row("s1", { branch: "feat/cron-queue" })]);

	const trace = slot(card("s1"), "session-trace");

	expect(trace.textContent).toBe("feat/cron-queue");
	expect(trace.className).toContain("text-outline-strong");
});

test("a running session says how long it has been at it", () => {
	renderList([row("s1", { activity: "working", trace: "Thinking", traceSince: Date.now() - 74_000 })]);

	expect(slot(card("s1"), "session-elapsed").textContent).toContain("1m");
});

test("each state paints its own band down the left edge", () => {
	const states: AgentActivityState[] = ["working", "needs-attention", "done-unseen"];
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

test("a badge dot carries the aggregate state of its project", () => {
	renderList([row("s1")], {
		projectActivity: new Map<string, AgentActivityState>([["p2", "needs-attention"]]),
	});

	expect(badge("p1").dataset.activity).toBeUndefined();
	expect(slot(badge("p1"), "project-dot").className).toContain("bg-outline-strong");
	expect(badge("p2").dataset.activity).toBe("needs-attention");
	expect(slot(badge("p2"), "project-dot").className).toContain("bg-terminal-blue");
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
