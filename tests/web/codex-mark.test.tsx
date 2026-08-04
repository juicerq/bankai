import { afterEach, expect, test } from "bun:test";
import type { Project } from "@main/store/projects";
import { SessionSidebar } from "@renderer/routes/-components/session-sidebar";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
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

const OPEN = [row("codex-card", "codex"), row("claude-card", "claude"), row("aider-card", "aider")];

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
			}}
			projects={[BANKAI]}
			chosenProjectIds={new Set()}
			selectedShellId={selectedShellId}
			canCreateShell
			onSelect={() => {}}
			onCreate={() => {}}
			onRequestShell={() => {}}
			onToggleProject={() => {}}
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

test("a codex session carries the blossom instead of a textual badge", () => {
	renderCards();

	const blossom = mark("codex-card", "Codex");
	expect(blossom.tagName.toLowerCase()).toBe("svg");
	expect(blossom.getAttribute("role")).toBe("img");
	expect(get("session-row", { shellId: "codex-card" }).textContent).not.toContain("codex");
});

test("the blossom keeps the published path in a square box", () => {
	renderCards();

	const [x, y, width, height] = (mark("codex-card", "Codex").getAttribute("viewBox") ?? "").split(" ").map(Number);

	expect(width).toBe(height);
	expect(x).toBe(y);
	expect(mark("codex-card", "Codex").querySelectorAll("path")).toHaveLength(1);
});

test("the blossom sits in the same optical slot as the claude mark", () => {
	renderCards();

	const codex = mark("codex-card", "Codex").getAttribute("class") ?? "";
	const claude = mark("claude-card", "Claude").getAttribute("class") ?? "";

	expect(codex).toContain("size-3.5");
	expect(claude).toContain("size-3.5");
	expect(codex.replace("fill-", "")).toBe(claude.replace("fill-", ""));
});

test("both marks are monochrome and take the ink of the card's state", () => {
	renderCards("codex-card");

	expect(mark("codex-card", "Codex").getAttribute("class")).toContain("fill-tertiary");
	expect(mark("claude-card", "Claude").getAttribute("class")).toContain("fill-outline-strong");
	for (const label of ["Codex", "Claude"]) {
		const drawn = mark(label === "Codex" ? "codex-card" : "claude-card", label);
		expect(drawn.querySelector("[fill]")).toBeNull();
		expect(drawn.querySelector("[style]")).toBeNull();
	}
});

test("a harness with no mark still says which one it is", () => {
	renderCards();

	expect(get("session-row", { shellId: "aider-card" }).textContent).toContain("aider");
});
