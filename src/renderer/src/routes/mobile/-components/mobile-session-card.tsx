import { ElapsedClock } from "@renderer/routes/-components/elapsed-clock";
import { ACTIVITY_BORDER_CLASS, ACTIVITY_TEXT_CLASS } from "@renderer/routes/-utils/agent-activity";
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
			<span className="w-full truncate text-data text-secondary">{row.projectName}</span>
			<span className="w-full truncate text-primary text-subtitle">{row.title}</span>
			<span
				data-slot="session-trace"
				className={`flex w-full items-baseline gap-1 text-support ${
					row.trace && row.activity ? ACTIVITY_TEXT_CLASS[row.activity] : "text-outline-strong"
				}`}
			>
				<span className="min-w-0 truncate">{row.trace ?? row.branch}</span>
				{row.activity && row.traceSince ? <ElapsedClock since={row.traceSince} /> : null}
			</span>
		</button>
	);
}
