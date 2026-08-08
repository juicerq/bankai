import "./register-dom";
import { afterEach, expect, test } from "bun:test";
import type { FileChange, ReviewSnapshot, Worktree } from "@main/git/git-contracts";
import type { Project } from "@main/store/projects";
import { ReviewPanel } from "@renderer/routes/-components/review-panel";
import { REVIEW_SCOPES } from "@renderer/routes/-utils/review-scope";
import type { useDivider } from "@renderer/routes/-utils/use-divider";
import { WorkspaceProvider } from "@renderer/routes/-utils/workspace-context";
import { get, query, slot } from "./dom";
import type { ReviewProcedure } from "./orpc-transport";
import { installReviewEnvironment } from "./review-harness";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

afterEach(cleanup);

const project: Project = { id: "p1", name: "p1", path: "/p1", createdAt: 0 };

const WORKTREES: Worktree[] = [
	{ path: "/p1", branch: "main" },
	{ path: "/p1-feature", branch: "feature" },
];

const CHANGED_PATHS = ["src/app/one.ts", "src/app/two.ts", "README.md"];

const divider: ReturnType<typeof useDivider> = {
	resizing: false,
	intent: undefined,
	valueMin: 120,
	valueMax: 400,
	valueNow: 200,
	onKeyDown: () => {},
	pointerProps: {
		onPointerDown: () => {},
		onPointerMove: () => {},
		onPointerUp: () => {},
		onPointerCancel: () => {},
	},
};

const TREE_VIEWPORT = { inlineSize: 200, blockSize: 480 };

class SizedBox {
	constructor(
		private readonly resized: (entries: { borderBoxSize: { inlineSize: number; blockSize: number }[] }[]) => void,
	) {}

	observe() {
		this.resized([{ borderBoxSize: [TREE_VIEWPORT] }]);
	}

	unobserve() {}

	disconnect() {}
}

Object.assign(globalThis, { ResizeObserver: SizedBox });

function change(path: string): FileChange {
	return { path, status: "modified", additions: 1, deletions: 0 };
}

function snapshotOf(paths: string[]): ReviewSnapshot {
	return {
		state: "ready",
		files: paths.map(change),
		totals: { additions: paths.length, deletions: 0, files: paths.length },
	};
}

function renderPanel() {
	const environment = installReviewEnvironment();
	const view = render(
		<WorkspaceProvider
			control={{
				initialDiffWidth: 810,
				initialTreeWidth: 200,
				onToggleFullscreen: () => {},
				onOpenSettings: () => {},
				onOpenCommands: () => {},
				onPersistLayout: () => {},
				onReviewOpenChange: () => {},
				onReviewExpandedChange: () => {},
				onToggleReviewFocus: () => {},
				onTreeOpenChange: () => {},
				onRequestShell: () => {},
			}}
			agents={{ shells: new Map(), worktrees: new Map(), statusSince: new Map(), harnesses: new Map() }}
			residency={{ asleep: new Set(), resumable: new Set(), wake: () => {}, sleep: () => {} }}
			topBand={{ revealed: false, onFocus: () => {}, onBlur: () => {} }}
		>
			<ReviewPanel
				project={project}
				shells={[]}
				treeOpen
				treeDivider={divider}
				expanded={false}
				onToggleExpanded={() => {}}
				pathPicker={{ open: false, onClose: () => {} }}
			/>
		</WorkspaceProvider>,
		{ wrapper: environment.wrapper },
	);

	return { ...view, ...environment };
}

type Panel = ReturnType<typeof renderPanel>;

function treeRow(path: string) {
	const match = [...get("review-tree").querySelectorAll<HTMLElement>("[data-component='review-tree-row']")].find(
		(row) => row.dataset.path === path,
	);

	if (!match) {
		throw new Error(`No tree row for ${path}`);
	}

	return match;
}

function hasTreeRow(path: string) {
	return [...get("review-tree").querySelectorAll<HTMLElement>("[data-component='review-tree-row']")].some(
		(row) => row.dataset.path === path,
	);
}

function pickMenuItem(component: string, label: string) {
	fireEvent.click(get(component));
	const items = [...get(`${component}-menu`).querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
	const match = items.find((item) => item.textContent?.startsWith(label));

	if (!match) {
		throw new Error(`No ${component} menu item for ${label}`);
	}

	fireEvent.click(match);
}

async function answer(panel: Panel, procedure: ReviewProcedure, value: unknown, match?: (input: unknown) => boolean) {
	await waitFor(() => expect(panel.transport.pendingCount(procedure)).toBeGreaterThan(0));

	while (panel.transport.pendingCount(procedure) > 0) {
		panel.transport.resolve(procedure, value, match);
	}
}

async function openTree(panel: Panel) {
	panel.ipc.resolveWatch();
	await answer(panel, "worktrees", WORKTREES);
	await answer(panel, "snapshot", snapshotOf(CHANGED_PATHS));
	await waitFor(() => expect(hasTreeRow("src/app/one.ts")).toBe(true));

	fireEvent.click(treeRow("src/app"));
	expect(hasTreeRow("src/app/one.ts")).toBe(false);
}

test("switching the scope keeps the directories the tree was left on", async () => {
	const panel = renderPanel();
	await openTree(panel);

	pickMenuItem("review-scope", REVIEW_SCOPES.branch.label);

	expect(hasTreeRow("src/app/one.ts")).toBe(false);
});

test("switching the scope keeps the browsed directories expanded", async () => {
	const panel = renderPanel();
	await openTree(panel);

	fireEvent.click(slot(get("review-tree"), "tree-view-browse"));
	await answer(panel, "browseFiles", CHANGED_PATHS);
	await waitFor(() => expect(hasTreeRow("src/app")).toBe(true));
	fireEvent.click(treeRow("src/app"));
	expect(hasTreeRow("src/app/one.ts")).toBe(true);

	pickMenuItem("review-scope", REVIEW_SCOPES.branch.label);

	expect(hasTreeRow("src/app/one.ts")).toBe(true);
});

test("switching the scope keeps the focused file open", async () => {
	const panel = renderPanel();
	await openTree(panel);
	fireEvent.click(slot(treeRow("README.md"), "focus"));

	expect(get("review-focused-file").dataset.path).toBe("README.md");

	pickMenuItem("review-scope", REVIEW_SCOPES.branch.label);

	expect(get("review-focused-file").dataset.path).toBe("README.md");
});

test("picking another worktree drops the tree state and the focused file", async () => {
	const panel = renderPanel();
	await openTree(panel);
	fireEvent.click(slot(treeRow("README.md"), "focus"));

	pickMenuItem("review-worktree", "feature");

	await waitFor(() => expect(hasTreeRow("src/app/one.ts")).toBe(true));
	expect(query("review-focused-file")).toBeNull();
});
