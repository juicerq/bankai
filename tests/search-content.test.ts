import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { searchResultsSchema } from "@shared/review";
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

async function waitForFile(path: string): Promise<void> {
	while (!existsSync(path)) {
		await Bun.sleep(5);
	}
}

function useFakeGit(name: string, source: string) {
	assertDefined(process.env.DATA_DIR);
	assertDefined(process.env.PATH);
	const bin = join(process.env.DATA_DIR, `${name}-bin`);
	const pidFile = join(process.env.DATA_DIR, `${name}.pids`);
	const git = join(bin, "git");
	const originalPath = process.env.PATH;
	mkdirSync(bin);
	writeFileSync(git, `#!/usr/bin/env bun\n${source}`);
	chmodSync(git, 0o755);
	process.env.PATH = `${bin}:${originalPath}`;
	process.env.SEARCH_PID_FILE = pidFile;

	return {
		pidFile,
		restore: () => {
			process.env.PATH = originalPath;
			delete process.env.SEARCH_PID_FILE;
		},
	};
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
		const overflow = SearchContent.MAX_MATCHES + 1;
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

	it("produces a result the shared search contract accepts", async () => {
		const path = repo("search-contract");
		writeFileSync(join(path, "alpha.ts"), "const alpha = 1\n");

		const results = await SearchContent.run({ path, query: "alpha" });

		expect(searchResultsSchema.assert(results)).toEqual(results);
	});

	it("stops a search after thirty seconds", () => {
		expect(SearchContent.SEARCH_TIMEOUT_MS).toBe(30_000);
	});

	it("does not start git when the caller already canceled", async () => {
		const dataDir = process.env.DATA_DIR;
		assertDefined(dataDir);
		const fake = useFakeGit(
			"search-pre-aborted",
			`import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.SEARCH_PID_FILE, String(process.pid));\n`,
		);
		const controller = new AbortController();
		controller.abort(new Error("search superseded"));

		try {
			expect(() => SearchContent.run({ path: dataDir, query: "alpha", signal: controller.signal })).toThrow(
				"search superseded",
			);
			expect(existsSync(fake.pidFile)).toBe(false);
		} finally {
			fake.restore();
		}
	});

	it("kills an active git search and rejects without a partial result", async () => {
		const dataDir = process.env.DATA_DIR;
		assertDefined(dataDir);
		const fake = useFakeGit(
			"search-cancel",
			`import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.SEARCH_PID_FILE, String(process.pid));\nprocess.stdout.write("partial.ts\\0" + "1\\0partial match\\n");\nsetInterval(() => {}, 1000);\n`,
		);
		const controller = new AbortController();

		try {
			const search = SearchContent.run({ path: dataDir, query: "partial", signal: controller.signal });
			await waitForFile(fake.pidFile);
			const pid = Number(readFileSync(fake.pidFile, "utf8"));
			controller.abort(new Error("search superseded"));

			expect(() => search).toThrow("search superseded");
			expect(() => process.kill(pid, 0)).toThrow();
		} finally {
			controller.abort();
			fake.restore();
		}
	});

	it("stops after one mebibyte of output before retaining an incomplete line", async () => {
		const dataDir = process.env.DATA_DIR;
		assertDefined(dataDir);
		const fake = useFakeGit(
			"search-output",
			`import { writeFileSync } from "node:fs";\nwriteFileSync(process.env.SEARCH_PID_FILE, String(process.pid));\nprocess.stdout.write("x".repeat(1024 * 1024 + 1));\nsetInterval(() => {}, 1000);\n`,
		);

		try {
			const results = await SearchContent.run({ path: dataDir, query: "x" });
			const pid = Number(readFileSync(fake.pidFile, "utf8"));

			expect(SearchContent.MAX_OUTPUT_BYTES).toBe(1024 * 1024);
			expect(results).toEqual({ matches: [], truncated: true });
			expect(() => process.kill(pid, 0)).toThrow();
		} finally {
			fake.restore();
		}
	});

	it("leaves no git processes behind when searches repeatedly supersede each other", async () => {
		const dataDir = process.env.DATA_DIR;
		assertDefined(dataDir);
		const fake = useFakeGit(
			"search-superseded",
			`import { appendFileSync } from "node:fs";\nappendFileSync(process.env.SEARCH_PID_FILE, String(process.pid) + "\\n");\nsetInterval(() => {}, 1000);\n`,
		);
		const searches: Promise<unknown>[] = [];
		let previous: AbortController | undefined;

		try {
			for (let index = 0; index < 10; index++) {
				previous?.abort(new Error("search superseded"));
				const controller = new AbortController();
				searches.push(
					SearchContent.run({ path: dataDir, query: "needle", signal: controller.signal }).then(
						(value) => value,
						(err: unknown) => err,
					),
				);
				previous = controller;
				while (
					!existsSync(fake.pidFile) ||
					readFileSync(fake.pidFile, "utf8").trim().split("\n").length <= index
				) {
					await Bun.sleep(5);
				}
			}
			previous?.abort(new Error("search superseded"));
			const outcomes = await Promise.all(searches);
			const pids = readFileSync(fake.pidFile, "utf8").trim().split("\n").map(Number);

			expect(outcomes.every((outcome) => outcome instanceof Error)).toBe(true);
			expect(pids).toHaveLength(10);
			for (const pid of pids) {
				expect(() => process.kill(pid, 0)).toThrow();
			}
		} finally {
			previous?.abort();
			fake.restore();
		}
	});
});
