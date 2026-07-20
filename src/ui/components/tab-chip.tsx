import { TextAttributes } from "@opentui/core";
import type { SessionStatus } from "@core/review/ReviewModel";
import { theme } from "@ui/theme";
import type { SessionTabStatus as TabStatus } from "@core/session/SessionReviews";

const STATUS_GLYPH: Record<SessionStatus, { glyph: string; color: string }> = {
	active: { glyph: "●", color: theme.accent },
	idle: { glyph: "○", color: theme.textFaint },
};

export function TabChip({
	index,
	active,
	split,
	status,
}: {
	index: number;
	active: boolean;
	split: boolean;
	status: TabStatus | undefined;
}) {
	const dot = status ? STATUS_GLYPH[status.status] : undefined;

	return (
		<text
			style={{
				fg: active ? theme.accent : theme.textDim,
				attributes: active ? TextAttributes.BOLD : TextAttributes.NONE,
			}}
		>
			{`${active ? "▐" : " "}${index + 1}`}
			{dot && <span style={{ fg: dot.color }}>{` ${dot.glyph}`}</span>}
			{status?.unreviewed && <span style={{ fg: theme.review }}>◆</span>}
			{split && <span style={{ fg: theme.review }}>│</span>}
		</text>
	);
}
