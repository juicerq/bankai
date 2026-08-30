import "./register-dom";
import { afterEach, expect, test } from "bun:test";
import { type } from "arktype";
import type { FileChange, ReviewSnapshot, Worktree } from "@shared/review";
import type { Project } from "@shared/projects";
import { ReviewPanel } from "@renderer/routes/-features/review/panel/review-panel";
import { createReviewPanelStore } from "@renderer/routes/-features/review/panel/review-panel-store";
import { LEADING_CONTEXT } from "@renderer/routes/-features/review/reading/review-focused-file";
import { REVIEW_ROW_HEIGHT } from "@renderer/routes/-features/review/reading/review-rows";
import { REVIEW_SCOPES } from "@renderer/routes/-features/review/header/review-scope";
import type { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";
import { WorkspaceProvider } from "@renderer/routes/-features/workspace/layout/workspace-context";
import { get, query, querySlot, slot } from "./dom";
import type { ReviewProcedure } from "./orpc-transport";
import { installReviewEnvironment } from "./review-harness";
import { act, cleanup, fireEvent, render, waitFor } from "./testing-library";

afterEach(cleanup);

const project: Project = { id: "p1", name: "p1", path: "/p1", createdAt: 0, reviewClosedTargets: [] };

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

function renderPanel({
	quickOpen = false,
	activeProject = project,
}: {
	quickOpen?: boolean;
	activeProject?: Project;
} = {}) {
	const environment = installReviewEnvironment();
	const panel = createReviewPanelStore();
	const view = render(
		<WorkspaceProvider
			control={{
				initialDiffWidth: 810,
				initialTreeWidth: 200,
				onToggleFullscreen: () => {},
				onOpenSettings: () => {},
				onOpenCommands: () => {},
				onPersistLayout: () => {},
				onBayModeChange: () => {},
				onReviewExpandedChange: () => {},
				onToggleReviewFocus: () => {},
				onTreeOpenChange: () => {},
				onRequestShell: () => {},
				onRequestShellFocus: () => {},
			}}
			agents={{ shells: new Map(), worktrees: new Map(), statusSince: new Map(), harnesses: new Map() }}
			residency={{ asleep: new Set(), resumable: new Set(), wake: () => {}, sleep: () => {} }}
			topBand={{ revealed: false, onFocus: () => {}, onBlur: () => {} }}
		>
			<ReviewPanel
				panel={panel}
				project={activeProject}
				shells={[]}
				treeOpen
				treeDivider={divider}
				expanded={false}
				onToggleExpanded={() => {}}
				quickOpen={{ open: quickOpen, onClose: () => {} }}
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

function treeDirectoryToggle(path: string) {
	const toggle = treeRow(path).querySelector<HTMLElement>("[aria-expanded]");
	if (!toggle) {
		throw new Error(`No directory toggle for ${path}`);
	}

	return toggle;
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
	await waitFor(() => {
		if (panel.transport.pendingCount(procedure) === 0) {
			throw new Error(`No pending ${procedure} request; received ${JSON.stringify(panel.transport.calls)}`);
		}
	});

	await act(async () => {
		while (panel.transport.pendingCount(procedure) > 0) {
			panel.transport.resolve(procedure, value, match);
		}
	});
}

async function openTree(panel: Panel, browsePaths?: string[]) {
	panel.ipc.resolveWatch();
	await answer(panel, "worktrees", WORKTREES);
	if (browsePaths) {
		await answer(panel, "browseFiles", browsePaths);
	}
	await answer(panel, "snapshot", snapshotOf(CHANGED_PATHS));
	await waitFor(() => expect(hasTreeRow("src/app/one.ts")).toBe(true));

	fireEvent.click(treeDirectoryToggle("src/app"));
	expect(hasTreeRow("src/app/one.ts")).toBe(false);
}

test("switching the scope keeps the directories the tree was left on", async () => {
	const panel = renderPanel();
	await openTree(panel);

	pickMenuItem("review-scope", REVIEW_SCOPES.branch.label);

	expect(hasTreeRow("src/app/one.ts")).toBe(false);
});

test("project defaults skip closed diff content until the file is opened manually", async () => {
	const panel = renderPanel({
		activeProject: {
			...project,
			reviewClosedTargets: [{ kind: "directory", path: "src/app" }],
		},
	});
	panel.ipc.resolveWatch();
	await answer(panel, "worktrees", WORKTREES);
	await answer(panel, "snapshot", snapshotOf(CHANGED_PATHS));

	await waitFor(() => expect(panel.transport.callsFor("files")).toHaveLength(1));
	const filesRequest = type({ files: "string[]" }).assert(panel.transport.callsFor("files")[0]);
	expect(filesRequest.files).toEqual(["README.md"]);
	expect(slot(treeRow("src/app"), "default-closure-actions").dataset.active).toBe("true");

	fireEvent.click(slot(treeRow("src/app/one.ts"), "open"));
	await waitFor(() => expect(panel.transport.callsFor("file")).toHaveLength(1));
});

test("switching the scope keeps the browsed directories expanded", async () => {
	const panel = renderPanel();
	await openTree(panel);

	fireEvent.click(slot(get("review-tree"), "tree-view-browse"));
	await answer(panel, "browseFiles", CHANGED_PATHS);
	await waitFor(() => expect(hasTreeRow("src/app")).toBe(true));
	fireEvent.click(treeDirectoryToggle("src/app"));
	expect(hasTreeRow("src/app/one.ts")).toBe(true);

	pickMenuItem("review-scope", REVIEW_SCOPES.branch.label);

	expect(hasTreeRow("src/app/one.ts")).toBe(true);
});

test("the browse view covers the diff until a file is open", async () => {
	const panel = renderPanel();
	await openTree(panel);

	fireEvent.click(slot(get("review-tree"), "tree-view-browse"));
	await answer(panel, "browseFiles", CHANGED_PATHS);
	await waitFor(() => expect(query("review-browse-empty")).not.toBeNull());

	fireEvent.click(slot(treeRow("README.md"), "open"));

	expect(query("review-browse-empty")).toBeNull();
	expect(get("review-focused-file").dataset.path).toBe("README.md");
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

test("quick open filters every worktree path and opens a file without changing the tree reading", async () => {
	const panel = renderPanel({ quickOpen: true });
	const browsePaths = [...CHANGED_PATHS, "src/main/agents/harness/claude/claude-harness.ts"];
	await openTree(panel, browsePaths);

	const quickOpen = get("review-quick-open");
	const input = slot<HTMLInputElement>(quickOpen, "filter-input");
	fireEvent.input(input, { target: { value: "claude-harness" } });
	fireEvent.keyDown(input, { key: "Enter" });

	expect(get("review-focused-file").dataset.path).toBe("src/main/agents/harness/claude/claude-harness.ts");
	expect(get("review-tree").dataset.treeView).toBe("changes");
});

test("quick open searches the current worktree and opens a result at its exact line without moving the tree", async () => {
	const panel = renderPanel({ quickOpen: true });
	const browsePaths = [...CHANGED_PATHS, "src/result.txt"];
	await openTree(panel, browsePaths);

	const quickOpen = get("review-quick-open");
	const input = slot<HTMLInputElement>(quickOpen, "filter-input");
	fireEvent.input(input, { target: { value: "needle" } });
	expect(input.value).toBe("needle");
	await waitFor(() => expect(panel.transport.callsFor("searchContent")).toHaveLength(1));

	await answer(panel, "searchContent", {
		matches: [
			{ file: "src/result.txt", line: 20, text: "first needle" },
			{ file: "src/result.txt", line: 80, text: "second needle" },
		],
		truncated: false,
	});

	expect(panel.transport.callsFor("searchContent")).toEqual([
		{ projectId: "p1", worktree: "/p1", query: "needle" },
	]);
	await waitFor(() => expect(get("review-quick-open-file", { path: "src/result.txt" }).dataset.matches).toBe("2"));
	expect(get("review-tree").dataset.treeView).toBe("changes");

	await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
	await waitFor(() => expect(panel.transport.callsFor("browseFile")).toHaveLength(1));
	await answer(panel, "browseFile", {
		status: "ready",
		lines: Array.from({ length: 100 }, (_, index) => ({
			kind: "context",
			number: index + 1,
			oldNumber: index + 1,
			hunk: 0,
			content: `line ${index + 1}`,
		})),
	});

	await waitFor(() => expect(get("review-focused-file").dataset.path).toBe("src/result.txt"));
	await waitFor(() =>
		expect(slot(get("review-focused-file"), "scroll").scrollTop).toBe(
			(19 - LEADING_CONTEXT) * REVIEW_ROW_HEIGHT.line,
		),
	);
	expect(get("review-tree").dataset.treeView).toBe("changes");
});

test("quick open reports empty, error, and truncated automatic searches", async () => {
	const panel = renderPanel({ quickOpen: true });
	await openTree(panel, CHANGED_PATHS);

	const quickOpen = get("review-quick-open");
	const input = slot<HTMLInputElement>(quickOpen, "filter-input");
	fireEvent.input(input, { target: { value: "needle" } });

	await waitFor(() => expect(quickOpen.dataset.status).toBe("searching"));
	await answer(panel, "searchContent", { matches: [], truncated: false });
	await waitFor(() => expect(quickOpen.dataset.status).toBe("empty"));
	expect(querySlot(quickOpen, "retry")).toBeNull();

	fireEvent.input(input, { target: { value: "broken" } });
	await waitFor(() => expect(quickOpen.dataset.status).toBe("searching"));
	await act(async () => {
		panel.transport.reject("searchContent", new Error("search unavailable"));
	});
	await waitFor(() => expect(quickOpen.dataset.status).toBe("error"));
	expect(querySlot(quickOpen, "retry")).toBeNull();

	fireEvent.input(input, { target: { value: "broad" } });
	await waitFor(() => expect(quickOpen.dataset.status).toBe("searching"));
	await answer(panel, "searchContent", {
		matches: [],
		truncated: true,
	});

	await waitFor(() => expect(quickOpen.dataset.status).toBe("truncated"));
	expect(slot(quickOpen, "truncated")).toBeTruthy();
	expect(panel.transport.callsFor("searchContent")).toHaveLength(3);
});
