import { useRef, useState } from "react";
import type { SessionRow } from "@renderer/routes/-features/sessions/list/session-rows";

export function MobileSessionActions({
	row,
	archived,
	onRename,
	onArchive,
	onUnarchive,
	onPin,
	onUnpin,
	onCloseSession,
	onDismiss,
}: {
	row: SessionRow;
	archived: boolean;
	onRename: (projectId: string, shellId: string, title: string) => void;
	onArchive: (projectId: string, shellId: string) => void;
	onUnarchive: (projectId: string, shellId: string) => void;
	onPin: (projectId: string, shellId: string) => void;
	onUnpin: (projectId: string, shellId: string) => void;
	onCloseSession: (projectId: string, shellId: string) => void;
	onDismiss: () => void;
}) {
	const [mode, setMode] = useState<"menu" | "rename" | "confirm">("menu");
	const field = useRef<HTMLInputElement>(null);

	const togglePin = () => {
		onDismiss();

		if (row.pinnedAt === undefined) {
			onPin(row.projectId, row.shellId);
			return;
		}

		onUnpin(row.projectId, row.shellId);
	};

	const rename = () => {
		const named = field.current?.value.trim();

		if (named && named !== row.title) {
			onRename(row.projectId, row.shellId, named);
		}

		onDismiss();
	};

	return (
		<div className="fixed inset-0 z-50 flex flex-col justify-end bg-surface-sunken/70" onPointerDown={onDismiss}>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={`Actions for ${row.title}`}
				data-component="mobile-session-actions"
				data-shell-id={row.shellId}
				className="flex max-h-[70vh] flex-col border-outline-strong border-t bg-surface-raised"
				onPointerDown={(event) => event.stopPropagation()}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						onDismiss();
					}
				}}
			>
				<div className="flex h-header shrink-0 items-center justify-between gap-3 border-outline border-b px-4">
					<span data-slot="heading" className="min-w-0 truncate text-label text-secondary">
						{row.title}
					</span>
					<button
						type="button"
						data-slot="cancel"
						className="-mr-2 flex h-full shrink-0 items-center px-2 text-label text-secondary active:text-primary"
						onClick={onDismiss}
					>
						CANCEL
					</button>
				</div>
				{mode === "menu" && (
					<div className="min-h-0 flex-1 overflow-y-auto">
						<ActionRow slot="rename" label="Rename" onClick={() => setMode("rename")} />
						{!archived && (
							<ActionRow
								slot={row.pinnedAt === undefined ? "pin" : "unpin"}
								label={row.pinnedAt === undefined ? "Pin" : "Unpin"}
								onClick={togglePin}
							/>
						)}
						{archived
							? (
								<ActionRow
									slot="unarchive"
									label="Unarchive"
									onClick={() => {
										onUnarchive(row.projectId, row.shellId);
										onDismiss();
									}}
								/>
							)
							: (
								<ActionRow
									slot="archive"
									label="Archive"
									onClick={() => {
										onArchive(row.projectId, row.shellId);
										onDismiss();
									}}
								/>
							)}
						<ActionRow slot="close" label="Close" danger onClick={() => setMode("confirm")} />
					</div>
				)}
				{mode === "rename" && (
					<div className="flex shrink-0 flex-col gap-3 p-4">
						<input
							ref={field}
							data-slot="title"
							aria-label="Session name"
							// biome-ignore lint/a11y/noAutofocus: a rename sheet must seat the caret in its own field
							autoFocus
							defaultValue={row.title}
							className="min-h-12 w-full border border-outline-strong bg-surface px-3 text-body text-primary"
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									rename();
								}
							}}
						/>
						<button
							type="button"
							data-slot="save"
							onClick={rename}
							className="min-h-12 w-full border border-outline-strong text-label text-primary active:bg-surface-active"
						>
							SAVE
						</button>
					</div>
				)}
				{mode === "confirm" && (
					<div className="flex shrink-0 flex-col gap-3 p-4">
						<p data-slot="warning" className="text-secondary text-support">
							Closing ends this session. Its conversation is gone for good.
						</p>
						<button
							type="button"
							data-slot="confirm-close"
							className="min-h-12 w-full border border-removed text-label text-removed active:bg-surface-active"
							onClick={() => {
								onCloseSession(row.projectId, row.shellId);
								onDismiss();
							}}
						>
							CLOSE SESSION
						</button>
						<button
							type="button"
							data-slot="keep"
							className="min-h-12 w-full border border-outline-strong text-label text-secondary active:bg-surface-active"
							onClick={() => setMode("menu")}
						>
							KEEP IT
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

function ActionRow({
	slot,
	label,
	danger,
	onClick,
}: {
	slot: string;
	label: string;
	danger?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			data-slot={slot}
			className={`flex min-h-14 w-full items-center border-outline border-b px-4 text-left text-body active:bg-surface-active ${
				danger ? "text-removed" : "text-primary"
			}`}
			onClick={onClick}
		>
			{label}
		</button>
	);
}
