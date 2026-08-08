import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { type DiffLine, type ReviewContent } from "@shared/review";
import { ChangedFiles } from "@main/git/changed-files";
import { FileDiff } from "@main/git/file-diff";
import { ReviewBase } from "@main/git/review-base";
import { TurnBaseline } from "@main/git/review/turn-baseline";
import { GitRun } from "@main/git/git-run";
import { Worktrees } from "@main/git/worktree/worktrees";
import { assertDefined } from "./utils/assertions";

function git(cwd: string, ...args: string[]): void {
	execFileSync("git", args, { cwd });
}

function repo(name: string): string {
	assertDefined(process.env.DATA_DIR);
	const path = join(process.env.DATA_DIR, name);
	mkdirSync(path);
	git(path, "init", "-b", "main");
	git(path, "config", "user.email", "test@bankai.dev");
	git(path, "config", "user.name", "Bankai");
	return path;
}

function numberedLines(count: number): string {
	return `${Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n")}\n`;
}

function readyLines(content: ReviewContent) {
	expect(content.status).toBe("ready");
	if (content.status !== "ready") {
		throw new Error("Expected ready review content");
	}

	return content.lines;
}

describe("ChangedFiles.snapshot", () => {
	it("reports a non-git directory as not a repository", async () => {
		assertDefined(process.env.DATA_DIR);
		const plain = join(process.env.DATA_DIR, "plain");
		mkdirSync(plain);

		const snapshot = await ChangedFiles.snapshot({ path: plain, mode: "uncommitted" });

		expect(snapshot).toEqual({
			state: "not-a-repo",
			files: [],
			totals: { additions: 0, deletions: 0, files: 0 },
		});
	});

	it("returns only metadata while loading an untracked file on demand", async () => {
		const path = repo("lazy-untracked");
		writeFileSync(join(path, "fresh.txt"), "hello\n");

		const snapshot = await ChangedFiles.snapshot({ path, mode: "uncommitted" });
		const fresh = snapshot.files.find((file) => file.path === "fresh.txt");
		assertDefined(fresh);
		expect(fresh).toEqual({ path: "fresh.txt", status: "untracked", additions: 1, deletions: 0 });
		expect("content" in fresh).toBe(false);

		const content = await FileDiff.one({ path, file: fresh.path, mode: "uncommitted" });
		expect(readyLines(content)).toEqual([{ kind: "add", number: 1, hunk: 1, content: "hello" }]);
	});

	it("counts working-tree edits and multiple untracked files", async () => {
		const path = repo("uncommitted");
		writeFileSync(join(path, "a.txt"), "one\ntwo\nthree\n");
		git(path, "add", "a.txt");
		git(path, "commit", "-m", "init");

		writeFileSync(join(path, "a.txt"), "one\nTWO\nthree\nfour\n");
		writeFileSync(join(path, "b.txt"), "brand new\n");
		writeFileSync(join(path, "c.txt"), "first\nsecond");

		const snapshot = await ChangedFiles.snapshot({ path, mode: "uncommitted" });

		expect(snapshot.files.find((file) => file.path === "a.txt")).toEqual({
			path: "a.txt",
			status: "modified",
			additions: 2,
			deletions: 1,
		});
		expect(snapshot.files.find((file) => file.path === "b.txt")).toEqual({
			path: "b.txt",
			status: "untracked",
			additions: 1,
			deletions: 0,
		});
		expect(snapshot.files.find((file) => file.path === "c.txt")?.additions).toBe(2);
		expect(snapshot.totals).toEqual({ additions: 5, deletions: 1, files: 3 });
	});

	it("loads compact diff hunks with old and new line numbers", async () => {
		const path = repo("line-numbers");
		writeFileSync(join(path, "lines.txt"), numberedLines(15));
		git(path, "add", "lines.txt");
		git(path, "commit", "-m", "init");
		writeFileSync(
			join(path, "lines.txt"),
			numberedLines(15).replace("line 1\n", "first\n").replace("line 15\n", "last\n"),
		);

		const lines = readyLines(await FileDiff.one({ path, file: "lines.txt", mode: "uncommitted" }));

		expect(lines.find((line) => line.content === "line 1")).toEqual({
			kind: "remove",
			oldNumber: 1,
			hunk: 1,
			content: "line 1",
		});
		expect(lines.find((line) => line.content === "line 2")).toEqual({
			kind: "context",
			number: 2,
			oldNumber: 2,
			hunk: 1,
			content: "line 2",
		});
		expect(lines.find((line) => line.content === "line 14")?.hunk).toBe(2);
		expect(lines.find((line) => line.content === "last")).toEqual({
			kind: "add",
			number: 15,
			hunk: 2,
			content: "last",
		});
	});

	it("loads tracked and untracked compact content in requested order", async () => {
		const path = repo("batch-content");
		writeFileSync(join(path, "first.txt"), "before\n");
		writeFileSync(join(path, "second.txt"), "before\n");
		git(path, "add", "first.txt", "second.txt");
		git(path, "commit", "-m", "init");
		writeFileSync(join(path, "first.txt"), "after first\n");
		writeFileSync(join(path, "second.txt"), "after second\n");
		writeFileSync(join(path, "fresh.txt"), "fresh\n");

		const result = await FileDiff.many({
			path,
			files: ["second.txt", "fresh.txt", "first.txt"],
			mode: "uncommitted",
		});

		expect(result.files.map((file) => file.path)).toEqual(["second.txt", "fresh.txt", "first.txt"]);
		expect(readyLines(result.files[0]?.content ?? { status: "unavailable" }).at(-1)?.content).toBe("after second");
		expect(readyLines(result.files[1]?.content ?? { status: "unavailable" }).at(-1)?.content).toBe("fresh");
		expect(readyLines(result.files[2]?.content ?? { status: "unavailable" }).at(-1)?.content).toBe("after first");
	});

	it("shows indexed and untracked files before the first commit", async () => {
		const path = repo("unborn-index");
		writeFileSync(join(path, "indexed.txt"), "indexed\ncurrent\n");
		writeFileSync(join(path, "missing.txt"), "missing\n");
		git(path, "add", "indexed.txt", "missing.txt");
		writeFileSync(join(path, "indexed.txt"), "indexed\nupdated\n");
		unlinkSync(join(path, "missing.txt"));
		writeFileSync(join(path, "untracked.txt"), "untracked\n");

		for (const mode of ["uncommitted", "branch"] as const) {
			const snapshot = await ChangedFiles.snapshot({ path, mode });
			expect(snapshot.files.find((file) => file.path === "indexed.txt")).toEqual({
				path: "indexed.txt",
				status: "added",
				additions: 2,
				deletions: 0,
			});
			expect(snapshot.files.find((file) => file.path === "missing.txt")).toEqual({
				path: "missing.txt",
				status: "added",
				additions: 0,
				deletions: 0,
			});
			expect(snapshot.files.find((file) => file.path === "untracked.txt")?.status).toBe("untracked");
			expect(await FileDiff.one({ path, file: "missing.txt", mode })).toEqual({ status: "unavailable" });
			expect(snapshot.totals).toEqual({ additions: 3, deletions: 0, files: 3 });
		}
	});

	it("classifies empty and binary content only when requested", async () => {
		const path = repo("non-text");
		writeFileSync(join(path, "tracked.bin"), Buffer.from([0, 1, 2]));
		git(path, "add", "tracked.bin");
		git(path, "commit", "-m", "binary base");
		writeFileSync(join(path, "tracked.bin"), Buffer.from([0, 3, 4]));
		writeFileSync(join(path, "new.bin"), Buffer.from([0, 5, 6]));
		writeFileSync(join(path, "empty.txt"), "");

		const snapshot = await ChangedFiles.snapshot({ path, mode: "uncommitted" });

		expect(snapshot.files.find((file) => file.path === "new.bin")?.additions).toBe(0);
		expect(await FileDiff.one({ path, file: "tracked.bin", mode: "uncommitted" })).toEqual({ status: "binary" });
		expect(await FileDiff.one({ path, file: "new.bin", mode: "uncommitted" })).toEqual({ status: "binary" });
		expect(await FileDiff.one({ path, file: "empty.txt", mode: "uncommitted" })).toEqual({ status: "empty" });
	});

	it("counts large new files without including their content in the snapshot", async () => {
		const path = repo("large-new-snapshot");
		writeFileSync(join(path, "many-lines.txt"), numberedLines(ReviewBase.FULL_FILE_MAX_LINES + 1));
		writeFileSync(join(path, "wide.txt"), "x".repeat(GitRun.GIT_OUTPUT_MAX_BYTES + 1));

		const snapshot = await ChangedFiles.snapshot({ path, mode: "uncommitted" });
		expect(snapshot.files.find((file) => file.path === "many-lines.txt")?.additions).toBe(ReviewBase.FULL_FILE_MAX_LINES + 1);
		expect(snapshot.files.find((file) => file.path === "wide.txt")?.additions).toBe(1);
		expect(await FileDiff.one({ path, file: "many-lines.txt", mode: "uncommitted" })).toEqual({
			status: "too-large",
			lineCount: ReviewBase.FULL_FILE_MAX_LINES + 1,
		});
		expect(await FileDiff.one({ path, file: "wide.txt", mode: "uncommitted" })).toEqual({ status: "too-large" });
	});

	it("isolates unavailable new files and excludes ignored files", async () => {
		const path = repo("new-file-availability");
		writeFileSync(join(path, ".gitignore"), "ignored.txt\n");
		writeFileSync(join(path, "ignored.txt"), "ignored\n");
		writeFileSync(join(path, "ready.txt"), "ready\n");
		writeFileSync(join(path, "unreadable.txt"), "unreadable\n");
		chmodSync(join(path, "unreadable.txt"), 0);

		try {
			const snapshot = await ChangedFiles.snapshot({ path, mode: "uncommitted" });
			expect(snapshot.files.some((file) => file.path === "ignored.txt")).toBe(false);
			expect(snapshot.files.find((file) => file.path === "ready.txt")?.additions).toBe(1);
			expect(snapshot.files.find((file) => file.path === "unreadable.txt")?.additions).toBe(0);
			expect(await FileDiff.one({ path, file: "unreadable.txt", mode: "uncommitted" })).toEqual({
				status: "unavailable",
			});
		} finally {
			chmodSync(join(path, "unreadable.txt"), 0o644);
		}
	});

	it("parses renamed file metadata without patch content", async () => {
		const path = repo("rename");
		writeFileSync(join(path, "before.txt"), "one\ntwo\n");
		git(path, "add", "before.txt");
		git(path, "commit", "-m", "init");
		git(path, "mv", "before.txt", "after.txt");
		writeFileSync(join(path, "after.txt"), "one\ntwo\nthree\n");

		const snapshot = await ChangedFiles.snapshot({ path, mode: "uncommitted" });

		expect(snapshot.files).toEqual([
			{ path: "after.txt", status: "renamed", additions: 1, deletions: 0 },
		]);
	});

	it("includes committed branch work only in branch scope", async () => {
		const path = repo("branch");
		writeFileSync(join(path, "a.txt"), "base\n");
		git(path, "add", "a.txt");
		git(path, "commit", "-m", "base");
		git(path, "checkout", "-b", "feature");
		writeFileSync(join(path, "c.txt"), "feature\n");
		git(path, "add", "c.txt");
		git(path, "commit", "-m", "feature work");
		writeFileSync(join(path, "d.txt"), "wip\n");

		const branch = await ChangedFiles.snapshot({ path, mode: "branch" });
		expect(branch.files.find((file) => file.path === "c.txt")?.status).toBe("added");
		expect(branch.files.find((file) => file.path === "d.txt")?.status).toBe("untracked");

		const uncommitted = await ChangedFiles.snapshot({ path, mode: "uncommitted" });
		expect(uncommitted.files.some((file) => file.path === "c.txt")).toBe(false);
		expect(uncommitted.files.find((file) => file.path === "d.txt")?.status).toBe("untracked");
	});
});

