import { expect, spyOn, test } from "bun:test";
import { TerminalFileLinks } from "@renderer/routes/-features/terminal/terminal-file-links";

const PATHS = ["src/a.ts", "README.md", "src/my file.ts", "src/we:ird.ts"];

function linksOf(text: string, worktree?: string) {
	return TerminalFileLinks.prepare({ paths: [...PATHS], worktree }).find(text);
}

function linksIn(paths: string[], text: string) {
	return TerminalFileLinks.prepare({ paths }).find(text);
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

test("a path split by a wrapped row rejoins across the newline and its indentation", () => {
	expect(linksOf("read src/a\n  .ts:65 now")).toEqual([{ file: "src/a.ts", line: 65, start: 5, end: 19 }]);
	expect(linksOf("read src/a\n.ts now")).toEqual([{ file: "src/a.ts", start: 5, end: 14 }]);
});

test("two words split by a plain space stay plain text", () => {
	expect(linksOf("read src/a .ts now")).toEqual([]);
});

test("a wrapped rejoin the worktree does not have stays plain text", () => {
	expect(linksOf("read src/gho\n  st.ts:12 now")).toEqual([]);
});

test("a unique file name inside a sentence links to its full path", () => {
	const text = "base (herdado do PR #1912, UserDetailsTriage.tsx) e o resto";

	expect(linksIn(["apps/front/src/UserDetailsTriage.tsx"], text)).toEqual([
		{
			file: "apps/front/src/UserDetailsTriage.tsx",
			start: text.indexOf("UserDetailsTriage.tsx"),
			end: text.indexOf(")"),
		},
	]);
});

test("a file name with a line number carries the line to its full path", () => {
	expect(linksIn(["apps/front/src/UserDetailsTriage.tsx"], "veja UserDetailsTriage.tsx:42 aqui")).toEqual([
		{ file: "apps/front/src/UserDetailsTriage.tsx", line: 42, start: 5, end: 29 },
	]);
});

test("a file name shared by two paths stays plain text", () => {
	expect(linksIn(["apps/UserBox/index.ts", "apps/OtherBox/index.ts"], "veja index.ts aqui")).toEqual([]);
});

test("a longer suffix picks one of the paths that share a file name", () => {
	expect(linksIn(["apps/UserBox/index.ts", "apps/OtherBox/index.ts"], "veja UserBox/index.ts aqui")).toEqual([
		{ file: "apps/UserBox/index.ts", start: 5, end: 21 },
	]);
});

test("a suffix that does not start at a folder boundary stays plain text", () => {
	expect(linksIn(["apps/UserBox/index.ts"], "veja Box/index.ts aqui")).toEqual([]);
});

test("an exact path wins over the same text as a suffix of another path", () => {
	expect(linksIn(["index.ts", "b/index.ts"], "veja index.ts aqui")).toEqual([
		{ file: "index.ts", start: 5, end: 13 },
	]);
});

test("impossible words stop at the longest external path before querying the catalog", () => {
	const detector = TerminalFileLinks.prepare({ paths: ["src/a.ts"] });
	const text = Array.from({ length: 1_200 }, () => "absent-x").join(" ");
	const queries = spyOn(Set.prototype, "has");

	try {
		expect(detector.find(text)).toEqual([]);
		expect(queries.mock.calls.length).toBe(1_200);
	} finally {
		queries.mockRestore();
	}
});
