import { expect, test } from "bun:test";
import { TerminalFileLinks } from "@renderer/routes/-features/terminal/terminal-file-links";

const PATHS = new Set(["src/a.ts", "README.md", "src/my file.ts", "src/we:ird.ts"]);

function linksOf(text: string, worktree?: string) {
	return TerminalFileLinks.prepare({ paths: PATHS, worktree }).find(text);
}

test("a path with a line number becomes a link that carries the line", () => {
	expect(linksOf("  at src/a.ts:12 in run")).toEqual([{ file: "src/a.ts", line: 12, start: 5, end: 16 }]);
});

test("a column after the line is dropped because the reader opens a line", () => {
	expect(linksOf("src/a.ts:12:5")).toEqual([{ file: "src/a.ts", line: 12, start: 0, end: 13 }]);
});

test("relative and worktree-absolute paths reach the same file", () => {
	expect(linksOf("./src/a.ts:12")).toEqual([{ file: "src/a.ts", line: 12, start: 0, end: 13 }]);
	expect(linksOf("/worktree/src/a.ts:12", "/worktree")).toEqual([
		{ file: "src/a.ts", line: 12, start: 0, end: 21 },
	]);
});

test("Windows paths are normalized to the paths returned by the repository", () => {
	expect(linksOf("C:\\worktree\\src\\a.ts:12", "C:\\worktree")).toEqual([
		{ file: "src/a.ts", line: 12, start: 0, end: 23 },
	]);
	expect(linksOf(".\\src\\a.ts:12")).toEqual([{ file: "src/a.ts", line: 12, start: 0, end: 13 }]);
});

test("a path outside the worktree stays plain text", () => {
	expect(linksOf("/other/src/a.ts:12", "/worktree")).toEqual([]);
});

test("a path without a line opens the existing file at the top", () => {
	expect(linksOf("see README.md for more")).toEqual([{ file: "README.md", start: 4, end: 13 }]);
});

test("a path the worktree does not have stays plain text", () => {
	expect(linksOf("src/ghost.ts:12")).toEqual([]);
});

test("punctuation and spaces in existing paths are preserved", () => {
	expect(linksOf("modified: (src/my file.ts:12).")).toEqual([
		{ file: "src/my file.ts", line: 12, start: 11, end: 28 },
	]);
});

test("a colon in an existing file name is not mistaken for a line", () => {
	expect(linksOf("src/we:ird.ts")).toEqual([{ file: "src/we:ird.ts", start: 0, end: 13 }]);
	expect(linksOf("src/we:ird.ts:12")).toEqual([{ file: "src/we:ird.ts", line: 12, start: 0, end: 16 }]);
});

test("impossible words stop at the longest external path before querying the catalog", () => {
	class CountingPaths extends Set<string> {
		queries = 0;

		override has(path: string) {
			this.queries += 1;

			return super.has(path);
		}
	}

	const paths = new CountingPaths(["src/a.ts"]);
	const detector = TerminalFileLinks.prepare({ paths });
	const text = Array.from({ length: 1_200 }, () => "absent-x").join(" ");

	expect(detector.find(text)).toEqual([]);
	expect(paths.queries).toBe(1_200);
});
