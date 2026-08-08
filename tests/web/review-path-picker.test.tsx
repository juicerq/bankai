import "./register-dom";
import { afterEach, expect, test } from "bun:test";
import type { FileChange, ReviewSnapshot, Worktree } from "@shared/review";
import type { Project } from "@shared/projects";
import { ReviewPanel } from "@renderer/routes/-features/review/panel/review-panel";
import { ReviewPathPicker, VISIBLE_MATCHES } from "@renderer/routes/-features/review/header/review-path-picker";
import type { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";
import { WorkspaceProvider } from "@renderer/routes/-features/workspace/layout/workspace-context";
import { get, query, slot } from "./dom";
import type { ReviewProcedure } from "./orpc-transport";
import { installReviewEnvironment } from "./review-harness";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

afterEach(cleanup);

const PATHS = [
	"src/main/agents/harness/claude/claude-harness.ts",
	"src/renderer/src/routes/-features/review/panel/review-panel.tsx",
	"README.md",
];

function renderPicker(
	options: { paths?: string[]; onOpenFile?: (path: string) => void; onClose?: () => void } = {},
) {
	return render(
		<ReviewPathPicker
			paths={options.paths ?? PATHS}
			onOpenFile={options.onOpenFile ?? (() => {})}
			onClose={options.onClose ?? (() => {})}
		/>,
	);
}

function type(value: string) {
	fireEvent.input(slot(get("review-path-picker"), "filter-input"), { target: { value } });
}

function press(key: string) {
	fireEvent.keyDown(slot(get("review-path-picker"), "filter-input"), { key });
}

function item(path: string) {
	return get("review-path-picker-item", { path });
}

test("a folder the tree would have merged away is still offered on its own", () => {
	renderPicker({ paths: ["src/main/agents/harness/claude/claude-harness.ts"] });

	type("agents");

	expect(item("src/main/agents").dataset.kind).toBe("directory");
});

test("the filter matches against the whole path, not the file name", () => {
	renderPicker();

	type("routes/-features");

	expect(item("src/renderer/src/routes/-features/review/panel/review-panel.tsx").dataset.kind).toBe("file");
	expect(query("review-path-picker-item", { path: "README.md" })).toBeNull();
});

test("a match on the file name outranks a match on the directory", () => {
	renderPicker({ paths: ["docs/harness/guide.md", "src/harness.ts"] });

	type("harness");

	expect(item("src/harness.ts").dataset.index).toBe("0");
	expect(item("docs/harness").dataset.index).toBe("1");
	expect(item("docs/harness/guide.md").dataset.index).toBe("2");
});

test("the typed letters are matched in order, not as one block", () => {
	renderPicker();

	type("clhar");

	expect(item("src/main/agents/harness/claude/claude-harness.ts")).not.toBeNull();
});

test("the arrows walk the list and enter opens the highlighted file in the reader", () => {
	const opened: string[] = [];
	let closed = 0;
	renderPicker({ onOpenFile: (path) => opened.push(path), onClose: () => (closed += 1) });

	type("harness");

	expect(get("review-path-picker").dataset.highlighted).toBe("src/main/agents/harness/claude/claude-harness.ts");

	press("ArrowDown");

	expect(get("review-path-picker").dataset.highlighted).toBe("src/main/agents/harness");

	press("ArrowUp");
	press("Enter");

	expect(opened).toEqual(["src/main/agents/harness/claude/claude-harness.ts"]);
	expect(closed).toBe(1);
});

test("escape closes without opening anything", () => {
	const opened: string[] = [];
	let closed = 0;
	renderPicker({ onOpenFile: (path) => opened.push(path), onClose: () => (closed += 1) });

	press("Escape");

	expect(opened).toEqual([]);
	expect(closed).toBe(1);
});

test("choosing a folder narrows the filter into it and leaves the picker open", () => {
	const opened: string[] = [];
	let closed = 0;
	renderPicker({ onOpenFile: (path) => opened.push(path), onClose: () => (closed += 1) });

	type("renderer");
	fireEvent.click(item("src/renderer"));

	expect(opened).toEqual([]);
	expect(closed).toBe(0);
	expect(item("src/renderer/src/routes/-features/review/panel/review-panel.tsx").dataset.index).toBe("0");
	expect(query("review-path-picker-item", { path: "README.md" })).toBeNull();
});

test("a filter that matches more paths than the list shows says how many it found", () => {
	const paths = Array.from({ length: VISIBLE_MATCHES + 3 }, (_, index) => `src/file-${index}.ts`);
	renderPicker({ paths });

	type("file");

	expect(slot(get("review-path-picker"), "match-count").textContent).toBe(`${VISIBLE_MATCHES} OF ${paths.length}`);
});

const project: Project = { id: "p1", name: "p1", path: "/p1", createdAt: 0 };

const WORKTREES: Worktree[] = [{ path: "/p1", branch: "main" }];

const CHANGED_PATHS = ["src/app/one.ts", "README.md"];

const BROWSE_PATHS = [...CHANGED_PATHS, "src/main/agents/harness/claude/claude-harness.ts"];

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

class SizedBox {
	constructor(
		private readonly resized: (entries: { borderBoxSize: { inlineSize: number; blockSize: number }[] }[]) => void,
	) {}

	observe() {
		this.resized([{ borderBoxSize: [{ inlineSize: 200, blockSize: 480 }] }]);
	}

	unobserve() {}

	disconnect() {}
}

Object.assign(globalThis, { ResizeObserver: SizedBox });

function snapshotOf(paths: string[]): ReviewSnapshot {
	const files: FileChange[] = paths.map((path) => ({ path, status: "modified", additions: 1, deletions: 0 }));

	return { state: "ready", files, totals: { additions: paths.length, deletions: 0, files: paths.length } };
}

function renderPanel() {
	const environment = installReviewEnvironment();
	const closes: number[] = [];
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
				pathPicker={{ open: true, onClose: () => closes.push(1) }}
			/>
		</WorkspaceProvider>,
		{ wrapper: environment.wrapper },
	);

	return { ...view, ...environment, closes };
}

type Panel = ReturnType<typeof renderPanel>;

async function answer(panel: Panel, procedure: ReviewProcedure, value: unknown) {
	await waitFor(() => {
		if (panel.transport.pendingCount(procedure) === 0) {
			throw new Error(`No pending ${procedure} request; received ${JSON.stringify(panel.transport.calls)}`);
		}
	});

	while (panel.transport.pendingCount(procedure) > 0) {
		panel.transport.resolve(procedure, value);
	}
}

function treePaths() {
	return [...get("review-tree").querySelectorAll<HTMLElement>("[data-component='review-tree-row']")].map(
		(row) => row.dataset.path,
	);
}

test("the picker opens over the panel, filters the browsed paths and opens the file in the reader", async () => {
	const panel = renderPanel();
	panel.ipc.resolveWatch();
	await Promise.all([answer(panel, "worktrees", WORKTREES), answer(panel, "browseFiles", BROWSE_PATHS)]);
	await answer(panel, "snapshot", snapshotOf(CHANGED_PATHS));
	await waitFor(() => expect(query("review-path-picker-item", { path: "README.md" })).not.toBeNull());

	const before = treePaths();
	type("claude-harness");

	expect(treePaths()).toEqual(before);

	press("Enter");

	expect(get("review-focused-file").dataset.path).toBe("src/main/agents/harness/claude/claude-harness.ts");
	expect(panel.closes).toEqual([1]);
});
