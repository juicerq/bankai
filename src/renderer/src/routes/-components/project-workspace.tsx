import { ViewColumnsIcon } from "@heroicons/react/24/outline";
import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import type { Project } from "@main/store/projects";
import { EmptyState } from "@renderer/routes/-components/empty-state";
import { ReviewPanel } from "@renderer/routes/-components/review-panel";
import { TerminalPane } from "@renderer/routes/-components/terminal-pane";

const DEFAULT_REVIEW_WIDTH = 600;
const MIN_REVIEW_WIDTH = 280;
const MIN_TERMINAL_WIDTH = 360;

type ShellTab = {
	id: string;
	label: string;
};

export function ProjectWorkspace({
	project,
	active,
}: {
	project: Project;
	active: boolean;
}) {
	const [tabs, setTabs] = useState<ShellTab[]>(() => [newShellTab(1)]);
	const [activeTabId, setActiveTabId] = useState<string | undefined>(() => tabs[0]?.id);
	const [reviewOpen, setReviewOpen] = useState(true);
	const [reviewWidth, setReviewWidth] = useState(DEFAULT_REVIEW_WIDTH);
	const [resizing, setResizing] = useState(false);
	const nextShellNumber = useRef(2);
	const rowRef = useRef<HTMLDivElement>(null);
	const dragStart = useRef<{ x: number; width: number } | null>(null);

	const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		dragStart.current = { x: event.clientX, width: reviewWidth };
		setResizing(true);
	};

	const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const start = dragStart.current;
		if (!start) {
			return;
		}
		const rowWidth = rowRef.current?.clientWidth ?? Number.POSITIVE_INFINITY;
		const max = Math.max(MIN_REVIEW_WIDTH, rowWidth - MIN_TERMINAL_WIDTH);
		const next = start.width + (start.x - event.clientX);
		setReviewWidth(Math.min(Math.max(next, MIN_REVIEW_WIDTH), max));
	};

	const handleResizeEnd = () => {
		dragStart.current = null;
		setResizing(false);
	};

	const handleNewShell = () => {
		const tab = newShellTab(nextShellNumber.current);
		nextShellNumber.current += 1;
		setTabs((current) => [...current, tab]);
		setActiveTabId(tab.id);
	};

	const handleCloseShell = (tabId: string) => {
		const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
		const remaining = tabs.filter((tab) => tab.id !== tabId);
		setTabs(remaining);
		if (activeTabId === tabId) {
			setActiveTabId(remaining[Math.max(0, tabIndex - 1)]?.id);
		}
	};

	return (
		<section
			className={active ? "flex h-full min-w-0 flex-col" : "hidden"}
			aria-label={`${project.name} workspace`}
		>
			<header className="flex h-header shrink-0 items-center border-outline border-b bg-surface-raised pr-[120px]">
				<ProjectWorkspaceShellTabs
					tabs={tabs}
					activeTabId={activeTabId}
					onSelect={setActiveTabId}
					onClose={handleCloseShell}
					onNew={handleNewShell}
				/>
				<button
					type="button"
					className={`flex size-header shrink-0 items-center justify-center border-outline border-x hover:bg-surface-hover hover:text-primary ${
						reviewOpen ? "text-tertiary" : "text-secondary"
					}`}
					aria-expanded={reviewOpen}
					aria-label="Toggle review panel"
					title="Toggle review panel"
					onClick={() => setReviewOpen((current) => !current)}
				>
					<ViewColumnsIcon className="size-4" />
				</button>
			</header>

			<div ref={rowRef} className={`flex min-h-0 flex-1 ${resizing ? "cursor-col-resize select-none" : ""}`}>
				<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-sunken">
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
						<div className={tab.id === activeTabId ? "min-h-0 flex-1" : "hidden"} key={tab.id}>
							<TerminalPane projectId={project.id} />
						</div>
					))}
				</div>
				{reviewOpen && (
					<>
						<div
							role="separator"
							aria-orientation="vertical"
							aria-label="Resize review panel"
							className="group flex w-px shrink-0 cursor-col-resize touch-none"
							onPointerDown={handleResizeStart}
							onPointerMove={handleResizeMove}
							onPointerUp={handleResizeEnd}
							onPointerCancel={handleResizeEnd}
						>
							<span className={`w-px ${resizing ? "bg-primary" : "bg-outline group-hover:bg-outline-strong"}`} />
						</div>
						<ReviewPanel
							project={project}
							active={active}
							width={reviewWidth}
							onClose={() => setReviewOpen(false)}
						/>
					</>
				)}
			</div>
		</section>
	);
}

function ProjectWorkspaceShellTabs({
	tabs,
	activeTabId,
	onSelect,
	onClose,
	onNew,
}: {
	tabs: ShellTab[];
	activeTabId: string | undefined;
	onSelect: (tabId: string) => void;
	onClose: (tabId: string) => void;
	onNew: () => void;
}) {
	return (
		<div className="flex min-w-0 flex-1 items-center overflow-hidden" aria-label="Shells">
			{tabs.map((tab) => {
				const selected = tab.id === activeTabId;

				return (
					<div
						className={`flex h-header shrink-0 items-center ${
							selected ? "bg-surface-active" : "hover:bg-surface-hover"
						}`}
						key={tab.id}
					>
						<button
							type="button"
							className={`flex h-full items-center gap-2 pr-1 pl-3 text-body ${
								selected ? "text-primary" : "text-secondary"
							}`}
							aria-pressed={selected}
							onClick={() => onSelect(tab.id)}
						>
							<span className={`size-2 shrink-0 rounded-full ${selected ? "bg-tertiary" : "bg-outline-strong"}`} />
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
				className="flex size-header shrink-0 items-center justify-center border-outline border-r text-secondary text-subtitle hover:bg-surface-hover hover:text-primary"
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
