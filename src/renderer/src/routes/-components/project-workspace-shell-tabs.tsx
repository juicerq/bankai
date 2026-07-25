import { XMarkIcon } from "@heroicons/react/24/outline";
import type { AgentActivityState } from "@shared/activity";
import { ACTIVITY_DOT_CLASS } from "@renderer/routes/-utils/agent-activity";
import type { ShellTab } from "@renderer/routes/-utils/shell-topology";
import { useDragReorder } from "@renderer/routes/-utils/use-drag-reorder";

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
						className={`group relative flex h-full shrink-0 items-center border-outline border-r ${
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
							className={`flex h-full items-center gap-2 pr-1 pl-3 text-body ${
								selected ? "text-primary" : "text-secondary"
							}`}
							aria-pressed={selected}
							onClick={() => onSelect(tab.id)}
						>
							<span
								data-slot="activity-signal"
								className={`size-1.5 shrink-0 rounded-full ${
									activity ? ACTIVITY_DOT_CLASS[activity] : "invisible"
								}`}
								aria-hidden="true"
							/>
							{tab.label}
						</button>
						<button
							type="button"
							data-slot="close"
							className="flex h-full items-center px-2 text-outline-strong opacity-0 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
							onClick={() => onClose(tab.id)}
							aria-label={`Close ${tab.label}`}
							title={selected ? `Close ${tab.label} (Ctrl+X X)` : undefined}
						>
							<XMarkIcon className="size-3.5" aria-hidden="true" />
						</button>
					</div>
				);
			})}
			<button
				type="button"
				className="flex h-full w-header shrink-0 items-center justify-center border-outline border-r text-secondary text-subtitle hover:bg-surface-hover hover:text-primary"
				onClick={onNew}
				aria-label="New shell"
				title="New shell (Ctrl+X T)"
			>
				+
			</button>
		</div>
	);
}
