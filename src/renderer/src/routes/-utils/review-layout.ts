export const DEFAULT_DIFF_WIDTH = 648;
export const DEFAULT_TREE_WIDTH = 200;
export const MIN_DIFF_WIDTH = 294;
export const MIN_TREE_WIDTH = 120;
export const MIN_TERMINAL_WIDTH = 360;
export const REVIEW_SEPARATOR_WIDTH = 1;

export const REVIEW_DIFF_WIDTH_PROPERTY = "--review-diff-width";
export const REVIEW_TREE_WIDTH_PROPERTY = "--review-tree-width";
export const REVIEW_DIFF_WIDTH_VALUE = `var(${REVIEW_DIFF_WIDTH_PROPERTY})`;
export const REVIEW_TREE_WIDTH_VALUE = `var(${REVIEW_TREE_WIDTH_PROPERTY})`;

export function squeezeReviewDiff(input: {
	proposed: number;
	minDiff: number;
	maxDiff: number;
	treeOpen: boolean;
	minTree: number;
	treeWidth: number;
}): { diff: number; tree: number } {
	const deficit = Math.max(0, input.minDiff - input.proposed);
	const diff = Math.min(Math.max(input.proposed, input.minDiff), input.maxDiff);
	const tree = input.treeOpen ? Math.max(input.minTree, input.treeWidth - deficit) : 0;

	return { diff, tree };
}

export function redistributeReviewTree(input: {
	proposed: number;
	total: number;
	minTree: number;
	minDiff: number;
}): { tree: number; diff: number } {
	const tree = Math.min(Math.max(input.proposed, input.minTree), input.total - input.minDiff);

	return { tree, diff: input.total - tree };
}
