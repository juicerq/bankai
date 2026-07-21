import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { Git } from "@main/git/Git";
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
		expect(snapshot.files.find((file) => file.path === "fresh.txt")?.status).toBe("untracked");
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
		expect(edited.lines.some((line) => line.kind === "add" && line.content === "four" && line.number === 4)).toBe(true);

		const untracked = snapshot.files.find((file) => file.path === "b.txt");
		assertDefined(untracked);
		expect(untracked.status).toBe("untracked");
		expect(untracked.lines).toEqual([]);
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
