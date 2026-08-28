import { afterAll, afterEach, expect, test } from "bun:test";
import { useSelector } from "@tanstack/react-store";
import { useRef, useState } from "react";
import type { FileChange } from "@shared/review";
import { ReviewDefaultClosure, type ReviewClosedTarget } from "@shared/review-default-closure";
import { ReviewTree } from "@renderer/routes/-features/review/tree/review-tree";
import { TREE_ROW_HEIGHT } from "@renderer/routes/-features/review/tree/review-tree-virtual-rows";
import { DEFAULT_TREE_WIDTH, redistributeReviewTree } from "@renderer/routes/-features/review/panel/review-layout";
import { createReviewPanelStore, type ReviewTreeView } from "@renderer/routes/-features/review/panel/review-panel-store";
import { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";
import { get, querySlot, slot } from "./dom";
import { act, cleanup, fireEvent, render, waitFor } from "./testing-library";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
const frameCallbacks = new Map<number, FrameRequestCallback>();
const scrollIntoViewCalls: { element: HTMLElement; options?: boolean | ScrollIntoViewOptions }[] = [];
let nextFrameId = 1;

globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
	const id = nextFrameId++;
	frameCallbacks.set(id, callback);

	return id;
};
globalThis.cancelAnimationFrame = (id: number) => {
	frameCallbacks.delete(id);
};
Element.prototype.scrollIntoView = function (options?: boolean | ScrollIntoViewOptions) {
	if (!(this instanceof HTMLElement)) {
		return;
	}

	scrollIntoViewCalls.push({ element: this, options });

	if (this.dataset.slot !== "highlighted-marker") {
		return;
	}

	const list = this.parentElement?.parentElement;
	if (!list) {
		return;
	}

	list.scrollTop = Number.parseInt(this.style.top, 10);
	list.dispatchEvent(new Event("scroll"));
};

afterEach(() => {
	cleanup();
	frameCallbacks.clear();
	scrollIntoViewCalls.length = 0;
});

afterAll(() => {
	globalThis.requestAnimationFrame = originalRequestAnimationFrame;
	globalThis.cancelAnimationFrame = originalCancelAnimationFrame;

	if (originalScrollIntoView) {
		Object.defineProperty(Element.prototype, "scrollIntoView", originalScrollIntoView);
	}
});

function flushAnimationFrames() {
	const callbacks = [...frameCallbacks.values()];
	frameCallbacks.clear();

	for (const callback of callbacks) {
		callback(performance.now());
	}
}

function lastScrollIntoViewCall() {
	const call = scrollIntoViewCalls.at(-1);
	if (!call) {
		throw new Error("No element was revealed");
	}

	return call;
}

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
				defaultClosedTargets={[]}
				onSetDefaultClosed={async () => {}}
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

const MANY_CHANGED_FILES = Array.from(
	{ length: 1_000 },
	(_, index) => change(`src/app/file-${String(index).padStart(4, "0")}.ts`),
);

const LARGE_BROWSE_PATHS = Array.from(
	{ length: 100_000 },
	(_, index) =>
		`packages/package-${String(index % 500).padStart(3, "0")}/src/feature-${String(index % 2_000).padStart(4, "0")}/file-${String(index).padStart(6, "0")}.tsx`,
);

