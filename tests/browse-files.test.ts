import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { BrowseFiles } from "@main/git/browse-files";
import { ReviewBase } from "@main/git/review-base";
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

function numberedLines(count: number): string {
	return `${Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n")}\n`;
}

function readyLines(content: Awaited<ReturnType<typeof BrowseFiles.read>>) {
	if (content.status !== "ready") {
		throw new Error(`Expected ready content, got ${content.status}`);
	}

	return content.lines;
}

describe("BrowseFiles.list", () => {
	it("keeps a loose ignored file and drops the contents of an ignored directory", async () => {
		const path = repo("ignored");
		writeFileSync(join(path, ".gitignore"), ".env\nnode_modules/\n");
		writeFileSync(join(path, ".env"), "SECRET=1\n");
		mkdirSync(join(path, "node_modules", "left-pad"), { recursive: true });
		writeFileSync(join(path, "node_modules", "left-pad", "index.js"), "module.exports = 1\n");

		expect(await BrowseFiles.list(path)).toEqual([".env", ".gitignore"]);
	});

	it("lists committed and untracked files once, sorted", async () => {
		const path = repo("mixed");
		writeFileSync(join(path, "committed.txt"), "one\n");
		execFileSync("git", ["add", "committed.txt"], { cwd: path });
		execFileSync("git", ["commit", "-qm", "first"], { cwd: path });
		writeFileSync(join(path, "committed.txt"), "one changed\n");
		mkdirSync(join(path, "src"));
		writeFileSync(join(path, "src", "fresh.ts"), "export const fresh = 1\n");

		expect(await BrowseFiles.list(path)).toEqual(["committed.txt", "src/fresh.ts"]);
	});

	it("reports no file for a directory outside Git", async () => {
		assertDefined(process.env.DATA_DIR);
		const plain = join(process.env.DATA_DIR, "plain");
		mkdirSync(plain);

		expect(await BrowseFiles.list(plain)).toEqual([]);
	});
});

describe("BrowseFiles.read", () => {
	it("numbers every line of an unchanged file as context", async () => {
		const path = repo("read-plain");
		writeFileSync(join(path, "notes.txt"), "first\nsecond\n");

		expect(readyLines(await BrowseFiles.read({ path, file: "notes.txt" }))).toEqual([
			{ kind: "context", number: 1, hunk: 0, content: "first" },
			{ kind: "context", number: 2, hunk: 0, content: "second" },
		]);
	});

	it("keeps the last line of a file that ends without a newline", async () => {
		const path = repo("read-no-newline");
		writeFileSync(join(path, "notes.txt"), "only");

		expect(readyLines(await BrowseFiles.read({ path, file: "notes.txt" }))).toEqual([
			{ kind: "context", number: 1, hunk: 0, content: "only" },
		]);
	});

	it("reports an empty file", async () => {
		const path = repo("read-empty");
		writeFileSync(join(path, "empty.txt"), "");

		expect(await BrowseFiles.read({ path, file: "empty.txt" })).toEqual({ status: "empty" });
	});

	it("reports binary content instead of reading it", async () => {
		const path = repo("read-binary");
		writeFileSync(join(path, "image.bin"), Buffer.from([0x89, 0x50, 0x00, 0x4e, 0x47]));

		expect(await BrowseFiles.read({ path, file: "image.bin" })).toEqual({ status: "binary" });
	});

	it("reports a file past the full-read limit with its line count", async () => {
		const path = repo("read-large");
		writeFileSync(join(path, "huge.txt"), numberedLines(ReviewBase.FULL_FILE_MAX_LINES + 1));

		expect(await BrowseFiles.read({ path, file: "huge.txt" })).toEqual({
			status: "too-large",
			lineCount: ReviewBase.FULL_FILE_MAX_LINES + 1,
		});
	});

	it("reports a missing file as unavailable", async () => {
		const path = repo("read-missing");

		expect(await BrowseFiles.read({ path, file: "gone.txt" })).toEqual({ status: "unavailable" });
	});

	it("refuses a path that leaves the repository", async () => {
		const path = repo("read-escape");

		expect(() => BrowseFiles.read({ path, file: "../outside.txt" })).toThrow(
			"File path must stay within the repository root",
		);
	});
});
