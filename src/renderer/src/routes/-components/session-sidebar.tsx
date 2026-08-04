import {
	ArchiveBoxArrowDownIcon,
	ArrowUturnUpIcon,
	BookmarkIcon,
	BookmarkSlashIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	PlusIcon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { type ReactElement, type ReactNode, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "@main/store/projects";
import { BankaiWordmark } from "@renderer/routes/-components/bankai-wordmark";
import { ClaudeGlyph } from "@renderer/routes/-components/claude-glyph";
import { CodexGlyph } from "@renderer/routes/-components/codex-glyph";
import { ElapsedClock } from "@renderer/routes/-components/elapsed-clock";
import { MenuItem } from "@renderer/routes/-components/menu-item";
import { ProjectNarrowing } from "@renderer/routes/-components/project-narrowing";
import { ShellGlyph } from "@renderer/routes/-components/shell-glyph";
import { ACTIVITY_BORDER_CLASS, ACTIVITY_LABEL, ACTIVITY_TEXT_CLASS } from "@renderer/routes/-utils/agent-activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { useMenuDismissal } from "@renderer/routes/-utils/use-menu-dismissal";
import type { useSessionList } from "@renderer/routes/-utils/use-session-list";

interface SessionGestures {
	selectedShellId: string | undefined;
	renamingShellId: string | undefined;
	onSelect: (projectId: string, shellId: string) => void;
	onClose: (projectId: string, shellId: string) => void;
	onArchive: (projectId: string, shellId: string) => void;
	onUnarchive: (projectId: string, shellId: string) => void;
	onTogglePin: (row: SessionRow) => void;
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
	onSelect,
	onCreate,
	onRequestShell,
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
	chosenProjectIds: ReadonlySet<string>;
	selectedShellId: string | undefined;
	canCreateShell: boolean;
	onSelect: (projectId: string, shellId: string) => void;
	onCreate: (projectId: string) => void;
	onRequestShell: (plain: boolean) => void;
	onToggleProject: (projectId: string) => void;
	onExcludeProject: (projectId: string, listedIds: readonly string[]) => void;
	onClose: (projectId: string, shellId: string) => void;
	onArchive: (projectId: string, shellId: string) => void;
	onUnarchive: (projectId: string, shellId: string) => void;
	onPin: (projectId: string, shellId: string) => void;
	onUnpin: (projectId: string, shellId: string) => void;
	onRename: (projectId: string, shellId: string, title: string) => void;
	footer: ReactNode;
}) {
	const [menu, setMenu] = useState<{ row: SessionRow; archived: boolean; x: number; y: number }>();
	const [renamingShellId, setRenamingShellId] = useState<string>();
	const closeMenu = useCallback(() => setMenu(undefined), []);
	const registerMenuDismissal = useMenuDismissal(closeMenu);

	const togglePin = (row: SessionRow) => {
		if (row.pinnedAt === undefined) {
			onPin(row.projectId, row.shellId);
			return;
		}

		onUnpin(row.projectId, row.shellId);
	};

	const gestures: SessionGestures = {
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
			<ProjectNarrowing
				projects={projects}
				openProjectIds={list.openProjectIds}
				chosenProjectIds={chosenProjectIds}
				onToggle={onToggleProject}
				onExclude={onExcludeProject}
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
					<ArchivedShelfHeader
						count={list.archived.length}
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
					{!menu.archived && (
						<MenuItem
							label={menu.row.pinnedAt === undefined ? "Pin" : "Unpin"}
							onClick={() => {
								closeMenu();
								togglePin(menu.row);
							}}
						/>
					)}
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

function ArchivedShelfHeader({
	count,
	open,
	onToggle,
	onClear,
}: {
	count: number;
	open: boolean;
	onToggle: () => void;
	onClear: () => void;
}) {
	const [armed, setArmed] = useState(false);

	return (
		<div
			className="group flex h-7 w-full items-center pr-2 text-label text-secondary"
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

const HARNESS_GLYPH: Record<string, (props: { active: boolean }) => ReactElement> = {
	claude: ClaudeGlyph,
	codex: CodexGlyph,
};

function HarnessMark({ harness, active }: { harness: string | undefined; active: boolean }) {
	if (!harness) {
		return <ShellGlyph active={active} />;
	}

	const Glyph = HARNESS_GLYPH[harness];
	if (Glyph) {
		return <Glyph active={active} />;
	}

	return (
		<span
			className={`shrink-0 border px-1 text-data uppercase ${
				active ? "border-tertiary text-tertiary" : "border-outline text-outline-strong"
			}`}
		>
			{harness}
		</span>
	);
}

function SessionCard({ row, gestures }: { row: SessionRow; gestures: SessionGestures }) {
	return (
		<SessionEntry row={row} gestures={gestures} archived={false}>
			<span className="flex w-full items-center gap-2">
				{row.pinnedAt !== undefined && (
					<BookmarkIcon
						data-slot="pinned-mark"
						role="img"
						aria-label="Pinned"
						className="size-3 shrink-0 text-tertiary"
					/>
				)}
				<span className="min-w-0 flex-1 truncate text-data text-secondary">{row.projectName}</span>
				<HarnessMark harness={row.harness} active={row.shellId === gestures.selectedShellId} />
			</span>
			<span className="w-full truncate text-body text-primary">{row.title}</span>
			<span
				data-slot="session-state"
				className="flex h-3.5 w-full items-baseline justify-between gap-2 text-data"
			>
				<span data-slot="session-branch" className="min-w-0 truncate text-outline-strong">{row.branch}</span>
				{row.activity
					? (
						<span
							data-slot="session-activity"
							className={`flex shrink-0 items-baseline ${ACTIVITY_TEXT_CLASS[row.activity]}`}
						>
							{ACTIVITY_LABEL[row.activity]}
							{row.since ? <ElapsedClock since={row.since} /> : null}
						</span>
					)
					: null}
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
	const pinned = row.pinnedAt !== undefined;

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
			<span className="absolute top-0 right-0 hidden bg-inherit group-hover:flex">
				{!archived && (
					<button
						type="button"
						data-slot={pinned ? "unpin-session" : "pin-session"}
						className={`flex h-7 w-7 items-center justify-center hover:text-primary ${
							pinned ? "text-tertiary" : "text-secondary"
						}`}
						aria-label={`${pinned ? "Unpin" : "Pin"} ${row.title}`}
						title={pinned ? "Unpin" : "Pin — keeps it on top and out of the archive"}
						onClick={() => gestures.onTogglePin(row)}
					>
						{pinned
							? <BookmarkSlashIcon className="size-3.5" aria-hidden="true" />
							: <BookmarkIcon className="size-3.5" aria-hidden="true" />}
					</button>
				)}
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