function ReviewTreeFilesHarness({
	browsePaths,
	files = TREE_FILES,
	treeWidth = 200,
	browsePathUpdates,
}: {
	browsePaths?: string[];
	files?: FileChange[];
	treeWidth?: number;
	browsePathUpdates?: string[][];
}) {
	const row = useRef<HTMLDivElement>(null);
	const [openedPath, setOpenedPath] = useState<string>();
	const [visibleBrowsePaths, setVisibleBrowsePaths] = useState(browsePaths);
	const [browsePathUpdate, setBrowsePathUpdate] = useState(0);
	const [panel] = useState(createReviewPanelStore);
	const fileClosedOverrides = useSelector(panel, (state) => state.fileClosedOverrides);
	const [defaultClosedTargets, setDefaultClosedTargets] = useState<readonly ReviewClosedTarget[]>([]);
	const closedFiles = new Set(
		[...fileClosedOverrides].flatMap(([path, closed]) => closed ? [path] : []),
	);
	const treeView = useSelector(panel, (state) => state.treeView);
	const focusedPath = useSelector(panel, (state) => state.focusedPath);
	const divider = useDivider({
		value: treeWidth,
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
			data-opened={openedPath}
			ref={row}
		>
			<button type="button" data-slot="outside">
				Outside Tree
			</button>
			{browsePathUpdates && (
				<button
					type="button"
					data-slot="update-browse-paths"
					onClick={() => {
						setVisibleBrowsePaths(browsePathUpdates[browsePathUpdate]);
						setBrowsePathUpdate((browsePathUpdate + 1) % browsePathUpdates.length);
					}}
				>
					Update paths
				</button>
			)}
			<ReviewTree
				files={files}
				browsePaths={visibleBrowsePaths}
				treeView={treeView}
				focusedPath={focusedPath}
				divider={divider}
				onSelectTreeView={panel.actions.selectTreeView}
				onOpenFile={setOpenedPath}
				onToggleFocusFile={(path) => {
					if (focusedPath === path) {
						panel.actions.clearFocus();
						return;
					}

					panel.actions.focusFile(path);
				}}
				onCloseFiles={panel.actions.setFilesClosed}
				defaultClosedTargets={defaultClosedTargets}
				onSetDefaultClosed={async (target, closed) => {
					setDefaultClosedTargets((current) => ReviewDefaultClosure.update(current, target, closed));
				}}
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

function fileRowPaths() {
	return rowPaths().filter((path): path is string => !!path && treeRow(path).dataset.kind === "file");
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

function defaultClosureMenuItem() {
	const item = get("review-tree-default-closure-menu").querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]');
	if (!item) {
		throw new Error("No default closure menu item");
	}

	return item;
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

test("the Tree filter reveals changed descendants of a matching folder", () => {
	render(<ReviewTreeFilesHarness />);

	const input = slot<HTMLInputElement>(get("review-tree"), "tree-filter-input");
	expect(input.placeholder).toBe("Filter changed files");

	fireEvent.input(input, { target: { value: "app" } });

	expect(rowPaths()).toEqual(["src/app", "src/app/one.ts", "src/app/two.ts"]);
	expect(slot(get("review-tree"), "tree-filter-count").dataset.filtered).toBe("2");
	expect(slot(get("review-tree"), "tree-filter-count").dataset.total).toBe("3");
});

test("row actions mark files and folders to close by default without collapsing the Tree", async () => {
	render(<ReviewTreeFilesHarness browsePaths={BROWSE_PATHS} />);

	const directory = treeRow("src/app");
	const directoryToggle = directory.querySelector<HTMLElement>("[aria-expanded]");
	expect(directoryToggle?.getAttribute("aria-expanded")).toBe("true");
	fireEvent.click(slot(directory, "default-closure-actions"));

	let item = defaultClosureMenuItem();
	expect(item.textContent).toContain("Close files by default");
	expect(item.getAttribute("aria-checked")).toBe("false");
	fireEvent.click(item);

	await waitFor(() => {
		expect(slot(treeRow("src/app"), "default-closure-actions").dataset.active).toBe("true");
	});
	expect(directoryToggle?.getAttribute("aria-expanded")).toBe("true");

	fireEvent.click(slot(treeRow("README.md"), "default-closure-actions"));
	item = defaultClosureMenuItem();
	expect(item.textContent).toContain("Close by default");
	fireEvent.click(item);

	await waitFor(() => {
		expect(slot(treeRow("README.md"), "default-closure-actions").dataset.active).toBe("true");
	});
	selectView("browse");
	expect(slot(treeRow("README.md"), "default-closure-actions").dataset.active).toBe("true");
});

test("the always-visible Tree filter uses a full row and compacts safely at the minimum width", () => {
	render(<ReviewTreeFilesHarness treeWidth={120} />);

	const compactFilter = slot(get("review-tree"), "tree-filter-row");
	const announcement = slot(compactFilter, "tree-filter-active-path");
	expect(announcement.dataset.filtering).toBe("false");
	expect(compactFilter.dataset.layout).toBe("compact");
	expect(compactFilter.previousElementSibling).toBe(slot(get("review-tree"), "tree-header"));
	expect(querySlot(compactFilter, "tree-filter-icon")).toBeNull();
	expect(querySlot(compactFilter, "tree-filter-count")).toBeNull();
	expect(slot(get("review-tree"), "tree-view-changes")).toBeTruthy();
	expect(slot(get("review-tree"), "tree-view-browse")).toBeTruthy();
	expect(slot(compactFilter, "tree-filter-input")).toBeTruthy();
	expect(querySlot(compactFilter, "tree-filter-clear")).toBeNull();

	fireEvent.input(slot(compactFilter, "tree-filter-input"), { target: { value: "app" } });

	expect(announcement.dataset.filtering).toBe("true");

	cleanup();
	render(<ReviewTreeFilesHarness />);

	const normalFilter = slot(get("review-tree"), "tree-filter-row");
	expect(normalFilter.dataset.layout).toBe("normal");
	expect(slot(normalFilter, "tree-filter-icon")).toBeTruthy();
	expect(slot(normalFilter, "tree-filter-count")).toBeTruthy();
});

test("the Tree filter keeps its term while Files reveals every descendant of a matching folder", () => {
	render(<ReviewTreeFilesHarness browsePaths={BROWSE_PATHS} />);

	const input = slot<HTMLInputElement>(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: "docs" } });

	expect(get("review-tree-filter-empty").dataset.scope).toBe("changes");

	selectView("browse");

	expect(slot<HTMLInputElement>(get("review-tree"), "tree-filter-input").value).toBe("docs");
	expect(slot<HTMLInputElement>(get("review-tree"), "tree-filter-input").placeholder).toBe("Filter all files");
	expect(rowPaths()).toEqual(["docs", "docs/guide.md"]);
	expect(slot(get("review-tree"), "tree-filter-count").dataset.filtered).toBe("1");
	expect(slot(get("review-tree"), "tree-filter-count").dataset.total).toBe("5");
});

test("a trailing slash narrows the Tree to descendants of the matching folder", () => {
	const prismaMigration = "apps/api/prisma/schema/migrations/split/migration.sql";
	render(
		<ReviewTreeFilesHarness
			files={[
				change(prismaMigration),
				change("apps/api/Nfe.prisma"),
				change("apps/api/src/Integrations/Marketplaces/MercadoLivre/Nfe.ts"),
			]}
		/>,
	);

	fireEvent.input(slot(get("review-tree"), "tree-filter-input"), { target: { value: "prisma/" } });

	expect(rowPaths()).toEqual(["apps/api/prisma/schema/migrations/split", prismaMigration]);
	expect(slot(get("review-tree"), "tree-filter-count").dataset.filtered).toBe("1");
});

test("a term without a slash matches either a folder name or a file name", () => {
	const prismaMigration = "apps/api/prisma/schema/migration.sql";
	const prismaFile = "apps/api/Nfe.prisma";
	const integrationFile = "apps/api/src/Integrations/Marketplaces/MercadoLivre/Nfe.ts";
	render(
		<ReviewTreeFilesHarness files={[change(prismaMigration), change(prismaFile), change(integrationFile)]} />,
	);

	const input = slot(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: "prisma" } });

	expect(fileRowPaths()).toEqual([prismaMigration, prismaFile]);

	fireEvent.input(input, { target: { value: "Nfe" } });

	expect(fileRowPaths()).toEqual([integrationFile, prismaFile]);
});