describe("ChangedFiles.snapshot in the last turn scope", () => {
	it("reports no turn before an agent has started one", async () => {
		const path = repo("last-turn-unseen");
		const shellId = "shell-unseen";
		writeFileSync(join(path, "a.txt"), "mine\n");

		expect(await ChangedFiles.snapshot({ path, mode: "last-turn", shellId })).toEqual({
			state: "no-turn",
			files: [],
			totals: { additions: 0, deletions: 0, files: 0 },
		});
	});

	it("reads the working tree against the turn baseline instead of HEAD", async () => {
		const path = repo("last-turn-working-tree");
		const shellId = "shell-working-tree";
		writeFileSync(join(path, "kept.txt"), "one\n");
		writeFileSync(join(path, "touched.txt"), "one\n");
		writeFileSync(join(path, "reverted.txt"), "one\n");
		git(path, "add", "kept.txt", "touched.txt", "reverted.txt");
		git(path, "commit", "-m", "init");

		writeFileSync(join(path, "kept.txt"), "one\nmine\n");
		writeFileSync(join(path, "touched.txt"), "one\nmine\n");
		writeFileSync(join(path, "reverted.txt"), "one\nmine\n");
		writeFileSync(join(path, "notes.txt"), "mine\n");
		writeFileSync(join(path, "wip.txt"), "mine\n");

		await TurnBaseline.capture({ path, shellId });

		writeFileSync(join(path, "touched.txt"), "one\nmine\nagent\n");
		writeFileSync(join(path, "reverted.txt"), "one\n");
		writeFileSync(join(path, "notes.txt"), "mine\nagent\n");
		writeFileSync(join(path, "fresh.txt"), "agent\n");
		unlinkSync(join(path, "wip.txt"));

		const snapshot = await ChangedFiles.snapshot({ path, mode: "last-turn", shellId });

		expect(snapshot.files).toEqual([
			{ path: "fresh.txt", status: "untracked", additions: 1, deletions: 0 },
			{ path: "notes.txt", status: "untracked", additions: 1, deletions: 0 },
			{ path: "reverted.txt", status: "modified", additions: 0, deletions: 1 },
			{ path: "touched.txt", status: "modified", additions: 1, deletions: 0 },
			{ path: "wip.txt", status: "deleted", additions: 0, deletions: 1 },
		]);
		expect(snapshot.totals).toEqual({ additions: 3, deletions: 2, files: 5 });
	});

	it("keeps work the agent committed during the turn in scope", async () => {
		const path = repo("last-turn-commit");
		const shellId = "shell-commit";
		writeFileSync(join(path, "clean.txt"), "one\n");
		writeFileSync(join(path, "dirty.txt"), "one\n");
		git(path, "add", "clean.txt", "dirty.txt");
		git(path, "commit", "-m", "init");
		writeFileSync(join(path, "dirty.txt"), "one\nmine\n");

		await TurnBaseline.capture({ path, shellId });

		writeFileSync(join(path, "clean.txt"), "one\nagent\n");
		writeFileSync(join(path, "dirty.txt"), "one\nmine\nagent\n");
		git(path, "add", "clean.txt", "dirty.txt");
		git(path, "commit", "-m", "agent work");

		const snapshot = await ChangedFiles.snapshot({ path, mode: "last-turn", shellId });

		expect(snapshot.files).toEqual([
			{ path: "clean.txt", status: "modified", additions: 1, deletions: 0 },
			{ path: "dirty.txt", status: "modified", additions: 1, deletions: 0 },
		]);
		expect((await ChangedFiles.snapshot({ path, mode: "uncommitted" })).files).toEqual([]);
	});

	it("reads baseline-relative content in single and batch reads", async () => {
		const path = repo("last-turn-content");
		const shellId = "shell-content";
		writeFileSync(join(path, "tracked.txt"), "one\n");
		git(path, "add", "tracked.txt");
		git(path, "commit", "-m", "init");
		writeFileSync(join(path, "tracked.txt"), "one\nmine\n");

		await TurnBaseline.capture({ path, shellId });

		writeFileSync(join(path, "tracked.txt"), "one\nmine\nagent\n");

		const expected: DiffLine[] = [
			{ kind: "context", number: 1, oldNumber: 1, hunk: 1, content: "one" },
			{ kind: "context", number: 2, oldNumber: 2, hunk: 1, content: "mine" },
			{ kind: "add", number: 3, hunk: 1, content: "agent" },
		];
		expect(readyLines(await FileDiff.one({ path, file: "tracked.txt", mode: "last-turn", shellId }))).toEqual(expected);

		const batch = await FileDiff.many({ path, files: ["tracked.txt"], mode: "last-turn", shellId });
		expect(readyLines(batch.files[0]?.content ?? { status: "unavailable" })).toEqual(expected);
	});

	it("reads a file the turn deleted as its baseline content", async () => {
		const path = repo("last-turn-deleted");
		const shellId = "shell-deleted";
		writeFileSync(join(path, "gone.txt"), "one\ntwo\n");
		git(path, "add", "gone.txt");
		git(path, "commit", "-m", "init");
		writeFileSync(join(path, "gone.txt"), "one\ntwo\nmine\n");

		await TurnBaseline.capture({ path, shellId });

		unlinkSync(join(path, "gone.txt"));

		expect(readyLines(await FileDiff.one({ path, file: "gone.txt", mode: "last-turn", shellId }))).toEqual([
			{ kind: "remove", oldNumber: 1, hunk: 1, content: "one" },
			{ kind: "remove", oldNumber: 2, hunk: 1, content: "two" },
			{ kind: "remove", oldNumber: 3, hunk: 1, content: "mine" },
		]);
	});

	it("keeps each shell reading against its own turn", async () => {
		const path = repo("last-turn-per-shell");
		writeFileSync(join(path, "a.txt"), "one\n");
		git(path, "add", "a.txt");
		git(path, "commit", "-m", "init");

		await TurnBaseline.capture({ path, shellId: "tab-1" });
		writeFileSync(join(path, "a.txt"), "one\nfrom tab 1\n");

		await TurnBaseline.capture({ path, shellId: "tab-2" });
		writeFileSync(join(path, "a.txt"), "one\nfrom tab 1\nfrom tab 2\n");

		expect((await ChangedFiles.snapshot({ path, mode: "last-turn", shellId: "tab-1" })).files).toEqual([
			{ path: "a.txt", status: "modified", additions: 2, deletions: 0 },
		]);
		expect((await ChangedFiles.snapshot({ path, mode: "last-turn", shellId: "tab-2" })).files).toEqual([
			{ path: "a.txt", status: "modified", additions: 1, deletions: 0 },
		]);
	});

	it("forgets a closed shell's turn without touching the others", async () => {
		const path = repo("last-turn-forget");
		writeFileSync(join(path, "a.txt"), "one\n");
		git(path, "add", "a.txt");
		git(path, "commit", "-m", "init");

		await TurnBaseline.capture({ path, shellId: "tab-open" });
		await TurnBaseline.capture({ path, shellId: "tab-closed" });
		writeFileSync(join(path, "a.txt"), "one\nagent\n");

		TurnBaseline.byShell.delete("tab-closed");

		expect(await ChangedFiles.snapshot({ path, mode: "last-turn", shellId: "tab-closed" })).toEqual({
			state: "no-turn",
			files: [],
			totals: { additions: 0, deletions: 0, files: 0 },
		});
		expect((await ChangedFiles.snapshot({ path, mode: "last-turn", shellId: "tab-open" })).files).toEqual([
			{ path: "a.txt", status: "modified", additions: 1, deletions: 0 },
		]);
	});

	it("starts no turn in a directory git does not track", async () => {
		assertDefined(process.env.DATA_DIR);
		const path = join(process.env.DATA_DIR, "last-turn-outside-git");
		mkdirSync(path);
		const shellId = "shell-outside-git";

		await TurnBaseline.capture({ path, shellId });

		expect(TurnBaseline.byShell.has(shellId)).toBe(false);
	});
});

