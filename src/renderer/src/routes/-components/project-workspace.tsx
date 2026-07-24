import { ArrowsPointingInIcon, ArrowsPointingOutIcon, ViewColumnsIcon } from "@heroicons/react/24/outline";
import { memo, useCallback, useRef, useState } from "react";
import type { Project } from "@main/store/projects";
import type { LayoutSettings } from "@main/store/settings";
import type { AgentActivityState } from "@shared/activity";
import { ActivityIndicator } from "@renderer/routes/-components/activity-indicator";
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
import { ACTIVITY_DOT_CLASS } from "@renderer/routes/-utils/agent-activity";
import { useDivider } from "@renderer/routes/-utils/use-divider";
import { useDragReorder } from "@renderer/routes/-utils/use-drag-reorder";
import { useProjectWorkspaceShortcuts } from "@renderer/routes/-utils/use-project-workspace-shortcuts";
import { initialShellTopology, newShellTab, type RestoredShell, type ShellTab } from "@renderer/routes/-utils/shell-topology";

const MIN_TERMINAL_WIDTH = 360;
const REVIEW_SEPARATOR_WIDTH = 1;

export const ProjectWorkspace = memo(function ProjectWorkspace({
	project,
	projects,
	shellActivity,
	active,
	shellFocusRequest,
	fullscreen,
	fullscreenAnimating,
	onToggleFullscreen,
	initialDiffWidth,
	initialTreeWidth,
	onPersistLayout,
	reviewOpen,
	onReviewOpenChange,
	treeOpen,
	onTreeOpenChange,
	restoredShells,
	restoredActiveShellId,
	onShellOpen,
	onShellClose,
	onShellMove,
	onShellSelect,
}: {
	project: Project;
	projects: Project[];
	shellActivity: ReadonlyMap<string, AgentActivityState>;
	active: boolean;
	shellFocusRequest: number;
	fullscreen: boolean;
	fullscreenAnimating: boolean;
	onToggleFullscreen: () => void;
	initialDiffWidth: number;
	initialTreeWidth: number;
	onPersistLayout: (patch: LayoutSettings) => void;
	reviewOpen: boolean;
	onReviewOpenChange: (open: boolean) => void;
	treeOpen: boolean;
	onTreeOpenChange: (open: boolean) => void;
	restoredShells: RestoredShell[] | undefined;
	restoredActiveShellId: string | undefined;
	onShellOpen: (projectId: string, shell: ShellTab) => void;
	onShellClose: (projectId: string, shellId: string) => void;
	onShellMove: (projectId: string, shellId: string, toIndex: number) => void;
	onShellSelect: (projectId: string, shellId: string) => void;
}) {
	const [topology] = useState(() => initialShellTopology(restoredShells, restoredActiveShellId));
	const [tabs, setTabs] = useState<ShellTab[]>(topology.tabs);
	const [activeTabId, setActiveTabId] = useState<string | undefined>(topology.activeTabId);
	const [sessionIds, setSessionIds] = useState<Record<string, string>>({});
	const handleSessionId = useCallback((tabId: string, sessionId: string) => {
		setSessionIds((current) => ({ ...current, [tabId]: sessionId }));
	}, []);
	const [reviewAnimating, setReviewAnimating] = useState(false);
	const [diffWidth, setDiffWidth] = useState(initialDiffWidth);
	const [treeWidth, setTreeWidth] = useState(initialTreeWidth);
	const [rowWidth, setRowWidth] = useState<number>();
	const rowElement = useRef<HTMLDivElement | null>(null);
	const nextShellNumber = useRef(topology.nextShellNumber);
	const pendingDefaultShell = useRef<ShellTab | undefined>(topology.defaultShell);
	const registerDefaultShell = useCallback(
		(node: HTMLSpanElement | null) => {
			if (!node) {
				return;
			}

			const shell = pendingDefaultShell.current;
			if (!shell) {
				return;
			}

			pendingDefaultShell.current = undefined;
			onShellOpen(project.id, shell);
		},
		[onShellOpen, project.id],
	);
	const selectTab = useCallback(
		(tabId: string) => {
			setActiveTabId(tabId);
			onShellSelect(project.id, tabId);
		},
		[onShellSelect, project.id],
	);

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
		onShellOpen(project.id, tab);
	};
	const startReviewMotion = useCallback(() => {
		setReviewAnimating(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	}, []);

	const handleToggleReview = useCallback(() => {
		startReviewMotion();
		onReviewOpenChange(!reviewOpen);
	}, [startReviewMotion, onReviewOpenChange, reviewOpen]);

	const handleCloseReview = () => {
		startReviewMotion();
		onReviewOpenChange(false);
	};
	const registerWorkspaceShortcuts = useProjectWorkspaceShortcuts({
		active,
		tabs,
		onActivateTab: selectTab,
		onToggleReview: handleToggleReview,
	});

	const handleMoveShell = (data: { tabId: string; toIndex: number }) => {
		setTabs((current) => {
			const others = current.filter((tab) => tab.id !== data.tabId);
			const moved = current.filter((tab) => tab.id === data.tabId);

			return [...others.slice(0, data.toIndex), ...moved, ...others.slice(data.toIndex)];
		});
		onShellMove(project.id, data.tabId, data.toIndex);
	};

	const handleCloseShell = (tabId: string) => {
		const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
		const remaining = tabs.filter((tab) => tab.id !== tabId);
		setTabs(remaining);
		setSessionIds((current) => {
			const { [tabId]: _removed, ...rest } = current;
			return rest;
		});
		if (activeTabId === tabId) {
			setActiveTabId(remaining[Math.max(0, tabIndex - 1)]?.id);
		}
		onShellClose(project.id, tabId);
	};
	const reviewWidth = REVIEW_SEPARATOR_WIDTH + renderedDiffWidth + renderedTreeWidth;
	const liveReviewWidth = `calc(${REVIEW_DIFF_WIDTH_VALUE} + ${REVIEW_TREE_WIDTH_VALUE} + ${REVIEW_SEPARATOR_WIDTH}px)`;

	return (
		<section
			ref={registerWorkspaceShortcuts}
			className={`col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col ${active ? "" : "invisible"}`}
			aria-label={`${project.name} workspace`}
		>
			<span ref={registerDefaultShell} hidden />
			<header className="flex h-header shrink-0 items-center border-outline border-b bg-surface-raised pr-[120px]">
				{active && fullscreen && <ActivityIndicator projects={projects} activeProjectId={project.id} />}
				<ProjectWorkspaceShellTabs
					tabs={tabs}
					activeTabId={activeTabId}
					shellActivity={shellActivity}
					sessionIds={sessionIds}
					onSelect={selectTab}
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
					className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden bg-surface-sunken"
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
							className={`col-start-1 row-start-1 min-h-0 min-w-0 overflow-hidden ${tab.id === activeTabId ? "" : "invisible"}`}
							key={tab.id}
						>
							<TerminalPane
								projectId={project.id}
								shellId={tab.id}
								active={active && tab.id === activeTabId}
								focusRequest={shellFocusRequest}
								resizeDeferred={fullscreenAnimating || reviewAnimating || resizing}
								resumeOnMount={topology.resumableShellIds.has(tab.id)}
								onSessionId={(sessionId) => handleSessionId(tab.id, sessionId)}
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
						minDiffWidth={MIN_DIFF_WIDTH}
						treeOpen={treeOpen}
						treeDivider={treeDivider}
						onTreeOpenChange={onTreeOpenChange}
						onClose={handleCloseReview}
					/>
				</ReviewPanelFrame>
			</div>
		</section>
	);
});

export function ProjectWorkspaceShellTabs({
	tabs,
	activeTabId,
	shellActivity,
	sessionIds,
	onSelect,
	onClose,
	onMove,
	onNew,
}: {
	tabs: ShellTab[];
	activeTabId: string | undefined;
	shellActivity: ReadonlyMap<string, AgentActivityState>;
	sessionIds: Record<string, string>;
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
				const sessionId = sessionIds[tab.id];
				const activity = sessionId === undefined ? undefined : shellActivity.get(sessionId);

				return (
					<div
						data-component="shell-tab"
						data-tab-id={tab.id}
						data-active={selected}
						data-activity={activity}
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
						{activity && (
							<span
								className={`size-1.5 shrink-0 rounded-full ${ACTIVITY_DOT_CLASS[activity]}`}
								aria-hidden="true"
							/>
						)}
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