test("fuzzy Tree matches stay within one path name and mark the name that matched", () => {
	const marketplace = "apps/api/src/Integrations/Marketplaces/MercadoLivre";
	render(
		<ReviewTreeFilesHarness
			files={[change(`${marketplace}/Nfe.ts`), change("src/app/one.ts")]}
		/>,
	);

	const input = slot(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: "mli" } });

	expect(rowPaths()).toEqual([marketplace, `${marketplace}/Nfe.ts`]);
	expect(slot(treeRow(marketplace), "name").dataset.filterMatch).toBe("true");
	expect(slot(treeRow(`${marketplace}/Nfe.ts`), "name").dataset.filterMatch).toBeUndefined();

	fireEvent.input(input, { target: { value: "sane" } });

	expect(get("review-tree-filter-empty").dataset.scope).toBe("changes");
});

test("the Tree filter keeps matching Unicode path names", () => {
	const unicodePath = "src/ação/Árvore.ts";
	render(<ReviewTreeFilesHarness files={[change(unicodePath), change("src/plain/file.ts")]} />);

	fireEvent.input(slot(get("review-tree"), "tree-filter-input"), { target: { value: "áre" } });

	expect(fileRowPaths()).toEqual([unicodePath]);
});

test("keyboard navigation stays visually distinct from the focused file", () => {
	render(<ReviewTreeFilesHarness />);

	fireEvent.input(slot(get("review-tree"), "tree-filter-input"), { target: { value: "one" } });

	const candidate = treeRow("src/app/one.ts");
	expect(candidate.dataset.highlighted).toBe("true");
	expect(candidate.dataset.focused).toBeUndefined();
	expect(slot(candidate, "keyboard-cursor")).toBeTruthy();

	fireEvent.click(slot(candidate, "focus"));

	expect(candidate.dataset.highlighted).toBe("true");
	expect(candidate.dataset.focused).toBe("true");
	expect(slot(candidate, "keyboard-cursor")).toBeTruthy();
});

