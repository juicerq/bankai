import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { GitScope } from "@core/git/gitScope";
import type { ReviewUnavailableReason } from "@core/harness/Harness";
import type { SessionRef } from "@core/harness/registry";
import { type DiffScope, nextScope, turnFiles } from "@core/review/diffScope";
import type { Turn } from "@core/review/ReviewModel";
import { canReviewTurn } from "@core/review/unreviewed";
import type { GitScopeState } from "@core/git/GitScopeStore";
import { reviewUnavailableMessage } from "@ui/-utils/review-unavailable-message";
import { useGitScopeFiles } from "@ui/-utils/use-git-scope-files";
import { useHeldWhileLoading } from "@ui/-utils/use-held-while-loading";
import { ReviewDiff } from "@ui/components/review-screen/review-diff";
import { ReviewHeader } from "@ui/components/review-screen/review-header";
import { ReviewTurnList } from "@ui/components/review-screen/review-turn-list";
import { theme } from "@ui/theme";

type Zone = "turns" | "diff";
type ReviewView =
	| { scope: "turn"; zone: Zone }
	| { scope: GitScope; zone: "diff" };

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
const GIT_HELP: Hint[] = [
	{ key: "↑↓", action: "scroll" },
	{ key: "⇥", action: "scope" },
	{ key: "d", action: "unified" },
	{ key: "s", action: "full" },
	{ key: "esc", action: "exit" },
];
const SCOPE_EMPTY: Record<DiffScope, { label: string; hint: string }> = {
	turn: { label: "No file changes in this turn", hint: "⇥ uncommitted changes" },
	uncommitted: { label: "No uncommitted changes", hint: "⇥ branch changes" },
	branch: { label: "No changes on this branch", hint: "⇥ this turn" },
};
const GIT_UNAVAILABLE = { label: "Not a git repository", hint: "⇥ back to this turn" };
const GIT_LOADING = { label: "Loading changes...", hint: " " };

function diffEmpty(scope: DiffScope, gitState: GitScopeState | null): { label: string; hint: string } {
	if (scope === "turn") {
		return SCOPE_EMPTY.turn;
	}
	if (gitState === null || gitState.status === "loading") {
		return GIT_LOADING;
	}
	if (gitState.status === "unavailable") {
		return GIT_UNAVAILABLE;
	}
	return SCOPE_EMPTY[scope];
}

export function ReviewScreen({
	session,
	cwd,
	turns,
	availability,
	unavailableReason,
	reviewedTurnIds,
	onToggleReviewed,
	onClose,
	zenMode,
}: {
	session: SessionRef | null;
	cwd: string | undefined;
	turns: Turn[];
	availability: "loading" | "available" | "unavailable";
	unavailableReason: ReviewUnavailableReason | undefined;
	reviewedTurnIds: string[];
	onToggleReviewed: (turnId: string) => void;
	onClose: () => void;
	zenMode: boolean;
}) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [view, setView] = useState<ReviewView>({ scope: "turn", zone: "turns" });
	const [unified, setUnified] = useState(false);
	const [folded, setFolded] = useState(true);
	const gitState = useGitScopeFiles(cwd, view.scope === "turn" ? null : view.scope);

	const index = Math.min(selectedIndex, Math.max(0, turns.length - 1));
	const loading = view.scope !== "turn" && (gitState === null || gitState.status === "loading");
	const files = useHeldWhileLoading(
		view.scope === "turn"
			? turnFiles(turns, index)
			: gitState?.status === "ok" ? gitState.files : [],
		loading,
	);
	const current = turns[index];
	const effectiveZone = zenMode ? "diff" : view.zone;
	const help = view.scope === "turn" ? HELP[effectiveZone] : GIT_HELP;
	const availabilityMessage = availability === "loading"
		? "Loading review..."
		: reviewUnavailableMessage(unavailableReason);

	useKeyboard((key) => {
		if (key.name === "escape") {
			onClose();
			return;
		}
		if (availability !== "available") {
			return;
		}
		if (key.name === "tab") {
			const scope = nextScope(view.scope);
			setView(scope === "turn" ? { scope: "turn", zone: "turns" } : { scope, zone: "diff" });
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
		if (view.scope !== "turn") {
			return;
		}
		if (key.name === "space" && current && canReviewTurn(turns, current.turnId)) {
			onToggleReviewed(current.turnId);
			return;
		}
		if (effectiveZone === "diff") {
			if (key.name === "left" || key.name === "h") {
				setView({ scope: "turn", zone: "turns" });
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
			setView({ scope: "turn", zone: "diff" });
		}
	});

	return (
		<box style={{ width: "100%", height: "100%", flexDirection: "column", backgroundColor: theme.bg }}>
			<ReviewHeader
				session={session}
				turnIndex={index}
				turnCount={turns.length}
				scope={view.scope}
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
								dimmed={view.scope !== "turn"}
							/>
						)}
						<ReviewDiff
							files={files}
							unified={unified}
							folded={folded}
							focused={effectiveZone === "diff"}
							resetKey={`${index}:${view.scope}`}
							empty={diffEmpty(view.scope, gitState)}
						/>
					</>
				)}
			</box>

			<box
				style={{
					flexShrink: 0,
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
