import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { SessionRef } from "@core/harness/registry";
import { type DiffMode, filesForMode } from "@core/review/accumulate";
import type { Turn } from "@core/review/ReviewModel";
import { canReviewTurn } from "@core/review/unreviewed";
import { ReviewDiff } from "@ui/components/review-screen/review-diff";
import { ReviewHeader } from "@ui/components/review-screen/review-header";
import { ReviewTurnList } from "@ui/components/review-screen/review-turn-list";
import { theme } from "@ui/theme";

type Zone = "turns" | "diff";
type ReviewView =
	| { mode: "turn"; zone: Zone }
	| { mode: "accumulated"; zone: "diff" };

type Hint = { key: string; action: string };

const HELP: Record<Zone, Hint[]> = {
	turns: [
		{ key: "↑↓", action: "turn" },
		{ key: "→", action: "diff" },
		{ key: "⇥", action: "scope" },
		{ key: "d", action: "unified" },
		{ key: "s", action: "full" },
		{ key: "space", action: "reviewed" },
		{ key: "esc", action: "exit" },
	],
	diff: [
		{ key: "↑↓", action: "scroll" },
		{ key: "←", action: "turns" },
		{ key: "⇥", action: "scope" },
		{ key: "d", action: "unified" },
		{ key: "s", action: "full" },
		{ key: "space", action: "reviewed" },
		{ key: "esc", action: "exit" },
	],
};
const ACCUMULATED_HELP: Hint[] = [
	{ key: "↑↓", action: "scroll" },
	{ key: "⇥", action: "turns" },
	{ key: "d", action: "unified" },
	{ key: "s", action: "full" },
	{ key: "esc", action: "exit" },
];
const EMPTY: Record<DiffMode, { label: string; hint: string }> = {
	turn: { label: "No file changes in this turn", hint: "\u21E5 view the accumulated diff" },
	accumulated: { label: "No file changes in this session", hint: "\u21E5 back to turns" },
};

export function ReviewScreen({
	session,
	turns,
	availability,
	reviewedTurnIds,
	onToggleReviewed,
	onClose,
	zenMode,
}: {
	session: SessionRef | null;
	turns: Turn[];
	availability: "loading" | "available" | "unavailable";
	reviewedTurnIds: string[];
	onToggleReviewed: (turnId: string) => void;
	onClose: () => void;
	zenMode: boolean;
}) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [view, setView] = useState<ReviewView>({ mode: "turn", zone: "turns" });
	const [unified, setUnified] = useState(false);
	const [folded, setFolded] = useState(true);

	const index = Math.min(selectedIndex, Math.max(0, turns.length - 1));
	const files = filesForMode(turns, index, view.mode);
	const current = turns[index];
	const effectiveZone = zenMode ? "diff" : view.zone;
	const help = view.mode === "accumulated" ? ACCUMULATED_HELP : HELP[effectiveZone];
	const availabilityMessage = availability === "loading"
		? "Loading review..."
		: "Review unavailable: this Session was not observed safely.";

	useKeyboard((key) => {
		if (key.name === "escape") {
			onClose();
			return;
		}
		if (availability !== "available") {
			return;
		}
		if (key.name === "tab") {
			setView(view.mode === "turn"
				? { mode: "accumulated", zone: "diff" }
				: { mode: "turn", zone: "turns" });
			return;
		}
		if (key.name === "d") {
			setUnified((value) => !value);
			return;
		}
		if (key.name === "s") {
			setFolded((value) => !value);
			return;
		}
		if (view.mode === "accumulated") {
			return;
		}
		if (key.name === "space" && current && canReviewTurn(turns, current.turnId)) {
			onToggleReviewed(current.turnId);
			return;
		}
		if (effectiveZone === "diff") {
			if (key.name === "left" || key.name === "h") {
				setView({ mode: "turn", zone: "turns" });
			}
			return;
		}
		if (key.name === "up" || key.name === "k") {
			setSelectedIndex(Math.max(index - 1, 0));
			return;
		}
		if (key.name === "down" || key.name === "j") {
			setSelectedIndex(Math.max(0, Math.min(index + 1, turns.length - 1)));
			return;
		}
		if (key.name === "right" || key.name === "l") {
			setView({ mode: "turn", zone: "diff" });
		}
	});

	return (
		<box style={{ width: "100%", height: "100%", flexDirection: "column", backgroundColor: theme.bg }}>
			<ReviewHeader
				session={session}
				turnIndex={index}
				turnCount={turns.length}
				mode={view.mode}
				unified={unified}
				folded={folded}
				files={files}
			/>

			<box style={{ flexGrow: 1, flexDirection: "row" }}>
				{availability !== "available" && (
					<box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
						<text style={{ fg: theme.textDim }}>
							{availabilityMessage}
						</text>
					</box>
				)}
				{availability === "available" && (
					<>
						{!zenMode && (
							<ReviewTurnList
								turns={turns}
								selectedIndex={index}
								reviewedTurnIds={reviewedTurnIds}
								focused={effectiveZone === "turns"}
								dimmed={view.mode === "accumulated"}
							/>
						)}
						<ReviewDiff
							files={files}
							unified={unified}
							folded={folded}
							focused={effectiveZone === "diff"}
							resetKey={`${index}:${view.mode}`}
							empty={EMPTY[view.mode]}
						/>
					</>
				)}
			</box>

			<box
				style={{
					paddingLeft: 2,
					paddingRight: 2,
					backgroundColor: zenMode ? theme.bg : theme.panel,
					border: ["top"],
					borderColor: zenMode ? theme.bg : theme.border,
				}}
			>
				<text>
					{zenMode && " "}
					{!zenMode &&
						help.flatMap((hint, position) => [
							<span key={`${hint.key}-key`} style={{ fg: theme.textDim }}>
								{`${position > 0 ? "   " : ""}${hint.key}`}
							</span>,
							<span key={`${hint.key}-action`} style={{ fg: theme.textFaint }}>
								{` ${hint.action}`}
							</span>,
						])}
				</text>
			</box>
		</box>
	);
}