test("the Tree filter empty state follows the active reading", () => {
	render(<ReviewTreeFilesHarness browsePaths={BROWSE_PATHS} />);

	fireEvent.input(slot(get("review-tree"), "tree-filter-input"), { target: { value: "nowhere" } });

	expect(get("review-tree-filter-empty").dataset.scope).toBe("changes");

	selectView("browse");

	expect(get("review-tree-filter-empty").dataset.scope).toBe("browse");
});

test("Ctrl+F focuses the always-visible filter only from inside the Tree and keyboard navigation opens the highlighted file", () => {
	render(<ReviewTreeFilesHarness />);

	const tree = get("review-tree");
	const input = slot<HTMLInputElement>(tree, "tree-filter-input");
	const outside = slot(get("review-split"), "outside");
	outside.focus();
	fireEvent.keyDown(outside, { key: "f", ctrlKey: true });
	expect(document.activeElement).toBe(outside);

	const readme = slot(treeRow("README.md"), "open");
	readme.focus();
	fireEvent.keyDown(readme, { key: "f", ctrlKey: true });

	expect(document.activeElement).toBe(input);
	fireEvent.input(input, { target: { value: ".ts" } });

	expect(get("review-tree-row", { highlighted: "true" }).dataset.path).toBe("src/app/one.ts");

	fireEvent.keyDown(input, { key: "ArrowDown" });
	expect(get("review-tree-row", { highlighted: "true" }).dataset.path).toBe("src/app/two.ts");

	fireEvent.keyDown(input, { key: "ArrowUp" });
	expect(get("review-tree-row", { highlighted: "true" }).dataset.path).toBe("src/app/one.ts");

	fireEvent.keyDown(input, { key: "ArrowDown" });
	fireEvent.keyDown(input, { key: "Enter" });

	expect(get("review-split").dataset.opened).toBe("src/app/two.ts");
});

