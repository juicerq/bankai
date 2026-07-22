import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { FULL_FILE_MAX_LINES, GIT_OUTPUT_MAX_BYTES, Git, type FileChange } from "@main/git/Git";
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

function readyLines(file: FileChange) {
	expect(file.content.status).toBe("ready");
	if (file.content.status !== "ready") {
		throw new Error(`Expected ready content for ${file.path}`);
	}

	return file.content.lines;
}

describe("Git.snapshot", () => {
	it("reports a non-directory-git path as not a repository", async () => {
		assertDefined(process.env.DATA_DIR);
		const plain = join(process.env.DATA_DIR, "plain");
		mkdirSync(plain);

		const snapshot = await Git.snapshot(plain, "uncommitted");

		expect(snapshot.isRepo).toBe(false);
		expect(snapshot.files).toEqual([]);
	});

	it("lists untracked files in a repository with no commits yet", async () => {
		const path = repo("empty");
		writeFileSync(join(path, "fresh.txt"), "hello\n");

		const snapshot = await Git.snapshot(path, "uncommitted");

		expect(snapshot.isRepo).toBe(true);
		const fresh = snapshot.files.find((file) => file.path === "fresh.txt");
		assertDefined(fresh);
		expect(fresh.status).toBe("untracked");
		expect(fresh.additions).toBe(1);
		expect(readyLines(fresh)).toEqual([{ kind: "add", number: 1, hunk: 1, content: "hello" }]);
	});

	it("counts working-tree edits and lists untracked files in uncommitted mode", async () => {
		const path = repo("uncommitted");
		writeFileSync(join(path, "a.txt"), "one\ntwo\nthree\n");
		git(path, "add", "a.txt");
		git(path, "commit", "-m", "init");

		writeFileSync(join(path, "a.txt"), "one\nTWO\nthree\nfour\n");
		writeFileSync(join(path, "b.txt"), "brand new\n");

		const snapshot = await Git.snapshot(path, "uncommitted");

		const edited = snapshot.files.find((file) => file.path === "a.txt");
		assertDefined(edited);
		expect(edited.status).toBe("modified");
		expect(edited.additions).toBe(2);
		expect(edited.deletions).toBe(1);
		expect(readyLines(edited).some((line) => line.kind === "add" && line.content === "four" && line.number === 4)).toBe(true);

		const untracked = snapshot.files.find((file) => file.path === "b.txt");
		assertDefined(untracked);
		expect(untracked.status).toBe("untracked");
		expect(untracked.additions).toBe(1);
		expect(readyLines(untracked)).toEqual([{ kind: "add", number: 1, hunk: 1, content: "brand new" }]);
		expect(snapshot.totals).toEqual({ additions: 3, deletions: 1, files: 2 });
	});

	it("tracks old and new line numbers across hunks", async () => {
		const path = repo("line-numbers");
		writeFileSync(join(path, "lines.txt"), numberedLines(15));
		git(path, "add", "lines.txt");
		git(path, "commit", "-m", "init");

		const changed = numberedLines(15).replace("line 1\n", "first\n").replace("line 15\n", "last\n");
		writeFileSync(join(path, "lines.txt"), changed);

		const snapshot = await Git.snapshot(path, "uncommitted");
		const file = snapshot.files.find((change) => change.path === "lines.txt");
		assertDefined(file);
		const lines = readyLines(file);

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
		expect(lines.find((line) => line.content === "line 14")).toEqual({
			kind: "context",
			number: 14,
			oldNumber: 14,
			hunk: 2,
			content: "line 14",
		});
		expect(lines.find((line) => line.content === "last")).toEqual({
			kind: "add",
			number: 15,
			hunk: 2,
			content: "last",
		});
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
			const snapshot = await Git.snapshot(path, mode);
			const indexed = snapshot.files.find((file) => file.path === "indexed.txt");
			const untracked = snapshot.files.find((file) => file.path === "untracked.txt");
			assertDefined(indexed);
			assertDefined(untracked);
			expect(indexed.status).toBe("added");
			expect(readyLines(indexed).map((line) => line.content)).toEqual(["indexed", "updated"]);
			expect(untracked.status).toBe("untracked");
			expect(snapshot.files.find((file) => file.path === "missing.txt")?.content).toEqual({
				status: "unavailable",
			});
			expect(snapshot.totals).toEqual({ additions: 3, deletions: 0, files: 3 });
		}
	});

	it("classifies empty and binary changed files", async () => {
		const path = repo("non-text");
		writeFileSync(join(path, "tracked.bin"), Buffer.from([0, 1, 2]));
		git(path, "add", "tracked.bin");
		git(path, "commit", "-m", "binary base");
		writeFileSync(join(path, "tracked.bin"), Buffer.from([0, 3, 4]));
		writeFileSync(join(path, "new.bin"), Buffer.from([0, 5, 6]));
		writeFileSync(join(path, "empty.txt"), "");

		const snapshot = await Git.snapshot(path, "uncommitted");

		expect(snapshot.files.find((file) => file.path === "tracked.bin")?.content).toEqual({ status: "binary" });
		expect(snapshot.files.find((file) => file.path === "new.bin")?.content).toEqual({ status: "binary" });
		expect(snapshot.files.find((file) => file.path === "empty.txt")?.content).toEqual({ status: "empty" });
	});

	it("limits large new files while retaining their addition counts", async () => {
		const path = repo("large-new-snapshot");
		writeFileSync(join(path, "many-lines.txt"), numberedLines(FULL_FILE_MAX_LINES + 1));
		writeFileSync(join(path, "wide.txt"), "x".repeat(GIT_OUTPUT_MAX_BYTES + 1));

		const snapshot = await Git.snapshot(path, "uncommitted");
		const manyLines = snapshot.files.find((file) => file.path === "many-lines.txt");
		const wide = snapshot.files.find((file) => file.path === "wide.txt");
		assertDefined(manyLines);
		assertDefined(wide);
		expect(manyLines.additions).toBe(FULL_FILE_MAX_LINES + 1);
		expect(manyLines.content).toEqual({ status: "too-large", lineCount: FULL_FILE_MAX_LINES + 1 });
		expect(wide.additions).toBe(1);
		expect(wide.content).toEqual({ status: "too-large", lineCount: 1 });
	});

	it("isolates unavailable new files and excludes ignored files", async () => {
		const path = repo("new-file-availability");
		writeFileSync(join(path, ".gitignore"), "ignored.txt\n");
		writeFileSync(join(path, "ignored.txt"), "ignored\n");
		writeFileSync(join(path, "ready.txt"), "ready\n");
		writeFileSync(join(path, "unreadable.txt"), "unreadable\n");
		chmodSync(join(path, "unreadable.txt"), 0);

		try {
			const snapshot = await Git.snapshot(path, "uncommitted");
			expect(snapshot.files.some((file) => file.path === "ignored.txt")).toBe(false);
			expect(snapshot.files.find((file) => file.path === "ready.txt")?.content.status).toBe("ready");
			expect(snapshot.files.find((file) => file.path === "unreadable.txt")?.content).toEqual({
				status: "unavailable",
			});
		} finally {
			chmodSync(join(path, "unreadable.txt"), 0o644);
		}
	});

	it("includes committed branch work in branch mode but not in uncommitted mode", async () => {
		const path = repo("branch");
		writeFileSync(join(path, "a.txt"), "base\n");
		git(path, "add", "a.txt");
		git(path, "commit", "-m", "base");

		git(path, "checkout", "-b", "feature");
		writeFileSync(join(path, "c.txt"), "feature\n");
		git(path, "add", "c.txt");
		git(path, "commit", "-m", "feature work");
		writeFileSync(join(path, "d.txt"), "wip\n");

		const branch = await Git.snapshot(path, "branch");
		expect(branch.files.find((file) => file.path === "c.txt")?.status).toBe("added");
		expect(branch.files.find((file) => file.path === "d.txt")?.status).toBe("untracked");

		const uncommitted = await Git.snapshot(path, "uncommitted");
		expect(uncommitted.files.some((file) => file.path === "c.txt")).toBe(false);
		expect(uncommitted.files.find((file) => file.path === "d.txt")?.status).toBe("untracked");
	});
});

