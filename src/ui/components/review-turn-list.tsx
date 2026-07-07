import { TextAttributes } from "@opentui/core";
import type { Turn } from "@core/review/ReviewModel";
import { ReviewTurnRow } from "@ui/components/review-turn-row";
import { theme } from "@ui/theme";

const WIDTH = 30;

export function ReviewTurnList({
	turns,
	selectedIndex,
	reviewedTurnIds,
}: {
	turns: Turn[];
	selectedIndex: number;
	reviewedTurnIds: string[];
}) {
	const reviewed = new Set(reviewedTurnIds);

	return (
		<box
			style={{
				width: WIDTH,
				flexDirection: "column",
				backgroundColor: theme.panel,
				border: ["right"],
				borderColor: theme.border,
			}}
		>
			<box style={{ paddingLeft: 1, paddingRight: 1, paddingTop: 1 }}>
				<text style={{ fg: theme.accent, attributes: TextAttributes.BOLD }}>TURNS</text>
			</box>

			<box style={{ flexGrow: 1, flexDirection: "column", padding: 1 }}>
				{turns.length === 0 && <text style={{ fg: theme.textDim }}>No turns yet.</text>}
				{turns.map((turn, index) => (
					<ReviewTurnRow
						key={turn.turnId}
						index={index}
						prompt={turn.prompt}
						active={index === selectedIndex}
						reviewed={reviewed.has(turn.turnId)}
					/>
				))}
			</box>
		</box>
	);
}
