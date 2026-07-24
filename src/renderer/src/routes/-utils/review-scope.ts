import type { ReviewMode } from "@main/git/contracts";

export const REVIEW_SCOPES: { mode: ReviewMode; label: string }[] = [
	{ mode: "uncommitted", label: "Uncommitted" },
	{ mode: "branch", label: "Branch" },
	{ mode: "last-turn", label: "Last turn" },
];

export const REVIEW_SCOPE_EMPTY: Record<ReviewMode, string> = {
	uncommitted: "No changes in the working tree.",
	branch: "No changes on this branch.",
	"last-turn": "No changes since this shell's last agent turn started.",
};
