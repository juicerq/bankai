import { DocumentDuplicateIcon, MagnifyingGlassIcon, PencilSquareIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { type MouseEvent, type UIEvent, useCallback, useId, useMemo, useRef, useState } from "react";
import type { FileChange } from "@shared/review";
import { ReviewDefaultClosure, type ReviewClosedTarget } from "@shared/review-default-closure";
import { Divider } from "@renderer/routes/-features/shared/interaction/divider";
import { REVIEW_TREE_WIDTH_VALUE } from "@renderer/routes/-features/review/panel/review-layout";
import type { ReviewTreeView } from "@renderer/routes/-features/review/panel/review-panel-store";
import {
	fileTree,
	fileTreeDirectories,
	fileTreeRows,
	filterFileTreeRows,
} from "@renderer/routes/-features/review/tree/file-tree";
import { ReviewTreeBrowse } from "@renderer/routes/-features/review/tree/review-tree-browse";
import { ReviewTreeChanges } from "@renderer/routes/-features/review/tree/review-tree-changes";
import {
	ReviewTreeRowFilter,
	type ReviewTreeItem,
} from "@renderer/routes/-features/review/tree/review-tree-rows";
import type { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";
import {
	ReviewTreeDefaultClosureMenu,
	type ReviewTreeDefaultClosureMenuState,
} from "@renderer/routes/-features/review/tree/review-tree-default-closure-menu";

const COMPACT_FILTER_WIDTH = 160;
const LARGE_TREE_FILTER_DELAY_MS = 80;
const LARGE_TREE_PATHS = 10_000;

const TREE_VIEW_SEGMENTS: {
	view: ReviewTreeView;
	label: string;
	title: string;
	icon: typeof PencilSquareIcon;
}[] = [
	{ view: "changes", label: "Diff", title: "Show changed files", icon: PencilSquareIcon },
	{ view: "browse", label: "Files", title: "Browse repository files", icon: DocumentDuplicateIcon },
];

function activePathMessage(filtering: boolean, highlightedPath?: string) {
	if (!filtering) {
		return "Type to filter files";
	}

	if (!highlightedPath) {
		return "No matching file";
	}

	return highlightedPath;
}

function useReviewTreeState({
	files,
	browsePaths,
	treeView,
	focusedPath,
	onOpenFile,
	onToggleFocusFile,
}: {
	files: FileChange[];
	browsePaths?: string[];
	treeView: ReviewTreeView;
	focusedPath?: string;
	onOpenFile: (path: string) => void;
	onToggleFocusFile: (path: string) => void;
}) {
	const browsing = treeView === "browse";
	const [collapsedChanges, setCollapsedChanges] = useState<ReadonlySet<string>>(new Set());
	const [expandedBrowse, setExpandedBrowse] = useState<ReadonlySet<string>>(new Set());
	const [filter, setFilter] = useState("");
	const [settledFilter, setSettledFilter] = useState("");
	const [preferredHighlightedPath, setPreferredHighlightedPath] = useState<string>();
	const [filterCollapsed, setFilterCollapsed] = useState<Record<ReviewTreeView, ReadonlySet<string>>>(() => ({
		changes: new Set(),
		browse: new Set(),
	}));
	const activePathId = useId();
	const filterInput = useRef<HTMLInputElement>(null);
	const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const scrollTops = useRef<Record<ReviewTreeView, number>>({ changes: 0, browse: 0 });
	const filterScrollTops = useRef<Record<ReviewTreeView, number>>({ changes: 0, browse: 0 });
	const [listNode, setListNode] = useState<HTMLDivElement | null>(null);
	const paths = useMemo(
		() => (browsing ? (browsePaths ?? []) : files.map((file) => file.path)),
		[browsePaths, browsing, files],
	);
	const tree = useMemo(() => {
		if (!browsing) {
			return fileTree<ReviewTreeItem>(files.map((file) => ({ path: file.path, item: file })));
		}

		const changed = new Map(files.map((file) => [file.path, file]));

		return fileTree<ReviewTreeItem>(
			(browsePaths ?? []).map((path) => ({ path, item: changed.get(path) })),
		);
	}, [browsePaths, browsing, files]);
	const needle = settledFilter.trim().toLowerCase();
	const filtering = needle.length > 0;
	const browseCollapsed = useMemo(
		() => new Set(fileTreeDirectories(tree).filter((path) => !expandedBrowse.has(path))),
		[expandedBrowse, tree],
	);
	const visibleCollapsed = useMemo(() => {
		if (filtering) {
			return filterCollapsed[treeView];
		}

		if (browsing) {
			return browseCollapsed;
		}

		return collapsedChanges;
	}, [browseCollapsed, browsing, collapsedChanges, filterCollapsed, filtering, treeView]);
	const filtered = useMemo(() => {
		if (filtering) {
			return filterFileTreeRows(tree, settledFilter, visibleCollapsed);
		}

		const rows = fileTreeRows(tree, visibleCollapsed);

		return {
			rows,
			paths: rows.flatMap(({ node }) => (node.kind === "file" ? [node.path] : [])),
			count: paths.length,
		};
	}, [filtering, paths.length, settledFilter, tree, visibleCollapsed]);
	const rows = filtered.rows;
	const navigablePaths = filtered.paths;
	const highlightedPath = filtering
		? navigablePaths.find((path) => path === preferredHighlightedPath) ?? navigablePaths[0]
		: undefined;
	const activePathAnnouncement = activePathMessage(filtering, highlightedPath);
	const visibleFileCount = `${filtered.count} ${filtered.count === 1 ? "file" : "files"}`;
	const filterEmpty = filtering && filtered.count === 0 && !(browsing && !browsePaths);

	if (preferredHighlightedPath !== highlightedPath) {
		setPreferredHighlightedPath(highlightedPath);
	}

	const attachList = useCallback(
		(node: HTMLDivElement | null) => {
			setListNode(node);

			if (node) {
				node.scrollTop = filtering ? filterScrollTops.current[treeView] : scrollTops.current[treeView];
			}
		},
		[filtering, treeView],
	);
	const attachFilterInput = useCallback((node: HTMLInputElement | null) => {
		filterInput.current = node;

		if (!node && filterTimer.current) {
			clearTimeout(filterTimer.current);
		}
	}, []);

	const trackScroll = (event: UIEvent<HTMLDivElement>) => {
		if (filtering) {
			filterScrollTops.current[treeView] = event.currentTarget.scrollTop;
			return;
		}

		scrollTops.current[treeView] = event.currentTarget.scrollTop;
	};

	const openChangedFile = (path: string) => {
		if (path === focusedPath) {
			onToggleFocusFile(path);
			return;
		}

		onOpenFile(path);
	};

	const clearFilter = () => {
		filterInput.current?.focus();
		if (filterTimer.current) {
			clearTimeout(filterTimer.current);
			filterTimer.current = null;
		}

		setFilter("");
		setSettledFilter("");
		setFilterCollapsed({ changes: new Set(), browse: new Set() });
		setPreferredHighlightedPath(undefined);
		filterScrollTops.current = { changes: 0, browse: 0 };
	};

	const updateFilter = (value: string) => {
		setFilter(value);
		setFilterCollapsed({ changes: new Set(), browse: new Set() });

		if (filterTimer.current) {
			clearTimeout(filterTimer.current);
			filterTimer.current = null;
		}

		if (paths.length < LARGE_TREE_PATHS || value.trim().length === 0) {
			setSettledFilter(value);
			return;
		}

		filterTimer.current = setTimeout(() => {
			filterTimer.current = null;
			setSettledFilter(value);
		}, LARGE_TREE_FILTER_DELAY_MS);
	};

	const updateFilterCollapsed = (collapsed: ReadonlySet<string>) => {
		setFilterCollapsed((current) => ({ ...current, [treeView]: collapsed }));
	};

	const navigateFilter = (direction: -1 | 1) => {
		if (filter !== settledFilter || !highlightedPath) {
			return;
		}

		const current = navigablePaths.indexOf(highlightedPath);
		const next = (current + direction + navigablePaths.length) % navigablePaths.length;
		setPreferredHighlightedPath(navigablePaths[next]);
	};

	const openHighlightedPath = () => {
		if (filter !== settledFilter || !highlightedPath) {
			return;
		}

		if (browsing) {
			onToggleFocusFile(highlightedPath);
			return;
		}

		openChangedFile(highlightedPath);
	};
	const initialOffset = filtering ? filterScrollTops.current[treeView] : scrollTops.current[treeView];
	const focusFilter = () => {
		filterInput.current?.focus();
	};

	return {
		browsing,
		filter,
		settledFilter,
		filtering,
		filterEmpty,
		filterCollapsed,
		filterLabel: browsing ? "Filter all files" : "Filter changed files",
		emptyLabel: browsing ? "No files match this filter." : "No changed files match this filter.",
		listKey: filtering ? "filtered" : "normal",
		initialOffset,
		rows,
		paths,
		count: filtered.count,
		visibleFileCount,
		visibleCollapsed,
		collapsedChanges,
		expandedBrowse,
		highlightedPath,
		activePathId,
		activePathAnnouncement,
		listNode,
		attachList,
		attachFilterInput,
		focusFilter,
		trackScroll,
		clearFilter,
		updateFilter,
		updateFilterCollapsed,
		navigateFilter,
		openHighlightedPath,
		openChangedFile,
		setCollapsedChanges,
		setExpandedBrowse,
	};
}

export function ReviewTree({
	files,
	browsePaths,
	treeView,
	focusedPath,
	divider,
	onSelectTreeView,
	onOpenFile,
	onToggleFocusFile,
	onCloseFiles,
	defaultClosedTargets,
	onSetDefaultClosed,
}: {
	files: FileChange[];
	browsePaths?: string[];
	treeView: ReviewTreeView;
	focusedPath?: string;
	divider: ReturnType<typeof useDivider>;
	onSelectTreeView: (view: ReviewTreeView) => void;
	onOpenFile: (path: string) => void;
	onToggleFocusFile: (path: string) => void;
	onCloseFiles: (paths: string[], closed: boolean) => void;
	defaultClosedTargets: readonly ReviewClosedTarget[];
	onSetDefaultClosed: (target: ReviewClosedTarget, closed: boolean) => Promise<void>;
}) {
	const [actionsMenu, setActionsMenu] = useState<ReviewTreeDefaultClosureMenuState>();
	const compactFilter = divider.valueNow <= COMPACT_FILTER_WIDTH;
	const {
		browsing,
		filter,
		settledFilter,
		filtering,
		filterEmpty,
		filterCollapsed,
		filterLabel,
		emptyLabel,
		listKey,
		initialOffset,
		rows,
		paths,
		count,
		visibleFileCount,
		visibleCollapsed,
		collapsedChanges,
		expandedBrowse,
		highlightedPath,
		activePathId,
		activePathAnnouncement,
		listNode,
		attachList,
		attachFilterInput,
		focusFilter,
		trackScroll,
		clearFilter,
		updateFilter,
		updateFilterCollapsed,
		navigateFilter,
		openHighlightedPath,
		openChangedFile,
		setCollapsedChanges,
		setExpandedBrowse,
	} = useReviewTreeState({ files, browsePaths, treeView, focusedPath, onOpenFile, onToggleFocusFile });
	const isDefaultClosed = useCallback(
		(target: ReviewClosedTarget) => ReviewDefaultClosure.has(defaultClosedTargets, target),
		[defaultClosedTargets],
	);
	const openActions = (event: MouseEvent<HTMLButtonElement>, target: ReviewClosedTarget) => {
		const rect = event.currentTarget.getBoundingClientRect();
		setActionsMenu({ target, x: rect.right - 192, y: rect.bottom });
	};

	return (
		<div
			data-component="review-tree"
			data-tree-view={treeView}
			data-width={divider.valueNow}
			style={{ width: REVIEW_TREE_WIDTH_VALUE }}
			className={`relative flex shrink-0 flex-col ${divider.resizing ? "cursor-col-resize select-none" : ""}`}
			aria-label="Tree"
			onKeyDown={(event) => {
				if (filter.length > 0 && event.key === "Escape") {
					event.preventDefault();
					clearFilter();
					return;
				}

				if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
					event.preventDefault();
					focusFilter();
				}
			}}
		>
			<div data-slot="tree-header" className="flex h-header shrink-0 border-outline border-b text-label">
				{TREE_VIEW_SEGMENTS.map(({ view, label, title, icon: Icon }, index) => (
					<button
						key={view}
						type="button"
						data-slot={`tree-view-${view}`}
						className={`flex h-full min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap border-outline hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary ${
							index < TREE_VIEW_SEGMENTS.length - 1 ? "border-r" : ""
						} ${treeView === view ? "bg-surface-active text-primary" : "text-secondary"}`}
						aria-pressed={treeView === view}
						aria-label={title}
						title={title}
						onClick={() => onSelectTreeView(view)}
					>
						<Icon className="size-3.5" aria-hidden="true" />
						{!compactFilter && <span className="truncate">{label}</span>}
					</button>
				))}
			</div>
			<div
				data-slot="tree-filter-row"
				data-layout={compactFilter ? "compact" : "normal"}
				className="flex h-header shrink-0 items-center border-outline border-b"
			>
				<div className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
					{!compactFilter && (
						<MagnifyingGlassIcon
							data-slot="tree-filter-icon"
							className="ml-2 size-3.5 shrink-0 text-secondary"
							aria-hidden="true"
						/>
					)}
					<input
						ref={attachFilterInput}
						data-slot="tree-filter-input"
						value={filter}
						placeholder={filterLabel}
						aria-label={filterLabel}
						aria-describedby={activePathId}
						aria-busy={filter !== settledFilter}
						spellCheck={false}
						autoComplete="off"
						className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-body text-primary outline-none placeholder:text-secondary"
						onInput={(event) => updateFilter(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "ArrowDown") {
								event.preventDefault();
								navigateFilter(1);
								return;
							}

							if (event.key === "ArrowUp") {
								event.preventDefault();
								navigateFilter(-1);
								return;
							}

							if (event.key === "Enter") {
								event.preventDefault();
								openHighlightedPath();
							}
						}}
					/>
					{!compactFilter && (
						<span
							data-slot="tree-filter-count"
							data-filtered={count}
							data-total={paths.length}
							aria-label={`${count} of ${paths.length} files`}
							title={`${count} of ${paths.length} files`}
							className="flex h-full shrink-0 items-center px-2 text-data text-outline-strong tabular-nums"
						>
							{visibleFileCount}
						</span>
					)}
					{filter.length > 0 && (
						<button
							type="button"
							data-slot="tree-filter-clear"
							aria-label="Clear Tree filter"
							title="Clear Tree filter"
							className="flex h-full w-7 shrink-0 items-center justify-center text-secondary hover:bg-surface-hover hover:text-primary active:bg-surface-active focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
							onClick={clearFilter}
						>
							<XMarkIcon className="size-3.5" aria-hidden="true" />
						</button>
					)}
				</div>
				<span
					id={activePathId}
					data-slot="tree-filter-active-path"
					data-filtering={filtering}
					data-path={highlightedPath}
					aria-live="polite"
					className="sr-only"
				>
					{activePathAnnouncement}
				</span>
			</div>
			<div
				key={treeView}
				data-slot="list"
				ref={attachList}
				onScroll={trackScroll}
				className="min-h-0 flex-1 overflow-auto"
			>
				<ReviewTreeRowFilter query={settledFilter}>
					{filterEmpty && (
						<div
							data-component="review-tree-filter-empty"
							data-scope={treeView}
							className="px-3 py-2 text-body text-secondary"
						>
							{emptyLabel}
						</div>
					)}
					{!filterEmpty && browsing && (
						<ReviewTreeBrowse
							key={listKey}
							loading={!browsePaths}
							rows={rows}
							filtering={filtering}
							collapsed={visibleCollapsed}
							filterCollapsed={filterCollapsed.browse}
							focusedPath={focusedPath}
							highlightedPath={highlightedPath}
							expanded={expandedBrowse}
							scrollElement={listNode}
							initialOffset={initialOffset}
							onExpandedChange={setExpandedBrowse}
							onFilterCollapsedChange={updateFilterCollapsed}
							onToggleFocus={onToggleFocusFile}
							isDefaultClosed={isDefaultClosed}
							onOpenActions={openActions}
						/>
					)}
					{!filterEmpty && !browsing && (
						<ReviewTreeChanges
							key={listKey}
							rows={rows}
							filtering={filtering}
							filterCollapsed={filterCollapsed.changes}
							focusedPath={focusedPath}
							highlightedPath={highlightedPath}
							collapsed={collapsedChanges}
							onCollapsedChange={setCollapsedChanges}
							onFilterCollapsedChange={updateFilterCollapsed}
							onOpenFile={openChangedFile}
							onToggleFocusFile={onToggleFocusFile}
							onCloseFiles={onCloseFiles}
							isDefaultClosed={isDefaultClosed}
							onOpenActions={openActions}
							scrollElement={listNode}
							initialOffset={initialOffset}
						/>
					)}
				</ReviewTreeRowFilter>
			</div>
			{actionsMenu && (
				<ReviewTreeDefaultClosureMenu
					key={`${actionsMenu.target.kind}:${actionsMenu.target.path}`}
					menu={actionsMenu}
					active={isDefaultClosed(actionsMenu.target)}
					onClose={() => setActionsMenu(undefined)}
					onSet={onSetDefaultClosed}
				/>
			)}
			<Divider control={divider} side="right" label="Resize tree" />
		</div>
	);
}
