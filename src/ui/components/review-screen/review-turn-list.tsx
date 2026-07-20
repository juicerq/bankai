import { TextAttributes } from "@opentui/core";
import type { Turn } from "@core/review/ReviewModel";
import { useScrollSelection } from "@ui/-utils/use-scroll-selection";
import { ReviewTurnRow } from "@ui/components/review-screen/review-turn-row";
import { theme } from "@ui/theme";

const WIDTH = 30;

export function ReviewTurnList({
	turns,
	selectedIndex,
	reviewedTurnIds,
	focused,
	dimmed,
}: {
	turns: Turn[];
	selectedIndex: number;
	reviewedTurnIds: string[];
	focused: boolean;
	dimmed: boolean;
}) {
	const reviewed = new Set(reviewedTurnIds);
	const selectedId = turns[selectedIndex]?.turnId;
	const scroll = useScrollSelection(selectedId, selectedIndex);

	return (
		<box
			style={{
				width: WIDTH,
				flexDirection: "column",
				backgroundColor: theme.panel,
				opacity: dimmed ? 0.3 : 1,
			}}
		>
			<box
				style={{
					flexDirection: "row",
					justifyContent: "space-between",
					paddingLeft: 1,
					paddingRight: 1,
					paddingTop: 1,
				}}
			>
				<text style={{ fg: focused ? theme.review : theme.textDim, attributes: TextAttributes.BOLD }}>
					TURNS
				</text>
				{turns.length > 0 && (
					<text style={{ fg: theme.textFaint }}>{`${reviewed.size}/${turns.length}`}</text>
				)}
			</box>

			<scrollbox
				ref={scroll}
				viewportCulling={false}
				contentOptions={{ paddingTop: 1, paddingBottom: 1 }}
				style={{ flexGrow: 1 }}
			>
				{turns.length === 0 && (
					<box style={{ paddingLeft: 1 }}>
						<text style={{ fg: theme.textFaint }}>No turns yet.</text>
					</box>
				)}
				{turns.map((turn, index) => (
					<box key={turn.turnId} id={turn.turnId}>
						<ReviewTurnRow
							index={index}
							prompt={turn.prompt}
							fileCount={new Set(turn.files.map((file) => file.path)).size}
							selected={index === selectedIndex}
							reviewed={reviewed.has(turn.turnId)}
							focused={focused}
						/>
					</box>
				))}
			</scrollbox>
		</box>
	);
}
