import { ViewColumnsIcon } from "@heroicons/react/24/outline";
import { useCallback, useRef, useState } from "react";
import type { Project } from "@main/store/projects";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { ReviewPanel } from "@renderer/routes/-components/review-panel";
import { ReviewPanelFrame } from "@renderer/routes/-components/review-panel-frame";
import { TerminalPane } from "@renderer/routes/-components/terminal-pane";
import { useDragReorder } from "@renderer/routes/-utils/use-drag-reorder";
import {
	REVIEW_DIFF_WIDTH_VALUE,
	REVIEW_TREE_WIDTH_VALUE,
	usePanelResize,
} from "@renderer/routes/-utils/use-panel-resize";

const DEFAULT_DIFF_WIDTH = 648;
const DEFAULT_TREE_WIDTH = 200;
const MIN_DIFF_WIDTH = 280;
const MIN_TERMINAL_WIDTH = 360;
const MIN_TREE_WIDTH = 120;
const REVIEW_SEPARATOR_WIDTH = 1;

interface ShellTab {
	id: string;
	label: string;
}

export function ProjectWorkspace({
	project,
	active,
	shellFocusRequest,
	fullscreenAnimating,
}: {
	project: Project;
	active: boolean;
	shellFocusRequest: number;
	fullscreenAnimating: boolean;
}) {
	const [tabs, setTabs] = useState<ShellTab[]>(() => [newShellTab(1)]);
	const [activeTabId, setActiveTabId] = useState<string | undefined>(() => tabs[0]?.id);
	const [reviewOpen, setReviewOpen] = useState(true);
	const [reviewAnimating, setReviewAnimating] = useState(false);
	const [treeOpen, setTreeOpen] = useState(true);
	const [treeWidth, setTreeWidth] = useState(DEFAULT_TREE_WIDTH);
	const nextShellNumber = useRef(2);
	const {
		width: diffWidth,
		treeWidth: renderedTreeWidth,
		setPreferredWidth: setDiffWidth,
		rowWidth,
		resizing,
		rowRef,
		separatorProps,
	} = usePanelResize({
		initialWidth: DEFAULT_DIFF_WIDTH,
		minWidth: MIN_DIFF_WIDTH,
		terminalReserve: MIN_TERMINAL_WIDTH,
		tree: treeOpen ? { width: treeWidth, minWidth: MIN_TREE_WIDTH, onSqueeze: setTreeWidth } : undefined,
	});

	const registerTabShortcuts = useCallback(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!active || !event.altKey || event.ctrlKey || event.metaKey || !event.code.startsWith("Digit")) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			const tab = tabs[Number(event.code.slice(5)) - 1];
			if (!tab) {
				return;
			}

			setActiveTabId(tab.id);
		};

		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [active, tabs]);

	const handleNewShell = () => {
		const tab = newShellTab(nextShellNumber.current);
		nextShellNumber.current += 1;
		setTabs((current) => [...current, tab]);
		setActiveTabId(tab.id);
	};
	const startReviewMotion = () => {
		setReviewAnimating(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	};

	const handleToggleReview = () => {
		startReviewMotion();
		setReviewOpen((open) => !open);
	};

	const handleCloseReview = () => {
		startReviewMotion();
		setReviewOpen(false);
	};

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
	const maxTreeWidth = rowWidth === undefined
		? undefined
		: Math.max(MIN_TREE_WIDTH, rowWidth - diffWidth - MIN_TERMINAL_WIDTH);
	const reviewWidth = REVIEW_SEPARATOR_WIDTH + diffWidth + renderedTreeWidth;
	const handleTreeWidthsChange = (widths: { treeWidth: number; diffWidth: number }) => {
		setTreeWidth(widths.treeWidth);
		setDiffWidth(widths.diffWidth);
	};
	const liveReviewWidth = `calc(${REVIEW_DIFF_WIDTH_VALUE} + ${REVIEW_TREE_WIDTH_VALUE} + ${REVIEW_SEPARATOR_WIDTH}px)`;

	return (
		<section
			ref={registerTabShortcuts}
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
					className={`flex h-full w-header shrink-0 items-center justify-center border-outline border-x hover:bg-surface-hover hover:text-primary ${
						reviewOpen ? "bg-surface-active text-primary" : "text-secondary"
					}`}
					aria-expanded={reviewOpen}
					aria-label="Toggle review panel"
					title="Toggle review panel"
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
					resizing={resizing}
					separatorProps={separatorProps}
					onMotionEnd={() => setReviewAnimating(false)}
				>
					<ReviewPanel
						project={project}
						active={active && reviewOpen}
						diffWidth={diffWidth}
						minDiffWidth={MIN_DIFF_WIDTH}
						treeOpen={treeOpen}
						defaultTreeWidth={DEFAULT_TREE_WIDTH}
						treeWidth={treeWidth}
						minTreeWidth={MIN_TREE_WIDTH}
						maxTreeWidth={maxTreeWidth}
						onTreeWidthsChange={handleTreeWidthsChange}
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