test("live Files results keep a valid highlighted path and announce keyboard navigation", () => {
	render(
		<ReviewTreeFilesHarness
			browsePaths={["a.ts", "b.ts", "c.ts"]}
			browsePathUpdates={[["b.ts", "z.ts"]]}
		/>,
	);

	selectView("browse");
	const input = slot<HTMLInputElement>(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: ".ts" } });

	const announcement = slot(get("review-tree"), "tree-filter-active-path");
	expect(input.getAttribute("aria-describedby")).toBe(announcement.id);
	expect(announcement.getAttribute("aria-live")).toBe("polite");
	expect(announcement.dataset.path).toBe("a.ts");

	fireEvent.keyDown(input, { key: "ArrowDown" });
	expect(announcement.dataset.path).toBe("b.ts");

	fireEvent.click(slot(get("review-split"), "update-browse-paths"));
	expect(announcement.dataset.path).toBe("b.ts");
	fireEvent.keyDown(input, { key: "Enter" });
	expect(get("review-split").dataset.focused).toBe("b.ts");

	fireEvent.input(input, { target: { value: "z" } });
	expect(announcement.dataset.path).toBe("z.ts");
	fireEvent.keyDown(input, { key: "Enter" });
	expect(get("review-split").dataset.focused).toBe("z.ts");
});

test("live Files results retire a removed preference without replacing one that remains valid", () => {
	render(
		<ReviewTreeFilesHarness
			browsePaths={["a.ts", "b.ts", "c.ts"]}
			browsePathUpdates={[
				["b.ts", "c.ts"],
				["a.ts", "c.ts"],
				["a.ts", "b.ts", "c.ts"],
			]}
		/>,
	);

	selectView("browse");
	const input = slot<HTMLInputElement>(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: ".ts" } });
	fireEvent.keyDown(input, { key: "ArrowDown" });

	const announcement = slot(get("review-tree"), "tree-filter-active-path");
	expect(announcement.dataset.path).toBe("b.ts");

	const update = slot(get("review-split"), "update-browse-paths");
	fireEvent.click(update);
	expect(announcement.dataset.path).toBe("b.ts");

	fireEvent.click(update);
	expect(announcement.dataset.path).toBe("a.ts");

	fireEvent.click(update);
	expect(announcement.dataset.path).toBe("a.ts");
});

test("Changes reveals each highlighted row with the nearest scroll", () => {
	render(<ReviewTreeFilesHarness />);

	const input = slot<HTMLInputElement>(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: ".ts" } });
	act(flushAnimationFrames);

	let revealed = lastScrollIntoViewCall();
	expect(revealed.element.dataset.path).toBe("src/app/one.ts");
	expect(revealed.options).toEqual({ block: "nearest" });

	fireEvent.keyDown(input, { key: "ArrowDown" });
	act(flushAnimationFrames);

	revealed = lastScrollIntoViewCall();
	expect(revealed.element.dataset.path).toBe("src/app/two.ts");
	expect(revealed.options).toEqual({ block: "nearest" });
});

test("filtered Changes keeps a broad result virtual and reveals the last keyboard candidate", () => {
	render(<ReviewTreeFilesHarness files={MANY_CHANGED_FILES} />);

	const input = slot<HTMLInputElement>(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: ".ts" } });

	expect(rowPaths().length).toBeLessThan(MANY_CHANGED_FILES.length / 4);
	expect(rowPaths()).toContain("src/app/file-0000.ts");

	fireEvent.keyDown(input, { key: "ArrowUp" });

	const marker = slot(get("review-tree"), "highlighted-marker");
	expect(marker.dataset.path).toBe("src/app/file-0999.ts");
	expect(frameCallbacks.size).toBe(1);
	expect(rowPaths()).not.toContain("src/app/file-0999.ts");

	act(flushAnimationFrames);

	expect(rowPaths()).toContain("src/app/file-0999.ts");
	expect(scrollIntoViewCalls.at(-1)?.options).toEqual({ block: "nearest" });
});

