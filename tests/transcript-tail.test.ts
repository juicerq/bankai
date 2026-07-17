import { appendFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TranscriptTail } from "@core/harness/transcriptTail";
import { assertDefined } from "./utils/assertions";

function transcriptPath(): string {
	assertDefined(process.env.DATA_DIR);
	return join(process.env.DATA_DIR, "tail.jsonl");
}

describe("TranscriptTail", () => {
	it("reads only complete records from a byte offset", async () => {
		const path = transcriptPath();
		await writeFile(path, '{"text":"ação"}\n{"partial"');

		const first = await TranscriptTail.read(path, 0);
		expect(first).toMatchObject({
			state: "ready",
			content: '{"text":"ação"}\n',
			nextOffset: Buffer.byteLength('{"text":"ação"}\n'),
		});

		if (first.state !== "ready") {
			return;
		}

		await appendFile(path, ":true}\n");
		expect(await TranscriptTail.read(path, first.nextOffset, first.fileId)).toMatchObject({
			state: "ready",
			content: '{"partial":true}\n',
			nextOffset: Buffer.byteLength(
				'{"text":"ação"}\n{"partial":true}\n',
			),
		});
	});

	it("reports replacement instead of reading from an invalid offset", async () => {
		const path = transcriptPath();
		await writeFile(path, "short\n");

		expect(await TranscriptTail.read(path, 100)).toEqual({
			state: "replaced",
		});
	});

	it("detects a different file at the same path", async () => {
		const path = transcriptPath();
		await writeFile(path, "first\n");
		const first = await TranscriptTail.read(path, 0);
		if (first.state !== "ready") {
			throw new Error("expected the initial transcript read to succeed");
		}

		const replacement = `${path}.replacement`;
		await writeFile(replacement, "replacement\n");
		await rename(replacement, path);
		expect(await TranscriptTail.read(path, first.nextOffset, first.fileId)).toEqual({
			state: "replaced",
		});
	});
});
