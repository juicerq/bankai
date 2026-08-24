import { afterEach, expect, test } from "bun:test";
import type { Project } from "@shared/projects";
import { SessionSidebar } from "@renderer/routes/-features/sessions/list/session-sidebar";
import type { SessionRow } from "@renderer/routes/-features/sessions/list/session-rows";
import { get } from "./dom";
import { cleanup, render } from "./testing-library";

afterEach(cleanup);

const NOW = 1_800_000_000_000;

const BANKAI: Project = { id: "p1", name: "bankai", path: "/projects/bankai", createdAt: 2 };

function row(shellId: string, harness: string): SessionRow {
	return {
		shellId,
		projectId: "p1",
		projectName: "bankai",
		title: "flatten the sidebar",
		branch: undefined,
		harness,
		createdAt: NOW,
		lastTouchedAt: NOW,
		archivedAt: undefined,
		pinnedAt: undefined,
		activity: undefined,
		since: undefined,
	};
}

const OPEN = [row("opencode-card", "opencode"), row("claude-card", "claude")];

function renderCards(selectedShellId?: string) {
	render(
		<SessionSidebar
			list={{
				open: OPEN,
				archived: [],
				numbered: OPEN,
				openProjectIds: new Set(["p1"]),
				waiting: undefined,
				archivedOpen: false,
				toggleArchived: () => {},
				term: "",
				searching: false,
				onSearch: () => {},
			}}
			projects={[BANKAI]}
			projectMarks={new Map()}
			selectedShellId={selectedShellId}
			canCreateShell
			onSelect={() => {}}
			onCreate={() => {}}
			onRequestShell={() => {}}
			onAddProject={() => {}}
			onToggleProject={() => {}}
			onExcludeProject={() => {}}
			onClose={() => {}}
			onArchive={() => {}}
			onUnarchive={() => {}}
			onPin={() => {}}
			onUnpin={() => {}}
			onRename={() => {}}
			footer={null}
		/>,
	);
}

function mark(shellId: string, label: string): SVGElement {
	const card = get("session-row", { shellId });
	const found = card.querySelector(`[aria-label='${label}']`);
	if (!(found instanceof SVGElement)) {
		throw new Error(`Expected a drawn ${label} mark on ${shellId}`);
	}

	return found;
}

test("an opencode session carries the open loop instead of a textual badge", () => {
	renderCards();

	const loop = mark("opencode-card", "OpenCode");
	expect(loop.tagName.toLowerCase()).toBe("svg");
	expect(loop.getAttribute("role")).toBe("img");
	expect(get("session-row", { shellId: "opencode-card" }).textContent).not.toContain("opencode");
});

test("the open loop keeps one path in a square box beside the other marks", () => {
	renderCards();

	const [x, y, width, height] = (mark("opencode-card", "OpenCode").getAttribute("viewBox") ?? "").split(" ").map(Number);

	expect(width).toBe(height);
	expect(x).toBe(y);
	expect(mark("opencode-card", "OpenCode").querySelectorAll("path")).toHaveLength(1);

	const opencode = mark("opencode-card", "OpenCode").getAttribute("class") ?? "";
	const claude = mark("claude-card", "Claude").getAttribute("class") ?? "";

	expect(opencode).toContain("size-3.5");
	expect(opencode.replace("fill-", "")).toBe(claude.replace("fill-", ""));
});