test("Changes restores its normal scroll after temporary filtered navigation", () => {
	render(<ReviewTreeFilesHarness files={MANY_CHANGED_FILES} />);

	const list = slot(get("review-tree"), "list");
	const normalScroll = 800 * TREE_ROW_HEIGHT;
	fireEvent.scroll(list, { target: { scrollTop: normalScroll } });

	const input = slot(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: "app" } });
	fireEvent.scroll(list, { target: { scrollTop: 100 * TREE_ROW_HEIGHT } });
	fireEvent.keyDown(input, { key: "Escape" });

	expect(list.scrollTop).toBe(normalScroll);
	expect(rowPaths()).toContain("src/app/file-0799.ts");
});

test("Escape clears the Tree filter without hiding it", () => {
	render(<ReviewTreeFilesHarness />);

	const input = slot<HTMLInputElement>(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: "README" } });

	const filesView = slot(get("review-tree"), "tree-view-browse");
	filesView.focus();
	fireEvent.keyDown(filesView, { key: "Escape" });

	expect(input.value).toBe("");
	expect(slot(get("review-tree"), "tree-filter-input")).toBe(input);
	expect(document.activeElement).toBe(input);
	expect(querySlot(get("review-tree"), "tree-filter-clear")).toBeNull();
	expect(rowPaths()).toEqual(["src/app", "src/app/one.ts", "src/app/two.ts", "README.md"]);
});

test("clear resets the Tree filter and keeps its input focused", () => {
	render(<ReviewTreeFilesHarness />);

	const input = slot<HTMLInputElement>(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: "README" } });
	fireEvent.click(slot(get("review-tree"), "tree-filter-clear"));

	expect(input.value).toBe("");
	expect(slot(get("review-tree"), "tree-filter-input")).toBe(input);
	expect(document.activeElement).toBe(input);
	expect(querySlot(get("review-tree"), "tree-filter-clear")).toBeNull();
	expect(rowPaths()).toEqual(["src/app", "src/app/one.ts", "src/app/two.ts", "README.md"]);
});

test("the Tree filter restores the exact changed-file expansion after temporary collapsing", () => {
	render(<ReviewTreeFilesHarness />);

	fireEvent.click(directoryRow("src/app"));
	expect(rowPaths()).toEqual(["src/app", "README.md"]);

	const input = slot(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: "app" } });
	expect(rowPaths()).toEqual(["src/app", "src/app/one.ts", "src/app/two.ts"]);

	fireEvent.click(directoryRow("src/app"));
	expect(rowPaths()).toEqual(["src/app"]);
	expect(get("review-split").dataset.closed).toBe("src/app/one.ts src/app/two.ts");

	fireEvent.keyDown(input, { key: "Escape" });

	expect(rowPaths()).toEqual(["src/app", "README.md"]);
	expect(get("review-split").dataset.closed).toBe("src/app/one.ts src/app/two.ts");
});

test("the Tree filter restores Files expansion and scroll after temporary navigation", () => {
	render(<ReviewTreeFilesHarness browsePaths={MANY_BROWSE_PATHS} />);

	selectView("browse");
	fireEvent.click(directoryRow("src/app"));
	const list = slot(get("review-tree"), "list");
	const normalScroll = 400 * TREE_ROW_HEIGHT;
	fireEvent.scroll(list, { target: { scrollTop: normalScroll } });

	const input = slot(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: "app" } });
	fireEvent.click(directoryRow("src/app"));
	fireEvent.click(directoryRow("src/app"));
	fireEvent.scroll(list, { target: { scrollTop: 100 * TREE_ROW_HEIGHT } });
	fireEvent.keyDown(input, { key: "Escape" });

	expect(list.scrollTop).toBe(normalScroll);
	expect(rowPaths()).toContain("src/app/file-399.ts");
});