describe("FileDiff.full", () => {
	it("classifies empty and binary files", async () => {
		const path = repo("full-file-non-text");
		writeFileSync(join(path, "empty.txt"), "");
		writeFileSync(join(path, "binary.bin"), Buffer.from([0, 1, 2]));

		expect(await FileDiff.full({ path, file: "empty.txt", mode: "uncommitted" })).toEqual({ status: "empty" });
		expect(await FileDiff.full({ path, file: "binary.bin", mode: "uncommitted" })).toEqual({ status: "binary" });
	});

	it("returns tracked content with unchanged context", async () => {
		const path = repo("full-file");
		writeFileSync(join(path, "tracked.txt"), "one\ntwo\nthree\n");
		git(path, "add", "tracked.txt");
		git(path, "commit", "-m", "init");
		writeFileSync(join(path, "tracked.txt"), "one\nTWO\nthree\n");

		expect(await FileDiff.full({ path, file: "tracked.txt", mode: "uncommitted" })).toEqual({
			status: "ready",
			lines: [
				{ kind: "context", number: 1, oldNumber: 1, hunk: 1, content: "one" },
				{ kind: "remove", oldNumber: 2, hunk: 1, content: "two" },
				{ kind: "add", number: 2, hunk: 1, content: "TWO" },
				{ kind: "context", number: 3, oldNumber: 3, hunk: 1, content: "three" },
			],
		});
	});

	it("returns deleted content in uncommitted and branch scopes", async () => {
		const path = repo("deleted-file");
		writeFileSync(join(path, "deleted.txt"), "one\ntwo\n");
		git(path, "add", "deleted.txt");
		git(path, "commit", "-m", "init");
		git(path, "checkout", "-b", "feature");
		unlinkSync(join(path, "deleted.txt"));
		git(path, "add", "deleted.txt");

		const uncommitted = await FileDiff.full({ path, file: "deleted.txt", mode: "uncommitted" });
		expect(uncommitted).toEqual({
			status: "ready",
			lines: [
				{ kind: "remove", oldNumber: 1, hunk: 1, content: "one" },
				{ kind: "remove", oldNumber: 2, hunk: 1, content: "two" },
			],
		});

		git(path, "commit", "-m", "delete file");
		expect(await FileDiff.full({ path, file: "deleted.txt", mode: "branch" })).toEqual(uncommitted);
	});

	it("limits tracked and untracked full files", async () => {
		const path = repo("large-files");
		writeFileSync(join(path, "tracked.txt"), "");
		git(path, "add", "tracked.txt");
		git(path, "commit", "-m", "init");
		writeFileSync(join(path, "tracked.txt"), numberedLines(ReviewBase.FULL_FILE_MAX_LINES + 1));
		writeFileSync(join(path, "untracked.txt"), numberedLines(ReviewBase.FULL_FILE_MAX_LINES + 1));

		const expected = { status: "too-large", lineCount: ReviewBase.FULL_FILE_MAX_LINES + 1 } as const;
		expect(await FileDiff.full({ path, file: "tracked.txt", mode: "uncommitted" })).toEqual(expected);
		expect(await FileDiff.full({ path, file: "untracked.txt", mode: "uncommitted" })).toEqual(expected);
	});

	it("returns too-large without a count when git output exceeds the buffer", async () => {
		const path = repo("wide-line");
		writeFileSync(join(path, "wide.txt"), "x".repeat(GitRun.GIT_OUTPUT_MAX_BYTES + 1));

		expect(await FileDiff.full({ path, file: "wide.txt", mode: "uncommitted" })).toEqual({ status: "too-large" });
	});

	it("rejects paths outside the repository for both content reads", () => {
		const path = repo("path-traversal");
		const outside = join(path, "..", "path-traversal-outside");
		mkdirSync(outside);
		writeFileSync(join(outside, "secret.txt"), "secret\n");
		symlinkSync(outside, join(path, "link"), "dir");

		for (const read of [FileDiff.one, FileDiff.full]) {
			expect(() => read({ path, file: "../outside.txt", mode: "uncommitted" })).toThrow(
				"File path must stay within the repository root",
			);
			expect(() => read({ path, file: join(path, "inside.txt"), mode: "uncommitted" })).toThrow(
				"File path must be relative to the repository root",
			);
			expect(() => read({ path, file: "link/secret.txt", mode: "uncommitted" })).toThrow(
				"File path must stay within the repository root",
			);
		}
	});
});

