import { TextAttributes } from "@opentui/core";
import type { SessionRef } from "@core/harness/registry";
import { type DiffScope, turnFiles } from "@core/review/diffScope";
import type { Turn } from "@core/review/ReviewModel";
import type { GitScopeState } from "@core/git/GitScopeStore";
import { useGitScopeFiles } from "@ui/-utils/use-git-scope-files";
import { useHeldWhileLoading } from "@ui/-utils/use-held-while-loading";
import { ReviewDiff } from "@ui/components/review-screen/review-diff";
import { theme } from "@ui/theme";

const NO_SESSION = { label: "No Session in this Tab", hint: "⇥ uncommitted changes" };
const TURN_EMPTY = { label: "No file changes in this turn", hint: "⇥ uncommitted changes" };
const UNCOMMITTED_EMPTY = { label: "No uncommitted changes", hint: "⇥ branch changes" };
const BRANCH_EMPTY = { label: "No changes on this branch", hint: "⇥ this turn" };
const UNAVAILABLE = { label: "Not a git repository", hint: "⇥ back to this turn" };
const LOADING = { label: "Loading changes...", hint: " " };

function splitEmpty(
	scope: DiffScope,
	gitState: GitScopeState | null,
	session: SessionRef | null,
): { label: string; hint: string } {
	if (scope === "turn") {
		return session ? TURN_EMPTY : NO_SESSION;
	}
	if (gitState === null || gitState.status === "loading") {
		return LOADING;
	}
	if (gitState.status === "unavailable") {
		return UNAVAILABLE;
	}
	return scope === "uncommitted" ? UNCOMMITTED_EMPTY : BRANCH_EMPTY;
}

export function SplitPanel({
	cwd,
	session,
	turns,
	scope,
	unified,
	folded,
	focused,
}: {
	cwd: string | undefined;
	session: SessionRef | null;
	turns: Turn[];
	scope: DiffScope;
	unified: boolean;
	folded: boolean;
	focused: boolean;
}) {
	const gitState = useGitScopeFiles(cwd, scope === "turn" ? null : scope);
	const loading = scope !== "turn" && (gitState === null || gitState.status === "loading");
	const files = useHeldWhileLoading(
		scope === "turn"
			? turnFiles(turns, turns.length - 1)
			: gitState?.status === "ok" ? gitState.files : [],
		loading,
	);

	return (
		<box style={{ flexGrow: 1, flexDirection: "column" }}>
			<box
				style={{
					flexShrink: 0,
					paddingLeft: 1,
					paddingRight: 1,
					backgroundColor: theme.panel,
					border: ["bottom"],
					borderColor: theme.border,
				}}
			>
				<text>
					<span style={{ fg: theme.review, attributes: TextAttributes.BOLD }}>Split</span>
					<span style={{ fg: theme.textFaint }}>{`  ${scope}`}</span>
				</text>
			</box>

			<ReviewDiff
				files={files}
				unified={unified}
				folded={folded}
				focused={focused}
				resetKey={`split:${scope}`}
				empty={splitEmpty(scope, gitState, session)}
			/>
		</box>
	);
}