test("the filtered Files reading remains virtualized when a folder match reveals many descendants", () => {
	render(<ReviewTreeFilesHarness browsePaths={MANY_BROWSE_PATHS} />);

	selectView("browse");
	fireEvent.input(slot(get("review-tree"), "tree-filter-input"), { target: { value: "app" } });

	expect(rowPaths().length).toBeLessThan(MANY_BROWSE_PATHS.length / 4);
	expect(rowPaths()).toContain("src/app/file-000.ts");
});

test("rapid typing in a large Files filter waits for one settled result without opening a stale file", async () => {
	render(<ReviewTreeFilesHarness browsePaths={LARGE_BROWSE_PATHS} />);

	selectView("browse");
	const input = slot<HTMLInputElement>(get("review-tree"), "tree-filter-input");
	for (const value of ["p", "pa", "pac", "package-499"]) {
		fireEvent.input(input, { target: { value } });
	}

	expect(input.value).toBe("package-499");
	expect(input.getAttribute("aria-busy")).toBe("true");
	expect(slot(get("review-tree"), "tree-filter-count").dataset.filtered).toBe("100000");
	fireEvent.keyDown(input, { key: "Enter" });
	expect(get("review-split").dataset.focused).toBeUndefined();

	await waitFor(() => expect(input.getAttribute("aria-busy")).toBe("false"));
	expect(slot(get("review-tree"), "tree-filter-count").dataset.filtered).toBe("200");
	fireEvent.keyDown(input, { key: "Enter" });
	expect(get("review-split").dataset.focused).toContain("package-499");
});

test("Files defers revealing a highlighted path beyond the initial virtual window", () => {
	render(<ReviewTreeFilesHarness browsePaths={MANY_BROWSE_PATHS} />);

	selectView("browse");
	const input = slot<HTMLInputElement>(get("review-tree"), "tree-filter-input");
	fireEvent.input(input, { target: { value: "file" } });
	fireEvent.keyDown(input, { key: "ArrowUp" });

	const marker = slot(get("review-tree"), "highlighted-marker");
	expect(marker.dataset.path).toBe("src/app/file-499.ts");
	expect(frameCallbacks.size).toBe(1);
	expect(rowPaths()).not.toContain("src/app/file-499.ts");

	act(flushAnimationFrames);

	expect(rowPaths()).toContain("src/app/file-499.ts");
	expect(scrollIntoViewCalls.at(-1)?.options).toEqual({ block: "nearest" });
});

test("Files reschedules revealing when the highlighted path moves to another row index", () => {
	render(
		<ReviewTreeFilesHarness
			browsePaths={["target.ts"]}
			browsePathUpdates={[["folder/a.ts", "target.ts"]]}
		/>,
	);

	selectView("browse");
	fireEvent.input(slot(get("review-tree"), "tree-filter-input"), { target: { value: ".ts" } });
	act(flushAnimationFrames);
	scrollIntoViewCalls.length = 0;

	fireEvent.click(slot(get("review-split"), "update-browse-paths"));

	expect(slot(get("review-tree"), "highlighted-marker").dataset.path).toBe("target.ts");
	expect(frameCallbacks.size).toBe(1);

	act(flushAnimationFrames);

	expect(scrollIntoViewCalls).toHaveLength(1);
	const revealed = lastScrollIntoViewCall();
	expect(revealed.element.dataset.path).toBe("target.ts");
	expect(revealed.options).toEqual({ block: "nearest" });
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
	fireEvent.click(directoryRow("src/app"));

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
	fireEvent.click(directoryRow("src/app"));
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
	fireEvent.click(directoryRow("src/app"));

	expect(rowPaths().length).toBeLessThan(MANY_BROWSE_PATHS.length / 4);
	expect(rowPaths()).toContain("src/app/file-000.ts");
});

test("scrolling the browse tree moves the window to the rows under the reader", () => {
	render(<ReviewTreeFilesHarness browsePaths={MANY_BROWSE_PATHS} />);

	selectView("browse");
	fireEvent.click(directoryRow("src/app"));
	fireEvent.scroll(slot(get("review-tree"), "list"), { target: { scrollTop: 400 * TREE_ROW_HEIGHT } });

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
