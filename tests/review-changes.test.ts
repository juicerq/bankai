import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "bun:test";
import { REVIEW_CHANGE_DEBOUNCE_MS, ReviewChanges, reviewWatchPlan } from "@main/git/ReviewChanges";
import { assertDefined } from "./utils/assertions";

function initRepository(path: string): void {
	mkdirSync(path, { recursive: true });
	execFileSync("git", ["init", "-q", "-b", "main"], { cwd: path });
	execFileSync("git", ["config", "user.email", "bankai@example.test"], { cwd: path });
	execFileSync("git", ["config", "user.name", "Bankai Test"], { cwd: path });
}

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

it("skips Git-ignored directories and still watches the repository metadata", () => {
	assertDefined(process.env.DATA_DIR);
	const project = join(process.env.DATA_DIR, "ignoring");
	initRepository(project);
	writeFileSync(join(project, ".gitignore"), "node_modules\ndist\n");
	mkdirSync(join(project, "node_modules", "left-pad"), { recursive: true });
	mkdirSync(join(project, "dist"));
	mkdirSync(join(project, "src"));

	const plan = reviewWatchPlan(project);
	const paths = plan.targets.map((target) => target.path);

	expect(paths).not.toContain(join(project, "node_modules"));
	expect(paths).not.toContain(join(project, "dist"));
	expect(paths).toContain(join(project, "src"));
	expect(paths).toContain(join(project, ".git"));
	expect(plan.targets.find((target) => target.path === project)?.recursive).toBe(false);
});

it("watches the whole tree when the project is not a Git repository", () => {
	assertDefined(process.env.DATA_DIR);
	const project = join(process.env.DATA_DIR, "plain");
	mkdirSync(join(project, "src"), { recursive: true });

	expect(reviewWatchPlan(project).targets).toEqual([{ path: project, recursive: true }]);
});

it("invalidates on a commit in a repository whose .git is a directory", async () => {
	assertDefined(process.env.DATA_DIR);
	const project = join(process.env.DATA_DIR, "plain-repo");
	initRepository(project);
	writeFileSync(join(project, ".gitignore"), "node_modules\n");
	mkdirSync(join(project, "node_modules"));

	const change = Promise.withResolvers<void>();
	const unsubscribe = ReviewChanges.subscribe(project, () => change.resolve());
	try {
		execFileSync("git", ["commit", "--allow-empty", "-qm", "metadata only"], { cwd: project });
		expect(await changedWithin(change.promise)).toBe("changed");
	} finally {
		unsubscribe();
	}
});

it("invalidates on edits at the project root and deep inside a tracked directory", async () => {
	assertDefined(process.env.DATA_DIR);
	const project = join(process.env.DATA_DIR, "tracked");
	initRepository(project);
	writeFileSync(join(project, ".gitignore"), "node_modules\n");
	mkdirSync(join(project, "node_modules"));
	mkdirSync(join(project, "src", "deep", "nested"), { recursive: true });

	const atRoot = Promise.withResolvers<void>();
	const unsubscribe = ReviewChanges.subscribe(project, () => atRoot.resolve());
	try {
		writeFileSync(join(project, "package.json"), "{}\n");
		expect(await changedWithin(atRoot.promise)).toBe("changed");
	} finally {
		unsubscribe();
	}

	const deep = Promise.withResolvers<void>();
	const stop = ReviewChanges.subscribe(project, () => deep.resolve());
	try {
		writeFileSync(join(project, "src", "deep", "nested", "unit.ts"), "export {}\n");
		expect(await changedWithin(deep.promise)).toBe("changed");
	} finally {
		stop();
	}
});

it("adopts a top-level directory created after the project was observed", async () => {
	assertDefined(process.env.DATA_DIR);
	const project = join(process.env.DATA_DIR, "growing");
	initRepository(project);
	writeFileSync(join(project, ".gitignore"), "node_modules\n");

	let notifications = 0;
	const unsubscribe = ReviewChanges.subscribe(project, () => {
		notifications += 1;
	});

	try {
		const added = join(project, "packages");
		mkdirSync(added);
		await settled();
		expect(notifications).toBeGreaterThan(0);

		const adopted = Promise.withResolvers<void>();
		const stop = ReviewChanges.subscribe(project, () => adopted.resolve());
		try {
			mkdirSync(join(added, "api"), { recursive: true });
			writeFileSync(join(added, "api", "index.ts"), "export {}\n");
			expect(await changedWithin(adopted.promise)).toBe("changed");
		} finally {
			stop();
		}
	} finally {
		unsubscribe();
	}
});

async function settled() {
	await new Promise((resolve) => setTimeout(resolve, REVIEW_CHANGE_DEBOUNCE_MS * 4));
}

async function changedWithin(change: Promise<void>) {
	return await Promise.race([
		change.then(() => "changed" as const),
		new Promise<"timeout">((resolve) => {
			setTimeout(() => resolve("timeout"), REVIEW_CHANGE_DEBOUNCE_MS * 8);
		}),
	]);
}
