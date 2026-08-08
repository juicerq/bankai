import { expect, test } from "bun:test";
import {
	expandReviewDiff,
	redistributeReviewTree,
	REVIEW_SEPARATOR_WIDTH,
	squeezeReviewDiff,
} from "@renderer/routes/-features/review/panel/review-layout";

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

test("expanded, the diff takes the whole row the tree leaves behind", () => {
	expect(expandReviewDiff({ rowWidth: 1600, treeWidth: 200, minDiff: 280 })).toBe(1400 - REVIEW_SEPARATOR_WIDTH);
});

test("expanded, the diff still refuses to go under its minimum", () => {
	expect(expandReviewDiff({ rowWidth: 380, treeWidth: 200, minDiff: 280 })).toBe(280);
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
