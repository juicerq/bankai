import { ArrowsPointingInIcon, ArrowsPointingOutIcon, ViewColumnsIcon } from "@heroicons/react/24/outline";
import { useCallback, useRef, useState } from "react";
import type { Project } from "@main/store/projects";
import type { LayoutSettings } from "@main/store/settings";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { ReviewPanel } from "@renderer/routes/-components/review-panel";
import { ReviewPanelFrame } from "@renderer/routes/-components/review-panel-frame";
import { TerminalPane } from "@renderer/routes/-components/terminal-pane";
import {
	MIN_DIFF_WIDTH,
	MIN_TREE_WIDTH,
	REVIEW_DIFF_WIDTH_PROPERTY,
	REVIEW_DIFF_WIDTH_VALUE,
	REVIEW_TREE_WIDTH_PROPERTY,
	REVIEW_TREE_WIDTH_VALUE,
	redistributeReviewTree,
	squeezeReviewDiff,
} from "@renderer/routes/-utils/review-layout";
import { useDivider } from "@renderer/routes/-utils/use-divider";
import { useDragReorder } from "@renderer/routes/-utils/use-drag-reorder";
import { useProjectWorkspaceShortcuts } from "@renderer/routes/-utils/use-project-workspace-shortcuts";

const MIN_TERMINAL_WIDTH = 360;
const REVIEW_SEPARATOR_WIDTH = 1;

interface ShellTab {
	id: string;
	label: string;
}

