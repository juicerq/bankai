import { execFileSync } from "node:child_process";
import { mkdirSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { BrowseFiles } from "@main/git/browse-files";
import { reviewContentSchema } from "@shared/review";
import { GitRun } from "@main/git/git-run";
import { ImageFile } from "@main/git/image-file";
import { ReviewBase } from "@main/git/review-base";
import { assertDefined } from "./utils/assertions";

const PNG_1X1 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const GIF_1X1 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

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

	it("lists files for a project outside Git", async () => {
		assertDefined(process.env.DATA_DIR);
		const plain = join(process.env.DATA_DIR, "plain");
		mkdirSync(plain);
		mkdirSync(join(plain, "src"));
		writeFileSync(join(plain, "README.md"), "Plain project\n");
		writeFileSync(join(plain, "src", "index.ts"), "export {};\n");

		expect(await BrowseFiles.list(plain)).toEqual(["README.md", "src/index.ts"]);
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

	it("opens a file far past the diff line ceiling with every line", async () => {
		const path = repo("read-many-lines");
		const count = ReviewBase.FULL_FILE_MAX_LINES * 10;
		writeFileSync(join(path, "huge.txt"), numberedLines(count));

		const lines = readyLines(await BrowseFiles.read({ path, file: "huge.txt" }));

		expect(lines).toHaveLength(count);
		expect(lines.at(-1)).toEqual({ kind: "context", number: count, hunk: 0, content: `line ${count}` });
	});

	it("never refuses a file within the byte ceiling for its line count alone", async () => {
		const path = repo("read-line-count");
		writeFileSync(join(path, "long.txt"), numberedLines(ReviewBase.FULL_FILE_MAX_LINES + 1));

		expect((await BrowseFiles.read({ path, file: "long.txt" })).status).toBe("ready");
	});

	it("refuses a file past the byte ceiling before reading its content", async () => {
		const path = repo("read-oversized");
		writeFileSync(join(path, "blob.bin"), "");
		truncateSync(join(path, "blob.bin"), GitRun.GIT_OUTPUT_MAX_BYTES + 1);

		expect(await BrowseFiles.read({ path, file: "blob.bin" })).toEqual({ status: "too-large" });
	});

	it("serves a PNG, a GIF and a JPEG as image content the caller can decode", async () => {
		const path = repo("read-images");
		const png = Buffer.from(PNG_1X1, "base64");
		const gif = Buffer.from(GIF_1X1, "base64");
		const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
		writeFileSync(join(path, "dot.png"), png);
		writeFileSync(join(path, "dot.gif"), gif);
		writeFileSync(join(path, "dot.jpg"), jpeg);

		expect(await BrowseFiles.read({ path, file: "dot.png" })).toEqual({
			status: "image",
			mime: "image/png",
			data: png.toString("base64"),
		});
		expect(await BrowseFiles.read({ path, file: "dot.gif" })).toEqual({
			status: "image",
			mime: "image/gif",
			data: gif.toString("base64"),
		});
		expect(await BrowseFiles.read({ path, file: "dot.jpg" })).toEqual({
			status: "image",
			mime: "image/jpeg",
			data: jpeg.toString("base64"),
		});
	});

	it("keeps a binary that is not an image on the binary status", async () => {
		const path = repo("read-nonimage-binary");
		writeFileSync(join(path, "clip.mp4"), Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x00]));

		expect(await BrowseFiles.read({ path, file: "clip.mp4" })).toEqual({ status: "binary" });
	});

	it("refuses an image past the image ceiling without reading its body", async () => {
		const path = repo("read-image-oversized");
		writeFileSync(join(path, "huge.png"), Buffer.from(PNG_1X1, "base64"));
		truncateSync(join(path, "huge.png"), ImageFile.MAX_BYTES + 1);

		expect(await BrowseFiles.read({ path, file: "huge.png" })).toEqual({ status: "too-large" });
	});

	it("refuses to serve a file as an image on the strength of its extension alone", async () => {
		const path = repo("read-png-liar");
		writeFileSync(join(path, "liar.png"), "this is plain text pretending to be a PNG\n");

		expect(await BrowseFiles.read({ path, file: "liar.png" })).toEqual({
			status: "ready",
			lines: [{ kind: "context", number: 1, hunk: 0, content: "this is plain text pretending to be a PNG" }],
		});
	});

	it("produces image content the review contract accepts", async () => {
		const path = repo("read-image-contract");
		writeFileSync(join(path, "dot.png"), Buffer.from(PNG_1X1, "base64"));

		const content = await BrowseFiles.read({ path, file: "dot.png" });

		expect(reviewContentSchema.assert(content)).toEqual(content);
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
