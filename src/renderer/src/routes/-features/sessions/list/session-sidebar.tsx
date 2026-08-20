import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	FolderOpenIcon,
	PlusIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import type { Project } from "@shared/projects";
import type { ProjectMarks } from "@renderer/routes/-features/projects/use-project-narrowing";
import { BankaiWordmark } from "@renderer/routes/-features/app/chrome/bankai-wordmark";
import { ProjectFilter } from "@renderer/routes/-features/projects/project-filter";
import {
	SessionCard,
	type SessionGestures,
	SessionShelfRow,
} from "@renderer/routes/-features/sessions/list/session-entry";
import { type SessionMenu, SessionRowMenu } from "@renderer/routes/-features/sessions/list/session-row-menu";
import type { SessionRow } from "@renderer/routes/-features/sessions/list/session-rows";
import { SessionSearchField } from "@renderer/routes/-features/sessions/list/session-search-field";
import { SidebarIconButton } from "@renderer/routes/-features/sessions/list/sidebar-icon-button";
import type { useSessionList } from "@renderer/routes/-features/sessions/list/use-session-list";

export function SessionSidebar({
	list,
	projects,
	projectMarks,
	selectedShellId,
	canCreateShell,
	onSelect,
	onCreate,
	onRequestShell,
	onAddProject,
	onToggleProject,
	onExcludeProject,
	onClose,
	onArchive,
	onUnarchive,
	onPin,
	onUnpin,
	onRename,
	footer,
}: {
	list: ReturnType<typeof useSessionList>;
	projects: Project[];
	projectMarks: ProjectMarks;
	selectedShellId: string | undefined;
	canCreateShell: boolean;
	onSelect: (projectId: string, shellId: string) => void;
	onCreate: (projectId: string) => void;
	onRequestShell: (plain: boolean) => void;
	onAddProject: () => void;
	onToggleProject: (projectId: string) => void;
	onExcludeProject: (projectId: string) => void;
	onClose: (projectId: string, shellId: string) => void;
	onArchive: (projectId: string, shellId: string) => void;
	onUnarchive: (projectId: string, shellId: string) => void;
	onPin: (projectId: string, shellId: string) => void;
	onUnpin: (projectId: string, shellId: string) => void;
	onRename: (projectId: string, shellId: string, title: string) => void;
	footer: ReactNode;
}) {
	const [menu, setMenu] = useState<SessionMenu>();
	const [renamingShellId, setRenamingShellId] = useState<string>();

	const togglePin = useCallback((row: SessionRow) => {
		if (row.pinnedAt === undefined) {
			onPin(row.projectId, row.shellId);
			return;
		}

		onUnpin(row.projectId, row.shellId);
	}, [onPin, onUnpin]);

	const gestures: SessionGestures = useMemo(
		() => ({
			selectedShellId,
			renamingShellId,
			onSelect,
			onClose,
			onArchive,
			onUnarchive,
			onTogglePin: togglePin,
			onRename,
			onRenameDone: () => setRenamingShellId(undefined),
			onOpenMenu: (target, event) => setMenu({ ...target, x: event.clientX, y: event.clientY }),
		}),
		[onArchive, onClose, onRename, onSelect, onUnarchive, renamingShellId, selectedShellId, togglePin],
	);

	const empty = list.open.length === 0 && list.archived.length === 0;

	return (
		<aside
			data-component="session-sidebar"
			className="flex min-h-0 w-full shrink-0 flex-col border-r border-outline bg-surface-raised"
		>
			<BankaiWordmark />
			<SessionSearchField
				term={list.term}
				count={list.open.length}
				onSearch={list.onSearch}
				actions={
					<>
						<ProjectFilter
							projects={projects}
							openProjectIds={list.openProjectIds}
							marks={projectMarks}
							onToggle={onToggleProject}
							onExclude={onExcludeProject}
						/>
						<SidebarIconButton slot="add-project" label="Add project" onClick={onAddProject}>
							<FolderOpenIcon className="size-4" aria-hidden="true" />
						</SidebarIconButton>
						<SidebarIconButton
							slot="new-session"
							label="New shell"
							title="New shell (Ctrl+X T) — hold Alt for a shell with no harness"
							disabled={!canCreateShell}
							onClick={(event) => onRequestShell(event.altKey)}
						>
							<PlusIcon className="size-4" aria-hidden="true" />
						</SidebarIconButton>
					</>
				}
			/>
			<div className="min-h-0 flex-1 overflow-auto" aria-label="Sessions">
				{empty && list.searching && (
					<p data-slot="no-match" className="px-3 py-6 text-center text-secondary text-support">
						No session matches “{list.term}”.
					</p>
				)}
				{empty && !list.searching && canCreateShell && (
					<button
						type="button"
						data-slot="start-session"
						className="flex h-9 w-full items-center gap-2 px-3 text-left text-secondary text-support hover:bg-surface-hover hover:text-primary"
						onClick={() => onRequestShell(false)}
					>
						<PlusIcon className="size-3.5" aria-hidden="true" />
						Start a session
					</button>
				)}
				{list.open.map((row) => <SessionCard key={row.shellId} row={row} gestures={gestures} />)}
				{list.archived.length > 0 && (
					<ArchivedShelfHeader
						count={list.archived.length}
						ruled={list.open.length > 0}
						open={list.archivedOpen}
						onToggle={list.toggleArchived}
						onClear={() => {
							for (const row of list.archived) {
								onClose(row.projectId, row.shellId);
							}
						}}
					/>
				)}
				{list.archivedOpen
					&& list.archived.map((row) => <SessionShelfRow key={row.shellId} row={row} gestures={gestures} />)}
			</div>
			<div className="flex min-h-0 max-h-2/5 shrink-0 flex-col border-t border-outline">{footer}</div>
			{menu && (
				<SessionRowMenu
					menu={menu}
					onClose={() => setMenu(undefined)}
					onCreate={onCreate}
					onRename={setRenamingShellId}
					onTogglePin={togglePin}
					onArchive={onArchive}
					onUnarchive={onUnarchive}
					onCloseSession={onClose}
				/>
			)}
		</aside>
	);
}