describe("Git.fullFile", () => {
	it("classifies empty and binary files", async () => {
		const path = repo("full-file-non-text");
		writeFileSync(join(path, "empty.txt"), "");
		writeFileSync(join(path, "binary.bin"), Buffer.from([0, 1, 2]));

		expect(await Git.fullFile({ path, file: "empty.txt", mode: "uncommitted" })).toEqual({ status: "empty" });
		expect(await Git.fullFile({ path, file: "binary.bin", mode: "uncommitted" })).toEqual({ status: "binary" });
	});

	it("returns normal tracked content with old and new line numbers", async () => {
		const path = repo("full-file");
		writeFileSync(join(path, "tracked.txt"), "one\ntwo\nthree\n");
		git(path, "add", "tracked.txt");
		git(path, "commit", "-m", "init");
		writeFileSync(join(path, "tracked.txt"), "one\nTWO\nthree\n");

		const fullFile = await Git.fullFile({ path, file: "tracked.txt", mode: "uncommitted" });

		expect(fullFile).toEqual({
			status: "ready",
			lines: [
				{ kind: "context", number: 1, oldNumber: 1, hunk: 1, content: "one" },
				{ kind: "remove", oldNumber: 2, hunk: 1, content: "two" },
				{ kind: "add", number: 2, hunk: 1, content: "TWO" },
				{ kind: "context", number: 3, oldNumber: 3, hunk: 1, content: "three" },
			],
		});
	});

	it("returns deleted content in uncommitted and branch modes", async () => {
		const path = repo("deleted-file");
		writeFileSync(join(path, "deleted.txt"), "one\ntwo\n");
		git(path, "add", "deleted.txt");
		git(path, "commit", "-m", "init");
		git(path, "checkout", "-b", "feature");
		unlinkSync(join(path, "deleted.txt"));
		git(path, "add", "deleted.txt");

		const uncommitted = await Git.fullFile({ path, file: "deleted.txt", mode: "uncommitted" });
		expect(uncommitted).toEqual({
			status: "ready",
			lines: [
				{ kind: "remove", oldNumber: 1, hunk: 1, content: "one" },
				{ kind: "remove", oldNumber: 2, hunk: 1, content: "two" },
			],
		});

		git(path, "commit", "-m", "delete file");

		const branch = await Git.fullFile({ path, file: "deleted.txt", mode: "branch" });
		expect(branch).toEqual(uncommitted);
	});

	it("rejects tracked files above the full-file line limit", async () => {
		const path = repo("large-tracked");
		writeFileSync(join(path, "tracked.txt"), "");
		git(path, "add", "tracked.txt");
		git(path, "commit", "-m", "init");
		writeFileSync(join(path, "tracked.txt"), numberedLines(FULL_FILE_MAX_LINES + 1));

		const fullFile = await Git.fullFile({ path, file: "tracked.txt", mode: "uncommitted" });

		expect(fullFile).toEqual({ status: "too-large", lineCount: FULL_FILE_MAX_LINES + 1 });
	});

	it("rejects untracked files above the full-file line limit", async () => {
		const path = repo("large-untracked");
		writeFileSync(join(path, "untracked.txt"), numberedLines(FULL_FILE_MAX_LINES + 1));

		const fullFile = await Git.fullFile({ path, file: "untracked.txt", mode: "uncommitted" });

		expect(fullFile).toEqual({ status: "too-large", lineCount: FULL_FILE_MAX_LINES + 1 });
	});

	it("returns too-large without a count when git output exceeds the buffer", async () => {
		const path = repo("wide-line");
		writeFileSync(join(path, "wide.txt"), "x".repeat(GIT_OUTPUT_MAX_BYTES + 1));

		const fullFile = await Git.fullFile({ path, file: "wide.txt", mode: "uncommitted" });

		expect(fullFile).toEqual({ status: "too-large" });
	});

	it("rejects paths outside the repository", () => {
		const path = repo("path-traversal");
		const outside = join(path, "..", "path-traversal-outside");
		mkdirSync(outside);
		writeFileSync(join(outside, "secret.txt"), "secret\n");
		symlinkSync(outside, join(path, "link"), "dir");

		expect(() => Git.fullFile({ path, file: "../outside.txt", mode: "uncommitted" })).toThrow(
			"File path must stay within the repository root",
		);
		expect(() => Git.fullFile({ path, file: join(path, "inside.txt"), mode: "uncommitted" })).toThrow(
			"File path must be relative to the repository root",
		);
		expect(() => Git.fullFile({ path, file: "link/secret.txt", mode: "uncommitted" })).toThrow(
			"File path must stay within the repository root",
		);
	});
});
