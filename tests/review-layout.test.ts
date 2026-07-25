import { expect, test } from "bun:test";
import {
	redistributeReviewTree,
	reviewHeaderControls,
	reviewHeaderStep,
	squeezeReviewDiff,
} from "@renderer/routes/-utils/review-layout";

test("squeezes the tree once the diff floors", () => {
	expect(squeezeReviewDiff({ proposed: 180, minDiff: 280, maxDiff: 1340, treeOpen: true, minTree: 120, treeWidth: 300 })).toEqual({
		diff: 280,
		tree: 200,
	});
});

test("floors the squeezed tree at its minimum width", () => {
	expect(squeezeReviewDiff({ proposed: 0, minDiff: 280, maxDiff: 1340, treeOpen: true, minTree: 120, treeWidth: 300 })).toEqual({
		diff: 280,
		tree: 120,
	});
});

test("restores the tree before growing the diff on reversal", () => {
	expect(squeezeReviewDiff({ proposed: 500, minDiff: 280, maxDiff: 1340, treeOpen: true, minTree: 120, treeWidth: 300 })).toEqual({
		diff: 500,
		tree: 300,
	});
});

test("keeps the tree var at zero while the tree is closed", () => {
	expect(squeezeReviewDiff({ proposed: 180, minDiff: 280, maxDiff: 1340, treeOpen: false, minTree: 120, treeWidth: 300 })).toEqual({
		diff: 280,
		tree: 0,
	});
});

test("redistributes a fixed Review width between tree and diff", () => {
	expect(redistributeReviewTree({ proposed: 280, total: 1010, minTree: 120, minDiff: 280 })).toEqual({
		tree: 280,
		diff: 730,
	});
});

test("clamps the tree against the diff minimum", () => {
	expect(redistributeReviewTree({ proposed: 900, total: 1010, minTree: 120, minDiff: 280 })).toEqual({
		tree: 730,
		diff: 280,
	});
});

const LAST_TURN = { worktrees: 2, scope: "Last turn", totals: undefined };

test("keeps the whole header inline while the panel is wide", () => {
	expect(reviewHeaderControls({ ...LAST_TURN, width: 648, totals: { additions: 128, deletions: 64 } })).toEqual({
		worktree: true,
		actions: true,
		more: false,
	});
});

test("sends the header actions to the menu before the worktree", () => {
	expect(reviewHeaderControls({ ...LAST_TURN, width: 340, totals: { additions: 128, deletions: 64 } })).toEqual({
		worktree: true,
		actions: false,
		more: true,
	});
});

test("holds the actions back until the worktree has room to be read", () => {
	expect(reviewHeaderControls({ ...LAST_TURN, width: 400, totals: { additions: 128, deletions: 64 } })).toEqual({
		worktree: true,
		actions: false,
		more: true,
	});
});

test("keeps the worktree inline while the header still fits its trigger", () => {
	expect(reviewHeaderControls({ ...LAST_TURN, width: 280 })).toEqual({
		worktree: true,
		actions: false,
		more: true,
	});
});

test("sends the worktree to the menu once even a truncated trigger stops fitting", () => {
	expect(reviewHeaderControls({ ...LAST_TURN, width: 264 })).toEqual({
		worktree: false,
		actions: false,
		more: true,
	});
});

test("the totals take their room from the worktree first", () => {
	expect(reviewHeaderControls({ ...LAST_TURN, width: 300, totals: { additions: 1234, deletions: 5678 } })).toEqual({
		worktree: false,
		actions: false,
		more: true,
	});
});

test("a longer scope label costs the header the same room a control would", () => {
	expect(reviewHeaderControls({ ...LAST_TURN, width: 350, scope: "Branch" }).actions).toBe(true);
	expect(reviewHeaderControls({ ...LAST_TURN, width: 350, scope: "Uncommitted" }).actions).toBe(false);
});

test("a project with a single worktree keeps its actions inline for longer", () => {
	expect(reviewHeaderControls({ ...LAST_TURN, width: 280, worktrees: 1 })).toEqual({
		worktree: false,
		actions: true,
		more: false,
	});
});

test("a single-worktree project still folds its actions when narrow", () => {
	expect(reviewHeaderControls({ ...LAST_TURN, width: 240, worktrees: 1 })).toEqual({
		worktree: false,
		actions: false,
		more: true,
	});
});

test("a resizing header only reports back once its width moves a whole step", () => {
	expect(reviewHeaderStep(348)).toBe(reviewHeaderStep(340));
	expect(reviewHeaderStep(352)).not.toBe(reviewHeaderStep(348));
	expect(reviewHeaderStep(348)).toBeLessThanOrEqual(348);
});

test("a stepped width never promises room the panel does not have", () => {
	const overreaching: number[] = [];
	for (let width = 240; width <= 640; width += 1) {
		const stepped = reviewHeaderControls({ ...LAST_TURN, width: reviewHeaderStep(width) });
		const exact = reviewHeaderControls({ ...LAST_TURN, width });
		if ((stepped.worktree && !exact.worktree) || (stepped.actions && !exact.actions)) {
			overreaching.push(width);
		}
	}

	expect(overreaching).toEqual([]);
});

test("controls only ever leave the header as it narrows", () => {
	const returning: number[] = [];
	for (let width = 240; width <= 640; width += 1) {
		const narrow = reviewHeaderControls({ ...LAST_TURN, width });
		const wider = reviewHeaderControls({ ...LAST_TURN, width: width + 1 });
		if ((narrow.worktree && !wider.worktree) || (narrow.actions && !wider.actions)) {
			returning.push(width);
		}
	}

	expect(returning).toEqual([]);
});

test("an unmeasured header renders every control inline", () => {
	expect(reviewHeaderControls({ ...LAST_TURN, width: undefined })).toEqual({
		worktree: true,
		actions: true,
		more: false,
	});
});
