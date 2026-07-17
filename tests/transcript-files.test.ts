import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFirstLine } from "@core/harness/transcriptFiles";
import { assertDefined } from "./utils/assertions";

function tempPath(name: string): string {
	assertDefined(process.env.DATA_DIR);
	return join(process.env.DATA_DIR, name);
}

describe("readFirstLine", () => {
	it("returns the first line without its newline", async () => {
		const path = tempPath("first.jsonl");
		await writeFile(path, "the meta line\nrest of the file\n");

		expect(await readFirstLine(path)).toBe("the meta line");
	});

	it("returns null when a first line exceeds the read cap", async () => {
		const path = tempPath("huge.jsonl");
		await writeFile(path, `${"x".repeat(64 * 1024 + 1)}\ntail\n`);

		expect(await readFirstLine(path)).toBeNull();
	});

	it("returns null for a missing file", async () => {
		expect(await readFirstLine(tempPath("nope.jsonl"))).toBeNull();
	});
});
