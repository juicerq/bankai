import { expect, it } from "bun:test";
import type { FileChange } from "@main/git/contracts";
import { selectInitialReviewPaths } from "@renderer/routes/-utils/review-initial-content";

const changedFile = (path: string, additions: number, deletions = 0): FileChange => ({
	path,
	status: "modified",
	additions,
	deletions,
});

it("selects whole files in snapshot order up to the global initial budget", () => {
	const selected = selectInitialReviewPaths([
		changedFile("one.ts", 40),
		changedFile("two.ts", 60),
		changedFile("three.ts", 20),
	]);

	expect([...selected]).toEqual(["one.ts", "two.ts"]);
});

it("selects the first whole file when it exceeds the initial budget", () => {
	const selected = selectInitialReviewPaths([
		changedFile("large.ts", 140),
		changedFile("later.ts", 10),
	]);

	expect([...selected]).toEqual(["large.ts"]);
});

it("continues through zero-line metadata until the budget is reached", () => {
	const selected = selectInitialReviewPaths([
		changedFile("binary.png", 0),
		changedFile("empty.ts", 0),
		changedFile("changed.ts", 100),
		changedFile("later.ts", 1),
	]);

	expect([...selected]).toEqual(["binary.png", "empty.ts", "changed.ts"]);
});
