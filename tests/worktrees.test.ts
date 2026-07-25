import { describe, expect, test } from "bun:test";
import { parseWorktrees, worktreeContaining, worktreeFailure } from "@main/git/Worktrees";

const PORCELAIN = `worktree /home/jui/projects/bankai-2
HEAD 4b04c676ca56b7f470e6b66efbf9502393160b2e
branch refs/heads/main

worktree /tmp/bankai-2-dnd-projects-tabs
HEAD 2198ee881201f5ec4b2aa3c1f913be788c185fe1
branch refs/heads/feat/dnd-projects-tabs
prunable gitdir file points to non-existent location

worktree /tmp/bankai-2-last-turn-scope
HEAD 454be988933ad0d3094272f712650dba240a9184
branch refs/heads/feat/last-turn-review-scope
`;

describe("worktree listing", () => {
	test("reads every usable worktree with its branch, main tree first", () => {
		expect(parseWorktrees(PORCELAIN)).toEqual([
			{ path: "/home/jui/projects/bankai-2", branch: "main" },
			{ path: "/tmp/bankai-2-last-turn-scope", branch: "feat/last-turn-review-scope" },
		]);
	});

	test("a worktree whose directory is gone is not offered", () => {
		expect(parseWorktrees(PORCELAIN).map((worktree) => worktree.path)).not.toContain(
			"/tmp/bankai-2-dnd-projects-tabs",
		);
	});

	test("a bare repository is not a place to read a diff from", () => {
		expect(parseWorktrees("worktree /srv/bankai.git\nbare\n")).toEqual([]);
	});

	test("a detached worktree is usable and carries no branch", () => {
		expect(parseWorktrees("worktree /tmp/detached\nHEAD 454be98\ndetached\n")).toEqual([
			{ path: "/tmp/detached" },
		]);
	});

	test("an empty listing yields no worktrees", () => {
		expect(parseWorktrees("")).toEqual([]);
	});
});

describe("reporting a refused removal", () => {
	test("git's own reason reaches the caller without its fatal prefix", () => {
		const err = Object.assign(new Error("Command failed: git worktree remove /tmp/bankai-2-solo"), {
			stderr: "fatal: '/tmp/bankai-2-solo' contains modified or untracked files, use --force to delete it\n",
		});

		expect(worktreeFailure(err)).toBe(
			"'/tmp/bankai-2-solo' contains modified or untracked files, use --force to delete it",
		);
	});

	test("only the first line of a multi-line failure is reported", () => {
		const err = Object.assign(new Error("Command failed"), { stderr: "fatal: not a working tree\nhint: run prune\n" });

		expect(worktreeFailure(err)).toBe("not a working tree");
	});

	test("a failure git said nothing about falls back to the error itself", () => {
		expect(worktreeFailure(Object.assign(new Error("spawn git ENOENT"), { stderr: "  " }))).toBe("spawn git ENOENT");
	});
});

describe("locating an agent inside a worktree", () => {
	const worktrees = parseWorktrees(PORCELAIN);

	test("a cwd below a worktree belongs to it", () => {
		expect(worktreeContaining(worktrees, "/tmp/bankai-2-last-turn-scope/src/main")).toEqual({
			path: "/tmp/bankai-2-last-turn-scope",
			branch: "feat/last-turn-review-scope",
		});
	});

	test("the worktree root itself belongs to it", () => {
		expect(worktreeContaining(worktrees, "/tmp/bankai-2-last-turn-scope")?.path).toBe(
			"/tmp/bankai-2-last-turn-scope",
		);
	});

	test("a sibling directory sharing a name prefix does not match", () => {
		expect(worktreeContaining(worktrees, "/tmp/bankai-2-last-turn-scope-old")).toBeUndefined();
	});

	test("a cwd outside every worktree matches none", () => {
		expect(worktreeContaining(worktrees, "/home/jui/dogama/app")).toBeUndefined();
	});

	test("the deepest containing worktree wins when one nests inside another", () => {
		const nested = parseWorktrees(
			"worktree /repo\nbranch refs/heads/main\n\nworktree /repo/nested\nbranch refs/heads/feature\n",
		);

		expect(worktreeContaining(nested, "/repo/nested/src")?.branch).toBe("feature");
	});
});
