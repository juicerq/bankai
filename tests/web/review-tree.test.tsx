import { afterEach, expect, test } from "bun:test";
import { useSelector } from "@tanstack/react-store";
import { useRef, useState } from "react";
import type { FileChange } from "@shared/review";
import { ReviewTree } from "@renderer/routes/-features/review/tree/review-tree";
import { BROWSE_ROW_HEIGHT } from "@renderer/routes/-features/review/tree/review-tree-browse";
import { DEFAULT_TREE_WIDTH, redistributeReviewTree } from "@renderer/routes/-features/review/panel/review-layout";
import { createReviewPanelStore, type ReviewTreeView } from "@renderer/routes/-features/review/panel/review-panel-store";
import { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";
import { get, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const TREE_VIEWPORT_HEIGHT = 480;

class SizedBox {
	constructor(
		private readonly resized: (entries: { borderBoxSize: { inlineSize: number; blockSize: number }[] }[]) => void,
	) {}

	observe() {
		this.resized([{ borderBoxSize: [{ inlineSize: DEFAULT_TREE_WIDTH, blockSize: TREE_VIEWPORT_HEIGHT }] }]);
	}

	unobserve() {}

	disconnect() {}
}

Object.assign(globalThis, { ResizeObserver: SizedBox });

function ReviewTreeHarness() {
	const [widths, setWidths] = useState({ tree: 200, diff: 810 });
	const row = useRef<HTMLDivElement>(null);
	const divider = useDivider({
		value: widths.tree,
		min: 120,
		max: widths.tree + widths.diff - 280,
		sign: 1,
		target: row,
		resolve: (proposed) => {
			const next = redistributeReviewTree({ proposed, total: widths.tree + widths.diff, minTree: 120, minDiff: 280 });

			return {
				vars: [],
				commit: () => setWidths({ tree: next.tree, diff: next.diff }),
			};
		},
	});

	return (
		<main
			data-component="review-split"
			data-tree-width={widths.tree}
			data-diff-width={widths.diff}
			data-total-width={widths.tree + widths.diff}
			ref={row}
		>
			<ReviewTree
				files={[]}
				treeView="changes"
				divider={divider}
				onSelectTreeView={() => {}}
				onOpenFile={() => {}}
				onToggleFocusFile={() => {}}
				onCloseFiles={() => {}}
			/>
		</main>
	);
}

function change(path: string): FileChange {
	return { path, status: "modified", additions: 1, deletions: 0 };
}

const TREE_FILES = [change("src/app/one.ts"), change("src/app/two.ts"), change("README.md")];

const BROWSE_PATHS = ["README.md", ".env", "src/app/one.ts", "src/app/untracked.ts", "docs/guide.md"];

const MANY_BROWSE_PATHS = Array.from(
	{ length: 500 },
	(_, index) => `src/app/file-${String(index).padStart(3, "0")}.ts`,
);

function ReviewTreeFilesHarness({ browsePaths }: { browsePaths?: string[] }) {
	const row = useRef<HTMLDivElement>(null);
	const [panel] = useState(createReviewPanelStore);
	const closedFiles = useSelector(panel, (state) => state.closedFiles);
	const treeView = useSelector(panel, (state) => state.treeView);
	const focusedPath = useSelector(panel, (state) => state.focusedPath);
	const divider = useDivider({
		value: 200,
		min: 120,
		max: 400,
		sign: 1,
		target: row,
		resolve: () => ({ vars: [], commit: () => {} }),
	});

	return (
		<main
			data-component="review-split"
			data-closed={[...closedFiles].sort().join(" ")}
			data-focused={focusedPath}
			ref={row}
		>
			<ReviewTree
				files={TREE_FILES}
				browsePaths={browsePaths}
				treeView={treeView}
				focusedPath={focusedPath}
				divider={divider}
				onSelectTreeView={panel.actions.selectTreeView}
				onOpenFile={() => {}}
				onToggleFocusFile={(path) => {
					if (focusedPath === path) {
						panel.actions.clearFocus();
						return;
					}

					panel.actions.focusFile(path);
				}}
				onCloseFiles={panel.actions.closeScope}
			/>
		</main>
	);
}

function selectView(view: ReviewTreeView) {
	fireEvent.click(slot(get("review-tree"), `tree-view-${view}`));
}

function directoryRow(name: string) {
	const rows = [...get("review-tree").querySelectorAll<HTMLElement>("[aria-expanded]")];
	const match = rows.find((element) => element.textContent === name);

	if (!match) {
		throw new Error(`No directory row for ${name}`);
	}

	return match;
}

function rowPaths() {
	return [...get("review-tree").querySelectorAll<HTMLElement>("[data-component='review-tree-row']")].map(
		(row) => row.dataset.path,
	);
}

function treeRow(path: string) {
	const match = [...get("review-tree").querySelectorAll<HTMLElement>("[data-component='review-tree-row']")].find(
		(row) => row.dataset.path === path,
	);

	if (!match) {
		throw new Error(`No tree row for ${path}`);
	}

	return match;
}

test("the tree divider redistributes a fixed Review width", () => {
	render(<ReviewTreeHarness />);

	const handle = slot(get("review-tree"), "resize");
	fireEvent.pointerDown(handle, { clientX: 200, pointerId: 1 });
	fireEvent.pointerMove(handle, { clientX: 280, pointerId: 1 });
	fireEvent.pointerUp(handle, { clientX: 280, pointerId: 1 });

	const split = get("review-split");
	expect(split.dataset.treeWidth).toBe("280");
	expect(split.dataset.diffWidth).toBe("730");
	expect(split.dataset.totalWidth).toBe("1010");
});

test("the tree keeps search out of its reading modes", () => {
	render(<ReviewTreeFilesHarness />);

	expect(slot(get("review-tree"), "tree-view-changes")).toBeTruthy();
	expect(slot(get("review-tree"), "tree-view-browse")).toBeTruthy();
	expect(get("review-tree").querySelector('[data-slot="tree-view-search"]')).toBeNull();
});

test("collapsing a directory closes the diffs of the files under it", () => {
	render(<ReviewTreeFilesHarness />);

	fireEvent.click(directoryRow("src/app"));

	expect(get("review-split").dataset.closed).toBe("src/app/one.ts src/app/two.ts");
});

test("expanding a directory reopens every file under it", () => {
	render(<ReviewTreeFilesHarness />);

	fireEvent.click(directoryRow("src/app"));
	fireEvent.click(directoryRow("src/app"));

	expect(get("review-split").dataset.closed).toBe("");
});

test("browsing the repository starts with every directory collapsed", () => {
	render(<ReviewTreeFilesHarness browsePaths={BROWSE_PATHS} />);

	expect(get("review-tree").dataset.treeView).toBe("changes");

	selectView("browse");

	expect(get("review-tree").dataset.treeView).toBe("browse");
	expect(rowPaths()).toEqual(["docs", "src/app", ".env", "README.md"]);
});

test("a browsed file carries the mark of its change and nothing when it has none", () => {
	render(<ReviewTreeFilesHarness browsePaths={BROWSE_PATHS} />);

	selectView("browse");
	fireEvent.click(treeRow("src/app"));

	expect(rowPaths()).toEqual([
		"docs",
		"src/app",
		"src/app/one.ts",
		"src/app/untracked.ts",
		".env",
		"README.md",
	]);
	expect(treeRow("src/app/one.ts").dataset.status).toBe("modified");
	expect(treeRow("src/app/untracked.ts").dataset.status).toBeUndefined();
});

test("a browsed directory stays open when the view leaves and comes back", () => {
	render(<ReviewTreeFilesHarness browsePaths={BROWSE_PATHS} />);

	selectView("browse");
	fireEvent.click(treeRow("src/app"));
	selectView("changes");
	selectView("browse");

	expect(rowPaths()).toEqual([
		"docs",
		"src/app",
		"src/app/one.ts",
		"src/app/untracked.ts",
		".env",
		"README.md",
	]);
});

test("a collapsed changed directory stays collapsed when the view leaves and comes back", () => {
	render(<ReviewTreeFilesHarness browsePaths={BROWSE_PATHS} />);

	fireEvent.click(directoryRow("src/app"));
	selectView("browse");
	selectView("changes");

	expect(rowPaths()).toEqual(["src/app", "README.md"]);
	expect(get("review-split").dataset.closed).toBe("src/app/one.ts src/app/two.ts");
});

test("each view keeps its own focused file across a view switch", () => {
	render(<ReviewTreeFilesHarness browsePaths={BROWSE_PATHS} />);

	fireEvent.click(slot(treeRow("README.md"), "focus"));

	expect(get("review-split").dataset.focused).toBe("README.md");

	selectView("browse");

	expect(get("review-split").dataset.focused).toBeUndefined();

	fireEvent.click(slot(treeRow(".env"), "open"));

	expect(get("review-split").dataset.focused).toBe(".env");

	selectView("changes");

	expect(get("review-split").dataset.focused).toBe("README.md");

	selectView("browse");

	expect(get("review-split").dataset.focused).toBe(".env");
});

test("clicking the browsed file already open closes it", () => {
	render(<ReviewTreeFilesHarness browsePaths={BROWSE_PATHS} />);

	selectView("browse");
	fireEvent.click(slot(treeRow(".env"), "open"));

	expect(get("review-split").dataset.focused).toBe(".env");

	fireEvent.click(slot(treeRow(".env"), "open"));

	expect(get("review-split").dataset.focused).toBeUndefined();
});

test("clicking the changed file already open closes it", () => {
	render(<ReviewTreeFilesHarness />);

	fireEvent.click(slot(treeRow("README.md"), "focus"));

	expect(get("review-split").dataset.focused).toBe("README.md");

	fireEvent.click(slot(treeRow("README.md"), "open"));

	expect(get("review-split").dataset.focused).toBeUndefined();
});

test("a browsed file carries the focus control of the changed files", () => {
	render(<ReviewTreeFilesHarness browsePaths={BROWSE_PATHS} />);

	selectView("browse");
	fireEvent.click(slot(treeRow(".env"), "focus"));

	expect(get("review-split").dataset.focused).toBe(".env");

	fireEvent.click(slot(treeRow(".env"), "focus"));

	expect(get("review-split").dataset.focused).toBeUndefined();
});

test("an expanded browse tree only reaches the DOM as the window under the reader", () => {
	render(<ReviewTreeFilesHarness browsePaths={MANY_BROWSE_PATHS} />);

	selectView("browse");
	fireEvent.click(treeRow("src/app"));

	expect(rowPaths().length).toBeLessThan(MANY_BROWSE_PATHS.length / 4);
	expect(rowPaths()).toContain("src/app/file-000.ts");
});

test("scrolling the browse tree moves the window to the rows under the reader", () => {
	render(<ReviewTreeFilesHarness browsePaths={MANY_BROWSE_PATHS} />);

	selectView("browse");
	fireEvent.click(treeRow("src/app"));
	fireEvent.scroll(slot(get("review-tree"), "list"), { target: { scrollTop: 400 * BROWSE_ROW_HEIGHT } });

	expect(rowPaths()).toContain("src/app/file-399.ts");
	expect(rowPaths()).not.toContain("src/app/file-000.ts");
});

test("selecting the view already on screen keeps the focused file", () => {
	render(<ReviewTreeFilesHarness browsePaths={BROWSE_PATHS} />);

	fireEvent.click(slot(treeRow("README.md"), "focus"));
	selectView("changes");

	expect(get("review-tree").dataset.treeView).toBe("changes");
	expect(get("review-split").dataset.focused).toBe("README.md");

	selectView("browse");
	fireEvent.click(slot(treeRow(".env"), "open"));
	selectView("browse");

	expect(get("review-tree").dataset.treeView).toBe("browse");
	expect(get("review-split").dataset.focused).toBe(".env");
});