describe("Git in a linked worktree", () => {
	function linkedRepo(name: string) {
		assertDefined(process.env.DATA_DIR);
		const path = repo(name);
		writeFileSync(join(path, "a.txt"), "one\n");
		git(path, "add", "a.txt");
		git(path, "commit", "-m", "init");

		const worktree = join(process.env.DATA_DIR, `${name}-linked`);
		git(path, "worktree", "add", worktree, "-b", `feat/${name}`);

		return { path, worktree };
	}

	it("lists the project and every linked worktree with its branch", async () => {
		const { path, worktree } = linkedRepo("worktree-listing");

		expect(await Worktrees.read(worktree)).toEqual([
			{ path, branch: "main" },
			{ path: worktree, branch: "feat/worktree-listing" },
		]);
	});

	it("reads a turn captured in the worktree the agent works in", async () => {
		const { worktree } = linkedRepo("worktree-turn");
		const shellId = "shell-linked";

		await TurnBaseline.capture({ path: worktree, shellId });
		writeFileSync(join(worktree, "a.txt"), "one\nagent\n");

		expect((await ChangedFiles.snapshot({ path: worktree, mode: "last-turn", shellId })).files).toEqual([
			{ path: "a.txt", status: "modified", additions: 1, deletions: 0 },
		]);
	});

	it("does not read a turn baseline captured in another worktree", async () => {
		const { path, worktree } = linkedRepo("worktree-turn-elsewhere");
		const shellId = "shell-elsewhere";

		await TurnBaseline.capture({ path: worktree, shellId });
		writeFileSync(join(path, "a.txt"), "one\nmine\n");

		expect((await ChangedFiles.snapshot({ path, mode: "last-turn", shellId })).state).toBe("no-turn");
	});

	it("stops offering a worktree whose directory was wiped", async () => {
		const { path, worktree } = linkedRepo("worktree-wiped");
		rmSync(worktree, { recursive: true, force: true });

		expect(await Worktrees.read(path)).toEqual([{ path, branch: "main" }]);
	});

	it("restores a wiped worktree on its branch", async () => {
		const { path, worktree } = linkedRepo("worktree-restore");
		rmSync(worktree, { recursive: true, force: true });

		expect(await Worktrees.restore(path, join(worktree, "src"))).toBe(true);
		expect(existsSync(worktree)).toBe(true);
		expect(await Worktrees.read(path)).toEqual([
			{ path, branch: "main" },
			{ path: worktree, branch: "feat/worktree-restore" },
		]);
	});

	it("restores the worktree without bringing back an untracked subdirectory", async () => {
		const { path, worktree } = linkedRepo("worktree-untracked-subdir");
		const scratch = join(worktree, "scratch");
		mkdirSync(scratch);
		rmSync(worktree, { recursive: true, force: true });

		expect(await Worktrees.restore(path, scratch)).toBe(true);
		expect(existsSync(worktree)).toBe(true);
		expect(existsSync(scratch)).toBe(false);
	});

	it("restores nothing for a directory no worktree owns", async () => {
		const { path } = linkedRepo("worktree-unknown");

		expect(await Worktrees.restore(path, join(path, "..", "somewhere-else"))).toBe(false);
	});

	it("restores nothing for a worktree that is still on disk", async () => {
		const { path, worktree } = linkedRepo("worktree-alive");

		expect(await Worktrees.restore(path, worktree)).toBe(false);
	});
});
