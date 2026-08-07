import { BookmarkIcon } from "@heroicons/react/24/outline";
import { ElapsedClock } from "@renderer/routes/-components/elapsed-clock";
import { ACTIVITY_BORDER_CLASS, ACTIVITY_LABEL, ACTIVITY_TEXT_CLASS } from "@renderer/routes/-utils/agent-activity";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { useLongPress } from "@renderer/routes/mobile/-utils/use-long-press";

export function MobileSessionCard({
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
			data-component="mobile-session-card"
			data-shell-id={row.shellId}
			data-activity={row.activity}
			className={`flex w-full touch-pan-y select-none flex-col gap-1 border-b border-b-outline border-l-2 px-4 py-3 text-left active:bg-surface-active ${
				row.activity ? ACTIVITY_BORDER_CLASS[row.activity] : "border-l-transparent"
			}`}
			{...longPress.press}
			onClick={() => {
				if (!longPress.held()) {
					onOpen(row.shellId);
				}
			}}
		>
			<span className="flex w-full items-center gap-2 text-data text-secondary">
				{row.pinnedAt !== undefined && (
					<BookmarkIcon
						data-slot="pinned-mark"
						role="img"
						aria-label="Pinned"
						className="size-3 shrink-0 text-tertiary"
					/>
				)}
				<span className="min-w-0 truncate">{row.projectName}</span>
			</span>
			<span className="w-full truncate text-primary text-subtitle">{row.title}</span>
			<span
				data-slot="session-state"
				className="flex w-full items-baseline justify-between gap-2 text-support"
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
		</button>
	);
}
