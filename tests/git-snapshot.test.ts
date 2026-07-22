import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { type ReviewContent } from "@main/git/contracts";
import { FULL_FILE_MAX_LINES, GIT_OUTPUT_MAX_BYTES, Git } from "@main/git/Git";
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

describe("Git.snapshot", () => {
	it("reports a non-git directory as not a repository", async () => {
		assertDefined(process.env.DATA_DIR);
		const plain = join(process.env.DATA_DIR, "plain");
		mkdirSync(plain);

		const snapshot = await Git.snapshot(plain, "uncommitted");

		expect(snapshot).toEqual({ isRepo: false, files: [], totals: { additions: 0, deletions: 0, files: 0 } });
	});

	it("returns only metadata while loading an untracked file on demand", async () => {
		const path = repo("lazy-untracked");
		writeFileSync(join(path, "fresh.txt"), "hello\n");

		const snapshot = await Git.snapshot(path, "uncommitted");
		const fresh = snapshot.files.find((file) => file.path === "fresh.txt");
		assertDefined(fresh);
		expect(fresh).toEqual({ path: "fresh.txt", status: "untracked", additions: 1, deletions: 0 });
		expect("content" in fresh).toBe(false);

		const content = await Git.file({ path, file: fresh.path, mode: "uncommitted" });
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

		const snapshot = await Git.snapshot(path, "uncommitted");

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

		const lines = readyLines(await Git.file({ path, file: "lines.txt", mode: "uncommitted" }));

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
			expect(await Git.file({ path, file: "missing.txt", mode })).toEqual({ status: "unavailable" });
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

		const snapshot = await Git.snapshot(path, "uncommitted");

		expect(snapshot.files.find((file) => file.path === "new.bin")?.additions).toBe(0);
		expect(await Git.file({ path, file: "tracked.bin", mode: "uncommitted" })).toEqual({ status: "binary" });
		expect(await Git.file({ path, file: "new.bin", mode: "uncommitted" })).toEqual({ status: "binary" });
		expect(await Git.file({ path, file: "empty.txt", mode: "uncommitted" })).toEqual({ status: "empty" });
	});

	it("counts large new files without including their content in the snapshot", async () => {
		const path = repo("large-new-snapshot");
		writeFileSync(join(path, "many-lines.txt"), numberedLines(FULL_FILE_MAX_LINES + 1));
		writeFileSync(join(path, "wide.txt"), "x".repeat(GIT_OUTPUT_MAX_BYTES + 1));

		const snapshot = await Git.snapshot(path, "uncommitted");
		expect(snapshot.files.find((file) => file.path === "many-lines.txt")?.additions).toBe(FULL_FILE_MAX_LINES + 1);
		expect(snapshot.files.find((file) => file.path === "wide.txt")?.additions).toBe(1);
		expect(await Git.file({ path, file: "many-lines.txt", mode: "uncommitted" })).toEqual({
			status: "too-large",
			lineCount: FULL_FILE_MAX_LINES + 1,
		});
		expect(await Git.file({ path, file: "wide.txt", mode: "uncommitted" })).toEqual({ status: "too-large" });
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
			expect(snapshot.files.find((file) => file.path === "ready.txt")?.additions).toBe(1);
			expect(snapshot.files.find((file) => file.path === "unreadable.txt")?.additions).toBe(0);
			expect(await Git.file({ path, file: "unreadable.txt", mode: "uncommitted" })).toEqual({
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

		const snapshot = await Git.snapshot(path, "uncommitted");

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

	it("returns tracked content with unchanged context", async () => {
		const path = repo("full-file");
		writeFileSync(join(path, "tracked.txt"), "one\ntwo\nthree\n");
		git(path, "add", "tracked.txt");
		git(path, "commit", "-m", "init");
		writeFileSync(join(path, "tracked.txt"), "one\nTWO\nthree\n");

		expect(await Git.fullFile({ path, file: "tracked.txt", mode: "uncommitted" })).toEqual({
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

		const uncommitted = await Git.fullFile({ path, file: "deleted.txt", mode: "uncommitted" });
		expect(uncommitted).toEqual({
			status: "ready",
			lines: [
				{ kind: "remove", oldNumber: 1, hunk: 1, content: "one" },
				{ kind: "remove", oldNumber: 2, hunk: 1, content: "two" },
			],
		});

		git(path, "commit", "-m", "delete file");
		expect(await Git.fullFile({ path, file: "deleted.txt", mode: "branch" })).toEqual(uncommitted);
	});

	it("limits tracked and untracked full files", async () => {
		const path = repo("large-files");
		writeFileSync(join(path, "tracked.txt"), "");
		git(path, "add", "tracked.txt");
		git(path, "commit", "-m", "init");
		writeFileSync(join(path, "tracked.txt"), numberedLines(FULL_FILE_MAX_LINES + 1));
		writeFileSync(join(path, "untracked.txt"), numberedLines(FULL_FILE_MAX_LINES + 1));

		const expected = { status: "too-large", lineCount: FULL_FILE_MAX_LINES + 1 } as const;
		expect(await Git.fullFile({ path, file: "tracked.txt", mode: "uncommitted" })).toEqual(expected);
		expect(await Git.fullFile({ path, file: "untracked.txt", mode: "uncommitted" })).toEqual(expected);
	});

	it("returns too-large without a count when git output exceeds the buffer", async () => {
		const path = repo("wide-line");
		writeFileSync(join(path, "wide.txt"), "x".repeat(GIT_OUTPUT_MAX_BYTES + 1));

		expect(await Git.fullFile({ path, file: "wide.txt", mode: "uncommitted" })).toEqual({ status: "too-large" });
	});

	it("rejects paths outside the repository for both content reads", () => {
		const path = repo("path-traversal");
		const outside = join(path, "..", "path-traversal-outside");
		mkdirSync(outside);
		writeFileSync(join(outside, "secret.txt"), "secret\n");
		symlinkSync(outside, join(path, "link"), "dir");

		for (const read of [Git.file, Git.fullFile]) {
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
