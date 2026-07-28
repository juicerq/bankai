import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { useLongPress } from "@renderer/routes/mobile/-utils/use-long-press";

export function MobileArchivedShelf({
	archived,
	onOpen,
	onHold,
}: {
	archived: SessionRow[];
	onOpen: (shellId: string) => void;
	onHold: (row: SessionRow) => void;
}) {
	const [open, setOpen] = useState(false);

	if (archived.length === 0) {
		return null;
	}

	return (
		<div data-component="mobile-archived-shelf">
			<button
				type="button"
				data-slot="toggle"
				aria-expanded={open}
				className="flex min-h-11 w-full items-center gap-1.5 border-b border-b-outline px-4 text-label text-secondary active:bg-surface-active"
				onClick={() => setOpen(!open)}
			>
				{open
					? <ChevronDownIcon className="size-3.5 shrink-0" aria-hidden="true" />
					: <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" />}
				ARCHIVED <span className="text-outline-strong">{archived.length}</span>
			</button>
			{open
				&& archived.map((row) => (
					<ArchivedRow key={row.shellId} row={row} onOpen={onOpen} onHold={() => onHold(row)} />
				))}
		</div>
	);
}

function ArchivedRow({
	row,
	onOpen,
	onHold,
}: {
	row: SessionRow;
	onOpen: (shellId: string) => void;
	onHold: () => void;
}) {
	const longPress = useLongPress(onHold);

	return (
		<button
			type="button"
			data-component="mobile-archived-row"
			data-shell-id={row.shellId}
			className="flex min-h-11 w-full touch-pan-y select-none items-center gap-3 border-b border-b-outline px-4 text-left active:bg-surface-active"
			{...longPress.press}
			onClick={() => {
				if (!longPress.held()) {
					onOpen(row.shellId);
				}
			}}
		>
			<span className="min-w-0 flex-1 truncate text-body text-secondary">{row.title}</span>
			<span className="shrink-0 text-data text-outline-strong">{row.projectName}</span>
		</button>
	);
}
