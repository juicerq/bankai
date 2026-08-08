import { expect, test } from "bun:test";
import { terminalFileLinks } from "@renderer/routes/-utils/terminal-file-links";

const PATHS = new Set(["src/a.ts", "README.md", "src/my file.ts", "src/we:ird.ts"]);

function linksOf(text: string, worktree?: string) {
	return terminalFileLinks({ text, paths: PATHS, worktree });
}

test("a path with a line number becomes a link that carries the line", () => {
	expect(linksOf("  at src/a.ts:12 in run")).toEqual([{ file: "src/a.ts", line: 12, start: 5, end: 16 }]);
});

test("a column after the line is dropped, because the reader opens a line", () => {
	expect(linksOf("src/a.ts:12:5")).toEqual([{ file: "src/a.ts", line: 12, start: 0, end: 13 }]);
});

test("a path relative to the shell and a path absolute inside the worktree reach the same file", () => {
	expect(linksOf("./src/a.ts:12")).toEqual([{ file: "src/a.ts", line: 12, start: 0, end: 13 }]);
	expect(linksOf("/w/src/a.ts:12", "/w")).toEqual([{ file: "src/a.ts", line: 12, start: 0, end: 14 }]);
});

test("an absolute path outside the worktree stays plain text", () => {
	expect(linksOf("/etc/src/a.ts:12", "/w")).toEqual([]);
});

test("a path with no line number becomes a link that opens the file at the top", () => {
	expect(linksOf("see README.md for more")).toEqual([{ file: "README.md", start: 4, end: 13 }]);
});

test("a path the worktree does not have stays plain text", () => {
	expect(linksOf("src/ghost.ts:12")).toEqual([]);
});

test("a URL with a port is not a file link", () => {
	expect(linksOf("serving on http://host:8080")).toEqual([]);
});

test("a clock time is not a file link", () => {
	expect(linksOf("done at 12:34:56")).toEqual([]);
});

test("a space in the file name still reaches the file, because the worktree list decides", () => {
	expect(linksOf("modified: src/my file.ts:12")).toEqual([{ file: "src/my file.ts", line: 12, start: 10, end: 27 }]);
});

test("a path wrapped in punctuation links the path and leaves the punctuation out", () => {
	expect(linksOf("at (src/a.ts:12)")).toEqual([{ file: "src/a.ts", line: 12, start: 4, end: 15 }]);
});

test("a colon in the file name survives, with and without a line number", () => {
	expect(linksOf("src/we:ird.ts")).toEqual([{ file: "src/we:ird.ts", start: 0, end: 13 }]);
	expect(linksOf("src/we:ird.ts:12")).toEqual([{ file: "src/we:ird.ts", line: 12, start: 0, end: 16 }]);
});
