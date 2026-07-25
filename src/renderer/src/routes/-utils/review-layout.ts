export const DEFAULT_DIFF_WIDTH = 648;
export const DEFAULT_TREE_WIDTH = 200;
export const MIN_DIFF_WIDTH = 280;
export const MIN_TREE_WIDTH = 120;

const HEADER_TREE_TOGGLE = 40;
const HEADER_TRIGGER_CHROME = 48;
const HEADER_BODY_GLYPH = 7.3;
const HEADER_DATA_GLYPH = 6;
const HEADER_GAP = 8;
const HEADER_EDGE = 24;
const HEADER_ICON_BUTTON = 24;
const HEADER_COLLAPSE_BUTTONS = 56;
const HEADER_WORKTREE_GLYPHS = 3;
const HEADER_WORKTREE_ROOM_GLYPHS = 8;
const HEADER_WIDTH_STEP = 16;

function headerTrigger(glyphs: number): number {
	return HEADER_TRIGGER_CHROME + glyphs * HEADER_BODY_GLYPH;
}

function headerStatus(totals: { additions: number; deletions: number } | undefined): number {
	if (!totals) {
		return HEADER_EDGE;
	}

	return HEADER_EDGE + HEADER_GAP + (2 + `${totals.additions}${totals.deletions}`.length) * HEADER_DATA_GLYPH;
}

export function reviewHeaderStep(width: number): number {
	return Math.floor(width / HEADER_WIDTH_STEP) * HEADER_WIDTH_STEP;
}

export function reviewHeaderControls(input: {
	width: number | undefined;
	worktrees: number;
	scope: string;
	totals: { additions: number; deletions: number } | undefined;
}): {
	worktree: boolean;
	actions: boolean;
	more: boolean;
} {
	const width = input.width ?? Number.POSITIVE_INFINITY;
	const selectable = input.worktrees >= 2;
	const fixed = HEADER_TREE_TOGGLE + headerTrigger(input.scope.length) + headerStatus(input.totals);
	const worktree =
		selectable && width >= fixed + headerTrigger(HEADER_WORKTREE_GLYPHS) + HEADER_ICON_BUTTON;
	const actions =
		width >=
		fixed +
			(selectable ? headerTrigger(HEADER_WORKTREE_ROOM_GLYPHS) : 0) +
			HEADER_COLLAPSE_BUTTONS +
			HEADER_ICON_BUTTON;

	return { worktree, actions, more: !actions || (selectable && !worktree) };
}

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
