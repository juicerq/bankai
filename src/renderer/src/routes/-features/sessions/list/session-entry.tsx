import {
	ArchiveBoxArrowDownIcon,
	ArrowUturnUpIcon,
	BookmarkIcon,
	BookmarkSlashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import type { ReactElement, ReactNode } from "react";
import { ClaudeGlyph } from "@renderer/routes/-features/sessions/list/claude-glyph";
import { CodexGlyph } from "@renderer/routes/-features/sessions/list/codex-glyph";
import { OpencodeGlyph } from "@renderer/routes/-features/sessions/list/opencode-glyph";
import { ElapsedClock } from "@renderer/routes/-features/shared/time/elapsed-clock";
import { ShellGlyph } from "@renderer/routes/-features/sessions/list/shell-glyph";
import { ACTIVITY_BORDER_CLASS, ACTIVITY_LABEL, ACTIVITY_TEXT_CLASS } from "@renderer/routes/-features/sessions/list/agent-activity";
import type { SessionRow } from "@renderer/routes/-features/sessions/list/session-rows";

export interface SessionGestures {
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

const HARNESS_GLYPH: Record<string, (props: { active: boolean }) => ReactElement> = {
	claude: ClaudeGlyph,
	codex: CodexGlyph,
	opencode: OpencodeGlyph,
};

const HOVER_ACTION_CLASS =
	"relative flex size-4 shrink-0 items-center justify-center hover:text-primary before:absolute before:-inset-1.5";

export function SessionCard({ row, gestures }: { row: SessionRow; gestures: SessionGestures }) {
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
							className={`flex shrink-0 items-baseline gap-1 ${ACTIVITY_TEXT_CLASS[row.activity]}`}
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

export function SessionShelfRow({ row, gestures }: { row: SessionRow; gestures: SessionGestures }) {
	return (
		<SessionEntry row={row} gestures={gestures} archived>
			<span className="min-w-0 flex-1 truncate text-body text-secondary">{row.title}</span>
			<span className="shrink-0 text-data text-outline-strong group-hover:invisible">{row.projectName}</span>
		</SessionEntry>
	);
}

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

function activityBorder(activity: SessionRow["activity"], selected: boolean): string {
	if (activity) {
		return ACTIVITY_BORDER_CLASS[activity];
	}

	if (selected) {
		return "border-l-outline-strong";
	}

	return "border-l-transparent";
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
			className={`group relative flex border-l-2 ${activityBorder(row.activity, selected)} ${
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
							archived ? "h-7 items-center gap-2" : "flex-col justify-center gap-1 py-2.5"
						}`}
						aria-pressed={selected}
						onClick={() => gestures.onSelect(row.projectId, row.shellId)}
					>
						{children}
					</button>
				)}
			<span className="absolute top-0 right-0 hidden items-center gap-3.5 bg-inherit pt-2 pr-3 group-hover:flex">
				{!archived && (
					<button
						type="button"
						data-slot={pinned ? "unpin-session" : "pin-session"}
						className={`${HOVER_ACTION_CLASS} ${pinned ? "text-tertiary" : "text-secondary"}`}
						aria-label={`${pinned ? "Unpin" : "Pin"} ${row.title}`}
						title={pinned ? "Unpin" : "Pin — keeps it on top and out of the archive"}
						onClick={() => gestures.onTogglePin(row)}
					>
						{pinned
							? <BookmarkSlashIcon className="size-4" aria-hidden="true" />
							: <BookmarkIcon className="size-4" aria-hidden="true" />}
					</button>
				)}
				{archived
					? (
						<button
							type="button"
							data-slot="unarchive-session"
							className={`${HOVER_ACTION_CLASS} text-secondary`}
							aria-label={`Unarchive ${row.title}`}
							title="Unarchive"
							onClick={() => gestures.onUnarchive(row.projectId, row.shellId)}
						>
							<ArrowUturnUpIcon className="size-4" aria-hidden="true" />
						</button>
					)
					: (
						<button
							type="button"
							data-slot="archive-session"
							className={`${HOVER_ACTION_CLASS} text-secondary`}
							aria-label={`Archive ${row.title}`}
							title="Archive"
							onClick={() => gestures.onArchive(row.projectId, row.shellId)}
						>
							<ArchiveBoxArrowDownIcon className="size-4" aria-hidden="true" />
						</button>
					)}
				<button
					type="button"
					data-slot="close-session"
					className={`${HOVER_ACTION_CLASS} text-secondary`}
					aria-label={`Close ${row.title}`}
					onClick={() => gestures.onClose(row.projectId, row.shellId)}
				>
					<XMarkIcon className="size-4" aria-hidden="true" />
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
