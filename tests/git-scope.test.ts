import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type GitScope, type GitScopeResult, gitScopeChanges } from "@core/git/gitScope";
import type { FileChange } from "@core/review/FileChange";

let dir: string;

function okFiles(result: GitScopeResult): FileChange[] {
	expect(result.status).toBe("ok");
	if (result.status !== "ok") {
		throw new Error("expected ok result");
	}
	return result.files;
}

function git(...args: string[]): void {
	execFileSync("git", args, { cwd: dir });
}

function write(path: string, content: string): void {
	writeFileSync(join(dir, path), content);
}

function initRepo(): void {
	git("init", "-q", "-b", "main");
	git("config", "user.name", "Test");
	git("config", "user.email", "test@example.com");
}

function commitAll(message: string): void {
	git("add", "-A");
	git("commit", "-q", "-m", message);
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "bankai-gitscope-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("gitScopeChanges uncommitted", () => {
	it("reports modified, untracked, deleted, and staged files with full content", async () => {
		initRepo();
		write("keep.ts", "one\ntwo\n");
		write("gone.ts", "old\n");
		commitAll("base");

		write("keep.ts", "one\ntwo\nthree\n");
		write("fresh.ts", "brand\nnew\n");
		rmSync(join(dir, "gone.ts"));
		write("staged.ts", "queued\n");
		git("add", "staged.ts");

		const files = okFiles(await gitScopeChanges({ dir, scope: "uncommitted" }));
		const byPath = new Map(files.map((file) => [file.path, file]));
		expect([...byPath.keys()].sort()).toEqual(["fresh.ts", "gone.ts", "keep.ts", "staged.ts"]);

		expect(byPath.get("keep.ts")).toEqual({
			path: "keep.ts",
			before: ["one", "two", ""],
			after: ["one", "two", "three", ""],
		});
		expect(byPath.get("fresh.ts")).toEqual({ path: "fresh.ts", before: [], after: ["brand", "new", ""] });
		expect(byPath.get("gone.ts")).toEqual({ path: "gone.ts", before: ["old", ""], after: [] });
		expect(byPath.get("staged.ts")).toEqual({ path: "staged.ts", before: [], after: ["queued", ""] });
	});

	it("returns ok with an empty list when nothing changed", async () => {
		initRepo();
		write("a.ts", "x\n");
		commitAll("base");

		const result = await gitScopeChanges({ dir, scope: "uncommitted" });
		expect(result).toEqual({ status: "ok", files: [] });
	});
});

describe("gitScopeChanges branch", () => {
	it("includes feature commits since merge-base plus uncommitted edits", async () => {
		initRepo();
		write("base.ts", "root\n");
		commitAll("root");

		git("checkout", "-q", "-b", "feature");
		write("committed.ts", "from\nfeature\n");
		commitAll("feature commit");
		write("dirty.ts", "uncommitted\n");

		const files = okFiles(await gitScopeChanges({ dir, scope: "branch" }));
		const paths = files.map((file) => file.path).sort();
		expect(paths).toEqual(["committed.ts", "dirty.ts"]);
		expect(paths).not.toContain("base.ts");
	});

	it("degrades to uncommitted semantics when HEAD is the default branch", async () => {
		initRepo();
		write("base.ts", "root\n");
		commitAll("root");

		write("only.ts", "working\ntree\n");

		const files = okFiles(await gitScopeChanges({ dir, scope: "branch" }));
		expect(files.map((file) => file.path)).toEqual(["only.ts"]);
	});

	it("detects the default branch from a local master without a remote", async () => {
		git("init", "-q", "-b", "master");
		git("config", "user.name", "Test");
		git("config", "user.email", "test@example.com");
		write("base.ts", "root\n");
		commitAll("root");

		git("checkout", "-q", "-b", "topic");
		write("added.ts", "on\ntopic\n");
		commitAll("topic commit");

		const files = okFiles(await gitScopeChanges({ dir, scope: "branch" }));
		expect(files.map((file) => file.path)).toEqual(["added.ts"]);
	});
});

describe("gitScopeChanges edge states", () => {
	it("returns unavailable for a non-repo directory under either scope", async () => {
		const scopes: GitScope[] = ["uncommitted", "branch"];
		for (const scope of scopes) {
			expect(await gitScopeChanges({ dir, scope })).toEqual({ status: "unavailable" });
		}
	});

	it("lists untracked files as new on a fresh repo without commits", async () => {
		initRepo();
		write("pending.ts", "not\ncommitted\n");

		const files = okFiles(await gitScopeChanges({ dir, scope: "uncommitted" }));
		expect(files).toEqual([{ path: "pending.ts", before: [], after: ["not", "committed", ""] }]);
	});
});
