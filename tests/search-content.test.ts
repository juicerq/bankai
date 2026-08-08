import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { searchResultsSchema } from "@shared/review";
import { GitRun } from "@main/git/git-run";
import { SearchContent } from "@main/git/search-content";
import { assertDefined } from "./utils/assertions";

function repo(name: string): string {
	assertDefined(process.env.DATA_DIR);
	const path = join(process.env.DATA_DIR, name);
	mkdirSync(path);
	execFileSync("git", ["init", "-q", "-b", "main"], { cwd: path });
	execFileSync("git", ["config", "user.email", "test@bankai.dev"], { cwd: path });
	execFileSync("git", ["config", "user.name", "Bankai"], { cwd: path });

	return path;
}

describe("SearchContent.run", () => {
	it("returns the file, the line number and the text of every matching line", async () => {
		const path = repo("search-basic");
		writeFileSync(join(path, "alpha.ts"), "const alpha = 1\nconst beta = 2\nalpha again\n");
		mkdirSync(join(path, "nested"));
		writeFileSync(join(path, "nested", "gamma.ts"), "no match here\n");

		expect(await SearchContent.run({ path, query: "alpha" })).toEqual({
			matches: [
				{ file: "alpha.ts", line: 1, text: "const alpha = 1" },
				{ file: "alpha.ts", line: 3, text: "alpha again" },
			],
			truncated: false,
		});
	});

	it("reports no match as an empty result instead of an error", async () => {
		const path = repo("search-none");
		writeFileSync(join(path, "alpha.ts"), "const alpha = 1\n");

		expect(await SearchContent.run({ path, query: "nowhere-to-be-found" })).toEqual({
			matches: [],
			truncated: false,
		});
	});

	it("keeps an empty query from reaching git", async () => {
		const path = repo("search-empty-query");
		writeFileSync(join(path, "alpha.ts"), "const alpha = 1\n");

		expect(await SearchContent.run({ path, query: "" })).toEqual({ matches: [], truncated: false });
	});

	it("stops at the global cap and declares the result truncated", async () => {
		const path = repo("search-capped");
		const overflow = SearchContent.MAX_MATCHES + 50;
		writeFileSync(join(path, "many.txt"), `${Array.from({ length: overflow }, () => "needle").join("\n")}\n`);

		const results = await SearchContent.run({ path, query: "needle" });

		expect(results.truncated).toBe(true);
		expect(results.matches).toHaveLength(SearchContent.MAX_MATCHES);
	});

	it("keeps a result that exactly fills the cap untruncated", async () => {
		const path = repo("search-exact-cap");
		const lines = Array.from({ length: SearchContent.MAX_MATCHES }, () => "needle").join("\n");
		writeFileSync(join(path, "many.txt"), `${lines}\n`);

		const results = await SearchContent.run({ path, query: "needle" });

		expect(results.matches).toHaveLength(SearchContent.MAX_MATCHES);
		expect(results.truncated).toBe(false);
	});

	it("reads a file whose name contains the separator of the plain format", async () => {
		const path = repo("search-colon");
		writeFileSync(join(path, "we:ird:name.txt"), "needle here\n");

		expect(await SearchContent.run({ path, query: "needle" })).toEqual({
			matches: [{ file: "we:ird:name.txt", line: 1, text: "needle here" }],
			truncated: false,
		});
	});

	it("treats a query that starts with a dash as text, not as a flag", async () => {
		const path = repo("search-dash");
		writeFileSync(join(path, "flags.txt"), "keep --untracked here\n");

		expect(await SearchContent.run({ path, query: "--untracked" })).toEqual({
			matches: [{ file: "flags.txt", line: 1, text: "keep --untracked here" }],
			truncated: false,
		});
	});

	it("searches for the query literally instead of as a regular expression", async () => {
		const path = repo("search-literal");
		writeFileSync(join(path, "dots.txt"), "alpha\na.pha\n");

		expect(await SearchContent.run({ path, query: "a.pha" })).toEqual({
			matches: [{ file: "dots.txt", line: 2, text: "a.pha" }],
			truncated: false,
		});
	});

	it("ignores case when the query carries no capital letter", async () => {
		const path = repo("search-smart-lower");
		writeFileSync(join(path, "tree.ts"), "class FileTree {}\nconst filetree = 1\n");

		expect(await SearchContent.run({ path, query: "filetree" })).toEqual({
			matches: [
				{ file: "tree.ts", line: 1, text: "class FileTree {}" },
				{ file: "tree.ts", line: 2, text: "const filetree = 1" },
			],
			truncated: false,
		});
	});

	it("respects case when the query carries a capital letter", async () => {
		const path = repo("search-smart-upper");
		writeFileSync(join(path, "tree.ts"), "class FileTree {}\nconst filetree = 1\n");

		expect(await SearchContent.run({ path, query: "FileTree" })).toEqual({
			matches: [{ file: "tree.ts", line: 1, text: "class FileTree {}" }],
			truncated: false,
		});
	});

	it("searches a query that holds no letter at all", async () => {
		const path = repo("search-smart-letterless");
		writeFileSync(join(path, "arrow.ts"), "const port = 123\nlet a = b --> c\n");

		expect(await SearchContent.run({ path, query: "123" })).toEqual({
			matches: [{ file: "arrow.ts", line: 1, text: "const port = 123" }],
			truncated: false,
		});
		expect(await SearchContent.run({ path, query: "-->" })).toEqual({
			matches: [{ file: "arrow.ts", line: 2, text: "let a = b --> c" }],
			truncated: false,
		});
	});

	it("produces a result the worker protocol accepts", async () => {
		const path = repo("search-protocol");
		writeFileSync(join(path, "alpha.ts"), "const alpha = 1\n");

		const results = await SearchContent.run({ path, query: "alpha" });

		expect(searchResultsSchema.assert(results)).toEqual(results);
	});

	it("outlives the timeout that would kill a plain git call", () => {
		expect(SearchContent.SEARCH_TIMEOUT_MS).toBeGreaterThan(GitRun.GIT_TIMEOUT_MS);
	});
});