export function ProjectWorkspace({
	project,
	active,
	shellFocusRequest,
	fullscreen,
	fullscreenAnimating,
	onToggleFullscreen,
	initialDiffWidth,
	initialTreeWidth,
	onPersistLayout,
}: {
	project: Project;
	active: boolean;
	shellFocusRequest: number;
	fullscreen: boolean;
	fullscreenAnimating: boolean;
	onToggleFullscreen: () => void;
	initialDiffWidth: number;
	initialTreeWidth: number;
	onPersistLayout: (patch: LayoutSettings) => void;
}) {
	const [tabs, setTabs] = useState<ShellTab[]>(() => [newShellTab(1)]);
	const [activeTabId, setActiveTabId] = useState<string | undefined>(() => tabs[0]?.id);
	const [reviewOpen, setReviewOpen] = useState(true);
	const [reviewAnimating, setReviewAnimating] = useState(false);
	const [treeOpen, setTreeOpen] = useState(true);
	const [diffWidth, setDiffWidth] = useState(initialDiffWidth);
	const [treeWidth, setTreeWidth] = useState(initialTreeWidth);
	const [rowWidth, setRowWidth] = useState<number>();
	const rowElement = useRef<HTMLDivElement | null>(null);
	const nextShellNumber = useRef(2);

	const treeReserve = treeOpen ? treeWidth : 0;
	const maxDiffWidth = rowWidth === undefined
		? Number.POSITIVE_INFINITY
		: Math.max(MIN_DIFF_WIDTH, rowWidth - MIN_TERMINAL_WIDTH - treeReserve);
	const renderedDiffWidth = Math.min(Math.max(diffWidth, MIN_DIFF_WIDTH), maxDiffWidth);
	const treeCeiling = rowWidth === undefined
		? treeWidth
		: Math.min(treeWidth, Math.max(MIN_TREE_WIDTH, rowWidth - renderedDiffWidth - MIN_TERMINAL_WIDTH));
	const renderedTreeWidth = treeOpen ? treeCeiling : 0;
	const maxTreeWidth = rowWidth === undefined
		? Number.POSITIVE_INFINITY
		: Math.max(MIN_TREE_WIDTH, rowWidth - renderedDiffWidth - MIN_TERMINAL_WIDTH);

	const rowRef = useCallback(
		(element: HTMLDivElement | null) => {
			rowElement.current = element;
			if (!element) {
				return;
			}

			element.style.setProperty(REVIEW_DIFF_WIDTH_PROPERTY, `${renderedDiffWidth}px`);
			element.style.setProperty(REVIEW_TREE_WIDTH_PROPERTY, `${renderedTreeWidth}px`);
			setRowWidth(element.clientWidth);
			const observer = new ResizeObserver(() => setRowWidth(element.clientWidth));
			observer.observe(element);

			return () => observer.disconnect();
		},
		[renderedDiffWidth, renderedTreeWidth],
	);

	const diffDivider = useDivider({
		value: renderedDiffWidth,
		min: MIN_DIFF_WIDTH,
		max: maxDiffWidth,
		sign: -1,
		target: rowElement,
		resolve: (proposed) => {
			const { diff, tree } = squeezeReviewDiff({
				proposed,
				minDiff: MIN_DIFF_WIDTH,
				maxDiff: maxDiffWidth,
				treeOpen,
				minTree: MIN_TREE_WIDTH,
				treeWidth: renderedTreeWidth,
			});

			return {
				vars: [
					{ property: REVIEW_DIFF_WIDTH_PROPERTY, value: diff },
					{ property: REVIEW_TREE_WIDTH_PROPERTY, value: tree },
				],
				commit: () => {
					setDiffWidth(diff);
					if (treeOpen && tree !== renderedTreeWidth) {
						setTreeWidth(tree);
						onPersistLayout({ diffWidth: diff, treeWidth: tree });
						return;
					}
					onPersistLayout({ diffWidth: diff });
				},
			};
		},
	});
	const treeDivider = useDivider({
		value: renderedTreeWidth,
		min: MIN_TREE_WIDTH,
		max: Math.min(maxTreeWidth, renderedTreeWidth + renderedDiffWidth - MIN_DIFF_WIDTH),
		sign: 1,
		target: rowElement,
		resolve: (proposed) => {
			const { tree, diff } = redistributeReviewTree({
				proposed,
				total: renderedTreeWidth + renderedDiffWidth,
				minTree: MIN_TREE_WIDTH,
				minDiff: MIN_DIFF_WIDTH,
			});

			return {
				vars: [
					{ property: REVIEW_TREE_WIDTH_PROPERTY, value: tree },
					{ property: REVIEW_DIFF_WIDTH_PROPERTY, value: diff },
				],
				commit: () => {
					setTreeWidth(tree);
					setDiffWidth(diff);
					onPersistLayout({ diffWidth: diff, treeWidth: tree });
				},
			};
		},
	});
	const resizing = diffDivider.resizing;

	const handleNewShell = () => {
		const tab = newShellTab(nextShellNumber.current);
		nextShellNumber.current += 1;
		setTabs((current) => [...current, tab]);
		setActiveTabId(tab.id);
	};
	const startReviewMotion = useCallback(() => {
		setReviewAnimating(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	}, []);

	const handleToggleReview = useCallback(() => {
		startReviewMotion();
		setReviewOpen((open) => !open);
	}, [startReviewMotion]);

	const handleCloseReview = () => {
		startReviewMotion();
		setReviewOpen(false);
	};
	const registerWorkspaceShortcuts = useProjectWorkspaceShortcuts({
		active,
		tabs,
		onActivateTab: setActiveTabId,
		onToggleReview: handleToggleReview,
	});

	const handleMoveShell = (data: { tabId: string; toIndex: number }) => {
		setTabs((current) => {
			const others = current.filter((tab) => tab.id !== data.tabId);
			const moved = current.filter((tab) => tab.id === data.tabId);

			return [...others.slice(0, data.toIndex), ...moved, ...others.slice(data.toIndex)];
		});
	};

	const handleCloseShell = (tabId: string) => {
		const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
		const remaining = tabs.filter((tab) => tab.id !== tabId);
		setTabs(remaining);
		if (activeTabId === tabId) {
			setActiveTabId(remaining[Math.max(0, tabIndex - 1)]?.id);
		}
	};
	const reviewWidth = REVIEW_SEPARATOR_WIDTH + renderedDiffWidth + renderedTreeWidth;
	const liveReviewWidth = `calc(${REVIEW_DIFF_WIDTH_VALUE} + ${REVIEW_TREE_WIDTH_VALUE} + ${REVIEW_SEPARATOR_WIDTH}px)`;

	return (
		<section
			ref={registerWorkspaceShortcuts}
			className={active ? "flex h-full min-w-0 flex-col" : "hidden"}
			aria-label={`${project.name} workspace`}
		>
			<header className="flex h-header shrink-0 items-center border-outline border-b bg-surface-raised pr-[120px]">
				<ProjectWorkspaceShellTabs
					tabs={tabs}
					activeTabId={activeTabId}
					onSelect={setActiveTabId}
					onClose={handleCloseShell}
					onMove={handleMoveShell}
					onNew={handleNewShell}
				/>
				<button
					type="button"
					className={`flex h-full w-header shrink-0 items-center justify-center border-outline border-l hover:bg-surface-hover hover:text-primary ${
						fullscreen ? "bg-surface-active text-primary" : "text-secondary"
					}`}
					aria-pressed={fullscreen}
					aria-label="Toggle focus mode"
					title="Toggle focus mode (Ctrl+X F)"
					onClick={onToggleFullscreen}
				>
					{fullscreen ? <ArrowsPointingInIcon className="size-4" /> : <ArrowsPointingOutIcon className="size-4" />}
				</button>
				<button
					type="button"
					className={`flex h-full w-header shrink-0 items-center justify-center border-outline border-x hover:bg-surface-hover hover:text-primary ${
						reviewOpen ? "bg-surface-active text-primary" : "text-secondary"
					}`}
					aria-expanded={reviewOpen}
					aria-label="Toggle review panel"
					title="Toggle review panel (Ctrl+X R)"
					onClick={handleToggleReview}
				>
					<ViewColumnsIcon className="size-4" />
				</button>
			</header>

			<div
				ref={rowRef}
				className={`flex min-h-0 flex-1 ${resizing ? "cursor-col-resize select-none" : ""}`}
			>
				<div
					style={{ minWidth: MIN_TERMINAL_WIDTH, contain: "paint" }}
					className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-sunken"
				>
					{tabs.length === 0 && (
						<EmptyState
							mark="›_"
							title="No open shells"
							description={`Start a shell in ${project.name} to continue.`}
							actionLabel="New shell"
							onAction={handleNewShell}
						/>
					)}
					{tabs.map((tab) => (
						<div
							className={tab.id === activeTabId ? "min-h-0 min-w-0 flex-1 overflow-hidden" : "hidden"}
							key={tab.id}
						>
							<TerminalPane
								projectId={project.id}
								active={active && tab.id === activeTabId}
								focusRequest={shellFocusRequest}
								resizeDeferred={fullscreenAnimating || reviewAnimating || resizing}
							/>
						</div>
					))}
				</div>
				<ReviewPanelFrame
					open={reviewOpen}
					animate={reviewAnimating}
					width={reviewWidth}
					liveWidth={liveReviewWidth}
					divider={diffDivider}
					onMotionEnd={() => setReviewAnimating(false)}
				>
					<ReviewPanel
						project={project}
						active={active && reviewOpen}
						minDiffWidth={MIN_DIFF_WIDTH}
						treeOpen={treeOpen}
						treeDivider={treeDivider}
						onTreeOpenChange={setTreeOpen}
						onClose={handleCloseReview}
					/>
				</ReviewPanelFrame>
			</div>
		</section>
	);
}

function ProjectWorkspaceShellTabs({
	tabs,
	activeTabId,
	onSelect,
	onClose,
	onMove,
	onNew,
}: {
	tabs: ShellTab[];
	activeTabId: string | undefined;
	onSelect: (tabId: string) => void;
	onClose: (tabId: string) => void;
	onMove: (data: { tabId: string; toIndex: number }) => void;
	onNew: () => void;
}) {
	const drag = useDragReorder(
		tabs.map((tab) => tab.id),
		(data) => onMove({ tabId: data.id, toIndex: data.toIndex }),
	);

	return (
		<div className="flex h-full min-w-0 flex-1 items-center overflow-hidden" aria-label="Shells">
			{tabs.map((tab) => {
				const selected = tab.id === activeTabId;
				const dropEdge = drag.dropEdge(tab.id);

				return (
					<div
						className={`relative flex h-full shrink-0 items-center border-outline border-r ${
							selected ? "bg-surface-active" : "hover:bg-surface-hover"
						}`}
						key={tab.id}
						{...drag.itemProps(tab.id)}
					>
						{dropEdge && (
							<span
								className={`absolute inset-y-0 w-0.5 bg-tertiary ${dropEdge === "before" ? "left-0" : "right-0"}`}
							/>
						)}
						<button
							type="button"
							className={`flex h-full items-center pr-1 pl-3 text-body ${
								selected ? "text-primary" : "text-secondary"
							}`}
							aria-pressed={selected}
							onClick={() => onSelect(tab.id)}
						>
							{tab.label}
						</button>
						<button
							type="button"
							className="h-full px-3 text-body text-outline-strong hover:text-primary"
							onClick={() => onClose(tab.id)}
							aria-label={`Close ${tab.label}`}
						>
							×
						</button>
					</div>
				);
			})}
			<button
				type="button"
				className="flex h-full w-header shrink-0 items-center justify-center border-outline border-r text-secondary text-subtitle hover:bg-surface-hover hover:text-primary"
				onClick={onNew}
				aria-label="New shell"
			>
				+
			</button>
		</div>
	);
}

function newShellTab(index: number): ShellTab {
	return { id: crypto.randomUUID(), label: `Shell ${index}` };
}
