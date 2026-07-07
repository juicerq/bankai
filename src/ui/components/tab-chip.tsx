import { TextAttributes } from "@opentui/core";
import type { SessionStatus } from "@core/review/ReviewModel";
import { theme } from "@ui/theme";
import type { TabStatus } from "@ui/types";

const STATUS_GLYPH: Record<SessionStatus, { glyph: string; color: string }> = {
	generating: { glyph: "●", color: theme.accent },
	blocked: { glyph: "●", color: theme.danger },
	idle: { glyph: "○", color: theme.textFaint },
};

export function TabChip({
	index,
	active,
	status,
}: {
	index: number;
	active: boolean;
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
		</text>
	);
}
