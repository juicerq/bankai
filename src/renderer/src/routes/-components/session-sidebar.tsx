import {
	ArchiveBoxArrowDownIcon,
	ArrowUturnUpIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	PlusIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { type ReactNode, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "@main/store/projects";
import { BankaiWordmark } from "@renderer/routes/-components/bankai-wordmark";
import { ClaudeGlyph } from "@renderer/routes/-components/claude-glyph";
import { ElapsedClock } from "@renderer/routes/-components/elapsed-clock";
import { MenuItem } from "@renderer/routes/-components/menu-item";
import { ProjectBadges } from "@renderer/routes/-components/project-badges";
import { ACTIVITY_BORDER_CLASS, ACTIVITY_TEXT_CLASS } from "@renderer/routes/-utils/agent-activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { useMenuDismissal } from "@renderer/routes/-utils/use-menu-dismissal";
import type { useSessionList } from "@renderer/routes/-utils/use-session-list";

interface SessionGestures {
	selectedShellId: string | undefined;
	numbers: ReadonlyMap<string, number>;
	renamingShellId: string | undefined;
	onSelect: (projectId: string, shellId: string) => void;
	onClose: (projectId: string, shellId: string) => void;
	onArchive: (projectId: string, shellId: string) => void;
	onUnarchive: (projectId: string, shellId: string) => void;
	onRename: (projectId: string, shellId: string, title: string) => void;
	onRenameDone: () => void;
	onOpenMenu: (target: { row: SessionRow; archived: boolean }, event: React.MouseEvent) => void;
}

export function SessionSidebar({
	list,
	projects,
	chosenProjectIds,
	selectedShellId,
	canCreateShell,
	numbersVisible,
	onSelect,
	onCreate,
	onRequestShell,
	onToggleProject,
	onClose,
	onArchive,
	onUnarchive,
	onRename,
	footer,
}: {
	list: ReturnType<typeof useSessionList>;
	projects: Project[];
	chosenProjectIds: ReadonlySet<string>;
	selectedShellId: string | undefined;
	numbersVisible: boolean;
	canCreateShell: boolean;
	onSelect: (projectId: string, shellId: string) => void;
	onCreate: (projectId: string) => void;
	onRequestShell: (plain: boolean) => void;
	onToggleProject: (projectId: string) => void;
	onClose: (projectId: string, shellId: string) => void;
	onArchive: (projectId: string, shellId: string) => void;
	onUnarchive: (projectId: string, shellId: string) => void;
	onRename: (projectId: string, shellId: string, title: string) => void;
	footer: ReactNode;
}) {
	const [menu, setMenu] = useState<{ row: SessionRow; archived: boolean; x: number; y: number }>();
	const [renamingShellId, setRenamingShellId] = useState<string>();
	const closeMenu = useCallback(() => setMenu(undefined), []);
	const registerMenuDismissal = useMenuDismissal(closeMenu);

	const numbers = new Map(
		numbersVisible ? list.numbered.map((row, index) => [row.shellId, index + 1] as const) : [],
	);

	const gestures: SessionGestures = {
		selectedShellId,
		numbers,
		renamingShellId,
		onSelect,
		onClose,
		onArchive,
		onUnarchive,
		onRename,
		onRenameDone: () => setRenamingShellId(undefined),
		onOpenMenu: (target, event) => setMenu({ ...target, x: event.clientX, y: event.clientY }),
	};

	return (
		<aside
			data-component="session-sidebar"
			className="flex min-h-0 w-full shrink-0 flex-col border-r border-outline bg-surface-raised"
		>
			<BankaiWordmark />
			<div className="flex shrink-0 items-center justify-between border-b border-outline px-3 py-2 text-label text-secondary">
				<span className="flex items-center gap-2">
					SESSIONS <span className="text-outline-strong">{list.open.length}</span>
				</span>
				<button
					type="button"
					data-slot="new-session"
					className="text-secondary hover:text-primary disabled:text-outline-strong"
					disabled={!canCreateShell}
					onClick={(event) => onRequestShell(event.altKey)}
					aria-label="New shell"
					title="New shell (Ctrl+X T) — hold Alt for a shell with no harness"
				>
					<PlusIcon className="size-4" aria-hidden="true" />
				</button>
			</div>
			<ProjectBadges
				projects={projects}
				openProjectIds={list.openProjectIds}
				chosenProjectIds={chosenProjectIds}
				onToggle={onToggleProject}
			/>
			<div className="min-h-0 flex-1 overflow-auto" aria-label="Sessions">
				{list.open.length === 0 && list.archived.length === 0 && canCreateShell && (
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
					<button
						type="button"
						data-component="session-shelf"
						className="flex h-7 w-full items-center gap-1 px-3 text-label text-secondary hover:text-primary"
						aria-expanded={list.archivedOpen}
						onClick={list.toggleArchived}
					>
						{list.archivedOpen
							? <ChevronDownIcon className="size-3" aria-hidden="true" />
							: <ChevronRightIcon className="size-3" aria-hidden="true" />}
						ARCHIVED <span className="text-outline-strong">{list.archived.length}</span>
					</button>
				)}
				{list.archivedOpen
					&& list.archived.map((row) => <SessionShelfRow key={row.shellId} row={row} gestures={gestures} />)}
			</div>
			<div className="flex min-h-0 max-h-2/5 shrink-0 flex-col border-t border-outline">{footer}</div>
			{menu && createPortal(
				<div
					ref={registerMenuDismissal}
					data-component="session-row-menu"
					role="menu"
					aria-label={`Actions for ${menu.row.title}`}
					className="fixed z-50 min-w-52 border border-outline-strong bg-surface-raised text-body shadow-lg"
					style={{
						left: Math.min(menu.x, window.innerWidth - 216),
						top: Math.min(menu.y, window.innerHeight - 140),
					}}
					onPointerDown={(event) => event.stopPropagation()}
				>
					<MenuItem
						label="New shell in this project"
						onClick={() => {
							closeMenu();
							onCreate(menu.row.projectId);
						}}
					/>
					<MenuItem
						label="Rename"
						onClick={() => {
							closeMenu();
							setRenamingShellId(menu.row.shellId);
						}}
					/>
					{menu.archived
						? (
							<MenuItem
								label="Unarchive"
								onClick={() => {
									closeMenu();
									onUnarchive(menu.row.projectId, menu.row.shellId);
								}}
							/>
						)
						: (
							<MenuItem
								label="Archive"
								onClick={() => {
									closeMenu();
									onArchive(menu.row.projectId, menu.row.shellId);
								}}
							/>
						)}
					<div className="border-outline border-t" />
					<MenuItem
						label="Close"
						danger
						onClick={() => {
							closeMenu();
							onClose(menu.row.projectId, menu.row.shellId);
						}}
					/>
				</div>,
				document.body,
			)}
		</aside>
	);
}

function SessionCard({ row, gestures }: { row: SessionRow; gestures: SessionGestures }) {
	return (
		<SessionEntry row={row} gestures={gestures} archived={false}>
			<span className="flex w-full items-center gap-2">
				<span className="min-w-0 flex-1 truncate text-data text-secondary">{row.projectName}</span>
				{row.harness === "claude"
					? <ClaudeGlyph active={row.shellId === gestures.selectedShellId} />
					: row.harness && (
						<span className="shrink-0 border border-outline px-1 text-data text-outline-strong uppercase">
							{row.harness}
						</span>
					)}
			</span>
			<span className="w-full truncate text-body text-primary">{row.title}</span>
			<span
				data-slot="session-trace"
				className={`flex h-3.5 w-full items-baseline gap-1 text-data ${
					row.trace && row.activity ? ACTIVITY_TEXT_CLASS[row.activity] : "text-outline-strong"
				}`}
			>
				<span className="min-w-0 truncate">{row.trace ?? row.branch}</span>
				{row.activity && row.traceSince ? <ElapsedClock since={row.traceSince} /> : null}
			</span>
		</SessionEntry>
	);
}

function SessionShelfRow({ row, gestures }: { row: SessionRow; gestures: SessionGestures }) {
	return (
		<SessionEntry row={row} gestures={gestures} archived>
			<span className="min-w-0 flex-1 truncate text-body text-secondary">{row.title}</span>
			<span className="shrink-0 text-data text-outline-strong group-hover:invisible">{row.projectName}</span>
		</SessionEntry>
	);
}

function SessionEntry({
	row,
	gestures,
	archived,
	children,
}: {
	row: SessionRow;
	gestures: SessionGestures;
	archived: boolean;
	children: ReactNode;
}) {
	const selected = row.shellId === gestures.selectedShellId;
	const number = gestures.numbers.get(row.shellId);

	return (
		<div
			data-component="session-row"
			data-shell-id={row.shellId}
			data-activity={row.activity}
			data-archived={archived ? "" : undefined}
			className={`group relative flex border-l-2 ${
				row.activity ? ACTIVITY_BORDER_CLASS[row.activity] : "border-l-transparent"
			} ${archived ? "" : "border-b border-b-outline"} ${
				selected ? "bg-surface-active" : "hover:bg-surface-hover"
			}`}
			onContextMenu={(event) => {
				event.preventDefault();
				gestures.onOpenMenu({ row, archived }, event);
			}}
		>
			{gestures.renamingShellId === row.shellId
				? <SessionRename row={row} onRename={gestures.onRename} onDone={gestures.onRenameDone} />
				: (
					<button
						type="button"
						data-slot="open-session"
						className={`flex min-w-0 flex-1 px-3 text-left ${
							archived ? "h-7 items-center gap-2" : "flex-col justify-center gap-1 py-2"
						}`}
						aria-pressed={selected}
						onClick={() => gestures.onSelect(row.projectId, row.shellId)}
					>
						{children}
					</button>
				)}
			{number !== undefined && !selected && (
				<span
					data-slot="session-number"
					className="absolute top-0 right-0 flex h-7 w-7 items-center justify-center bg-tertiary text-data text-surface"
					aria-hidden="true"
				>
					{number}
				</span>
			)}
			<span className="absolute top-0 right-0 hidden bg-inherit group-hover:flex">
				{archived
					? (
						<button
							type="button"
							data-slot="unarchive-session"
							className="flex h-7 w-7 items-center justify-center text-secondary hover:text-primary"
							aria-label={`Unarchive ${row.title}`}
							title="Unarchive"
							onClick={() => gestures.onUnarchive(row.projectId, row.shellId)}
						>
							<ArrowUturnUpIcon className="size-3.5" aria-hidden="true" />
						</button>
					)
					: (
						<button
							type="button"
							data-slot="archive-session"
							className="flex h-7 w-7 items-center justify-center text-secondary hover:text-primary"
							aria-label={`Archive ${row.title}`}
							title="Archive"
							onClick={() => gestures.onArchive(row.projectId, row.shellId)}
						>
							<ArchiveBoxArrowDownIcon className="size-3.5" aria-hidden="true" />
						</button>
					)}
				<button
					type="button"
					data-slot="close-session"
					className="flex h-7 w-7 items-center justify-center text-secondary hover:text-primary"
					aria-label={`Close ${row.title}`}
					onClick={() => gestures.onClose(row.projectId, row.shellId)}
				>
					<XMarkIcon className="size-3.5" aria-hidden="true" />
				</button>
			</span>
		</div>
	);
}

function SessionRename({
	row,
	onRename,
	onDone,
}: {
	row: SessionRow;
	onRename: (projectId: string, shellId: string, title: string) => void;
	onDone: () => void;
}) {
	const commit = (value: string) => {
		const title = value.trim();
		if (title && title !== row.title) {
			onRename(row.projectId, row.shellId, title);
		}

		onDone();
	};

	return (
		<input
			data-slot="rename-session"
			autoFocus
			aria-label={`Rename ${row.title}`}
			defaultValue={row.title}
			className="h-7 min-w-0 flex-1 border border-tertiary bg-surface px-3 text-body text-primary outline-none"
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					commit(event.currentTarget.value);
				}
				if (event.key === "Escape") {
					onDone();
				}
			}}
			onBlur={(event) => commit(event.currentTarget.value)}
		/>
	);
}
