import type { ReviewMode } from "@main/git/contracts";

export const REVIEW_SCOPES: Record<ReviewMode, { label: string; detail: string; empty: string }> = {
	"last-turn": {
		label: "Last turn",
		detail: "Since this shell's agent started working",
		empty: "No changes since this shell's last agent turn started.",
	},
	uncommitted: {
		label: "Uncommitted",
		detail: "Working tree against HEAD",
		empty: "No changes in the working tree.",
	},
	branch: {
		label: "Branch",
		detail: "Branch against its merge-base",
		empty: "No changes on this branch.",
	},
};

export const REVIEW_SCOPE_ORDER: ReviewMode[] = ["last-turn", "uncommitted", "branch"];

export function sharedWorktreeNotice(shells: string[]): string {
	return `Shared with ${shells.join(", ")} — changes from there show up here too.`;
}
