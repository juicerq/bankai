import type { FileChange } from "@main/git/contracts";

const REVIEW_INITIAL_LINE_BUDGET = 100;

export function selectInitialReviewPaths(
	files: FileChange[],
	budget = REVIEW_INITIAL_LINE_BUDGET,
): ReadonlySet<string> {
	const selected = new Set<string>();
	let changedLines = 0;

	for (const file of files) {
		if (selected.size > 0 && changedLines >= budget) {
			break;
		}
		selected.add(file.path);
		changedLines += file.additions + file.deletions;
	}

	return selected;
}
