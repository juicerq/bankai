import { useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { type DiffMode, filesForMode } from "@core/review/accumulate";
import type { Turn } from "@core/review/ReviewModel";
import { ReviewDiff } from "@ui/components/review-diff";
import { ReviewFeedback } from "@ui/components/review-feedback";
import { ReviewTurnList } from "@ui/components/review-turn-list";
import { theme } from "@ui/theme";

const MODE_LABEL: Record<DiffMode, string> = {
	turn: "this turn",
	accumulated: "accumulated",
};

export function ReviewScreen({
	sessionId,
	turns,
	reviewedTurnIds,
	onToggleReviewed,
	onClose,
}: {
	sessionId: string;
	turns: Turn[];
	reviewedTurnIds: string[];
	onToggleReviewed: (turnId: string) => void;
	onClose: () => void;
}) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [mode, setMode] = useState<DiffMode>("turn");

	const index = Math.min(selectedIndex, Math.max(0, turns.length - 1));
	const files = filesForMode(turns, index, mode);
	const current = turns[index];

	useKeyboard((key) => {
		if (key.name === "escape") {
			onClose();
			return;
		}
		if (key.name === "j") {
			setSelectedIndex(Math.min(index + 1, turns.length - 1));
			return;
		}
		if (key.name === "k") {
			setSelectedIndex(Math.max(index - 1, 0));
			return;
		}
		if (key.name === "tab") {
			setMode((prev) => (prev === "turn" ? "accumulated" : "turn"));
			return;
		}
		if (key.name === "space" && current) {
			onToggleReviewed(current.turnId);
		}
	});

	return (
		<box style={{ width: "100%", height: "100%", flexDirection: "column", backgroundColor: theme.bg }}>
			<box
				style={{
					flexDirection: "row",
					gap: 2,
					paddingLeft: 1,
					paddingRight: 1,
					backgroundColor: theme.panel,
					border: ["bottom"],
					borderColor: theme.border,
				}}
			>
				<text style={{ fg: theme.review, attributes: TextAttributes.BOLD }}>REVIEW</text>
				<text style={{ fg: theme.textFaint }}>{sessionId}</text>
				<text style={{ fg: theme.textDim }}>
					{`turn ${turns.length === 0 ? 0 : index + 1}/${turns.length} · ${MODE_LABEL[mode]}`}
				</text>
			</box>

			<box style={{ flexGrow: 1, flexDirection: "row" }}>
				<ReviewTurnList
					turns={turns}
					selectedIndex={index}
					reviewedTurnIds={reviewedTurnIds}
				/>

				<ReviewDiff files={files} scrollKey={`${index}:${mode}`} />

				<ReviewFeedback />
			</box>

			<box
				style={{
					paddingLeft: 1,
					paddingRight: 1,
					backgroundColor: theme.panel,
					border: ["top"],
					borderColor: theme.border,
				}}
			>
				<text style={{ fg: theme.textFaint }}>
					j/k turn · ↑↓ scroll · ⇥ turn/accumulated · space reviewed · esc terminal
				</text>
			</box>
		</box>
	);
}
