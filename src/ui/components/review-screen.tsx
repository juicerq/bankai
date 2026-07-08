import { useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { type DiffMode, filesForMode } from "@core/review/accumulate";
import { diffStats } from "@core/review/diff";
import type { Turn } from "@core/review/ReviewModel";
import { useDiffWarmup } from "@ui/-utils/use-diff-warmup";
import { useHighlightWarmup } from "@ui/-utils/use-highlight-warmup";
import { ReviewDiff } from "@ui/components/review-diff";
import { ReviewFeedback } from "@ui/components/review-feedback";
import { ReviewTurnList } from "@ui/components/review-turn-list";
import { theme } from "@ui/theme";

type Zone = "turns" | "diff";

const MODE_LABEL: Record<DiffMode, string> = {
	turn: "this turn",
	accumulated: "accumulated",
};

const HELP: Record<Zone, string> = {
	turns: "↑↓ turn · → diff · ⇥ scope · d unified · s full · space reviewed · esc exit",
	diff: "↑↓ scroll · ← turns · ⇥ scope · d unified · s full · space reviewed · esc exit",
};

const ACCUMULATED_HELP = "↑↓ scroll · ⇥ turns · d unified · s full · esc exit";

const EMPTY_LABEL: Record<DiffMode, string> = {
	turn: "\u2014 no file changes in this turn \u2014",
	accumulated: "\u2014 no file changes in this session \u2014",
};

export function ReviewScreen({
	sessionId,
	turns,
	reviewedTurnIds,
	onToggleReviewed,
	onClose,
	zenMode,
}: {
	sessionId: string | null;
	turns: Turn[];
	reviewedTurnIds: string[];
	onToggleReviewed: (turnId: string) => void;
	onClose: () => void;
	zenMode: boolean;
}) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [mode, setMode] = useState<DiffMode>("turn");
	const [unified, setUnified] = useState(false);
	const [folded, setFolded] = useState(true);
	const [zone, setZone] = useState<Zone>("turns");

	const index = Math.min(selectedIndex, Math.max(0, turns.length - 1));
	const files = filesForMode(turns, index, mode);
	const current = turns[index];
	const help = mode === "accumulated" ? ACCUMULATED_HELP : HELP[zone];
	const stats = diffStats(files);

	useHighlightWarmup(turns);
	useDiffWarmup(turns);

	useKeyboard((key) => {
		if (key.name === "escape") {
			onClose();
			return;
		}
		if (key.name === "tab") {
			setMode(mode === "turn" ? "accumulated" : "turn");
			setZone(mode === "turn" ? "diff" : "turns");
			return;
		}
		if (key.name === "d") {
			setUnified((prev) => !prev);
			return;
		}
		if (key.name === "s") {
			setFolded((prev) => !prev);
			return;
		}

		if (mode === "accumulated") {
			return;
		}

		if (key.name === "space" && current) {
			onToggleReviewed(current.turnId);
			return;
		}

		if (zone === "diff") {
			if (key.name === "left" || key.name === "h") {
				setZone("turns");
			}
			return;
		}

		if (key.name === "up" || key.name === "k") {
			setSelectedIndex(Math.max(index - 1, 0));
			return;
		}
		if (key.name === "down" || key.name === "j") {
			setSelectedIndex(Math.min(index + 1, turns.length - 1));
			return;
		}
		if (key.name === "right" || key.name === "l") {
			setZone("diff");
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
				<text style={{ fg: theme.textFaint }}>{sessionId ?? "no session on this tab"}</text>
				<text style={{ fg: theme.textDim }}>
					{`turn ${turns.length === 0 ? 0 : index + 1}/${turns.length} · ${MODE_LABEL[mode]} · ${
						unified ? "unified" : "compact"
					} · ${folded ? "folded" : "full"} · `}
					<span style={{ fg: theme.add }}>{`+${stats.added}`}</span>
					{" "}
					<span style={{ fg: theme.danger }}>{`-${stats.removed}`}</span>
					{` · ${files.length} ${files.length === 1 ? "file" : "files"}`}
				</text>
			</box>

			<box style={{ flexGrow: 1, flexDirection: "row" }}>
				{!zenMode && (
					<ReviewTurnList
						turns={turns}
						selectedIndex={index}
						reviewedTurnIds={reviewedTurnIds}
						focused={zone === "turns"}
						dimmed={mode === "accumulated"}
					/>
				)}

				<ReviewDiff
					files={files}
					unified={unified}
					folded={folded}
					focused={zone === "diff"}
					resetKey={`${index}:${mode}`}
					emptyLabel={EMPTY_LABEL[mode]}
				/>

				{!zenMode && <ReviewFeedback />}
			</box>

			{!zenMode && (
				<box
					style={{
						paddingLeft: 1,
						paddingRight: 1,
						backgroundColor: theme.panel,
						border: ["top"],
						borderColor: theme.border,
					}}
				>
					<text style={{ fg: theme.textFaint }}>{help}</text>
				</box>
			)}
		</box>
	);
}
