import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "bun:test";
import { REVIEW_CHANGE_DEBOUNCE_MS, ReviewChanges } from "@main/git/ReviewChanges";
import { assertDefined } from "./utils/assertions";

it("debounces recursive project filesystem changes into one invalidation", async () => {
	assertDefined(process.env.DATA_DIR);
	const project = join(process.env.DATA_DIR, "observed");
	const nested = join(project, "src");
	mkdirSync(nested, { recursive: true });

	let notifications = 0;
	const change = Promise.withResolvers<void>();
	const unsubscribe = ReviewChanges.subscribe(project, () => {
		notifications += 1;
		change.resolve();
	});

	try {
		writeFileSync(join(nested, "first.txt"), "first\n");
		writeFileSync(join(nested, "second.txt"), "second\n");
		expect(await changedWithin(change.promise)).toBe("changed");
		expect(notifications).toBe(1);
	} finally {
		unsubscribe();
	}
});

it("observes Git metadata stored outside a linked worktree", async () => {
	assertDefined(process.env.DATA_DIR);
	const repository = join(process.env.DATA_DIR, "repository");
	const project = join(process.env.DATA_DIR, "linked");
	mkdirSync(repository);
	execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repository });
	execFileSync("git", ["config", "user.email", "bankai@example.test"], { cwd: repository });
	execFileSync("git", ["config", "user.name", "Bankai Test"], { cwd: repository });
	writeFileSync(join(repository, "tracked.txt"), "tracked\n");
	execFileSync("git", ["add", "tracked.txt"], { cwd: repository });
	execFileSync("git", ["commit", "-qm", "initial"], { cwd: repository });
	execFileSync("git", ["worktree", "add", "-q", "-b", "linked", project], { cwd: repository });

	const change = Promise.withResolvers<void>();
	const unsubscribe = ReviewChanges.subscribe(project, () => change.resolve());
	try {
		execFileSync("git", ["commit", "--allow-empty", "-qm", "metadata only"], { cwd: project });
		expect(await changedWithin(change.promise)).toBe("changed");
	} finally {
		unsubscribe();
	}
});

async function changedWithin(change: Promise<void>) {
	return await Promise.race([
		change.then(() => "changed" as const),
		new Promise<"timeout">((resolve) => {
			setTimeout(() => resolve("timeout"), REVIEW_CHANGE_DEBOUNCE_MS * 8);
		}),
	]);
}