function ArchivedShelfHeader({
	count,
	ruled,
	open,
	onToggle,
	onClear,
}: {
	count: number;
	ruled: boolean;
	open: boolean;
	onToggle: () => void;
	onClear: () => void;
}) {
	const [armed, setArmed] = useState(false);

	return (
		<div
			className={`group sticky top-0 z-10 flex h-7 w-full items-center bg-surface-raised pr-2 text-label text-secondary ${
				ruled ? "border-outline border-t" : ""
			}`}
			onMouseLeave={() => setArmed(false)}
		>
			<button
				type="button"
				data-component="session-shelf"
				className="flex h-7 min-w-0 flex-1 items-center gap-1 px-3 text-left hover:text-primary"
				aria-expanded={open}
				onClick={onToggle}
			>
				{open
					? <ChevronDownIcon className="size-3" aria-hidden="true" />
					: <ChevronRightIcon className="size-3" aria-hidden="true" />}
				ARCHIVED <span className="text-outline-strong">{count}</span>
			</button>
			{armed
				? (
					<button
						type="button"
						data-slot="confirm-clear-archived"
						className="flex size-5 shrink-0 items-center justify-center text-removed"
						aria-label={`Confirm closing ${count} archived sessions`}
						onClick={() => {
							setArmed(false);
							onClear();
						}}
					>
						<CheckIcon className="size-3.5" aria-hidden="true" />
					</button>
				)
				: (
					<button
						type="button"
						data-slot="clear-archived"
						className="hidden size-5 shrink-0 items-center justify-center text-secondary hover:text-removed group-hover:flex"
						aria-label="Clear archived sessions"
						title="Clear archived sessions"
						onClick={() => setArmed(true)}
					>
						<TrashIcon className="size-3.5" aria-hidden="true" />
					</button>
				)}
		</div>
	);
}
