import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TranscriptProjector } from "@core/review/TranscriptProjector";
import { assertDefined } from "./utils/assertions";
import { claudeTranscript, transcriptLine } from "./utils/transcripts";

describe("Claude Transcript projection", () => {
	it("rejects a malformed complete record", async () => {
		const session = { harness: "claude" as const, sessionId: "malformed" };
		const path = await claudeTranscript(session.sessionId);
		const fixture = await readFile(join(
			import.meta.dirname,
			"fixtures/projects/-home-user-projects-demo/289b3a77-1628-4e96-8d9b-428fa7df8795.jsonl",
		), "utf8");
		await writeFile(path, fixture);

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);

		expect(await projector.available(session)).toBe(false);
		expect(await projector.turns(session)).toEqual([]);
	});

	it("projects incrementally, ignores a partial tail, and resumes its byte offset", async () => {
		const session = { harness: "claude" as const, sessionId: "incremental" };
		const path = await claudeTranscript(session.sessionId);
		await appendFile(path,
			transcriptLine({ type: "user", message: { content: "change it" } })
			+ transcriptLine({
				type: "user",
				toolUseResult: {
					filePath: "/a.ts",
					content: "new",
					originalFile: "old",
				},
			})
			+ "{partial");

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);
		expect(await projector.turns(session)).toEqual([{
			turnId: "incremental:0",
			prompt: "change it",
			state: "active",
			files: [{ path: "/a.ts", before: ["old"], after: ["new"] }],
		}]);

		const content = (await readFile(path, "utf8")).replace("{partial", "");
		await writeFile(path, content + transcriptLine({
			type: "system",
			subtype: "turn_duration",
		}));
		await projector.refresh(session, true);
		expect((await projector.turns(session))[0]?.state).toBe("completed");

		const restarted = new TranscriptProjector();
		await restarted.refresh(session, false);
		expect(await restarted.turns(session)).toHaveLength(1);
	});

	it("rejects a recognizable file result without a complete snapshot", async () => {
		const session = { harness: "claude" as const, sessionId: "invalid-change" };
		const path = await claudeTranscript(session.sessionId);
		await appendFile(path,
			transcriptLine({ type: "user", message: { content: "change it" } })
			+ transcriptLine({
				type: "user",
				toolUseResult: { filePath: "/a.ts", content: "new" },
			}));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);

		expect(await projector.available(session)).toBe(false);
		expect(await projector.turns(session)).toEqual([]);
	});

	it("loads an active Session without interrupting its Turn", async () => {
		const session = { harness: "claude" as const, sessionId: "active-load" };
		const path = await claudeTranscript(session.sessionId);
		await appendFile(path,
			transcriptLine({ type: "user", message: { content: "change it" } })
			+ transcriptLine({
				type: "user",
				toolUseResult: {
					filePath: "/a.ts",
					content: "new",
					originalFile: "old",
				},
			}));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);
		await projector.load(session);

		expect((await projector.turns(session))[0]?.state).toBe("active");
	});

	it("folds repeated edits and confirms interruption", async () => {
		const session = { harness: "claude" as const, sessionId: "interrupted" };
		const path = await claudeTranscript(session.sessionId);
		await appendFile(path,
			transcriptLine({ type: "user", message: { content: "edit twice" } })
			+ transcriptLine({
				type: "user",
				toolUseResult: { filePath: "/a.ts", content: "middle", originalFile: "before" },
			})
			+ transcriptLine({
				type: "user",
				toolUseResult: { filePath: "/a.ts", content: "after", originalFile: "middle" },
			}));

		const projector = new TranscriptProjector();
		await projector.refresh(session, false);

		expect(await projector.turns(session)).toEqual([{
			turnId: "interrupted:0",
			prompt: "edit twice",
			state: "interrupted",
			files: [{ path: "/a.ts", before: ["before"], after: ["after"] }],
		}]);
	});

	it("marks a truncated Transcript unsafe", async () => {
		const session = { harness: "claude" as const, sessionId: "truncated" };
		const path = await claudeTranscript(session.sessionId);
		await appendFile(path,
			transcriptLine({ type: "user", message: { content: "change it" } })
			+ transcriptLine({
				type: "user",
				toolUseResult: { filePath: "/a.ts", content: "new", originalFile: "old" },
			}));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);
		await writeFile(path, "{}\n");
		await projector.refresh(session, true);

		expect(await projector.available(session)).toBe(false);
	});

	it("materializes a null-original edit chain from the file on disk", async () => {
		const session = { harness: "claude" as const, sessionId: "null-original" };
		const path = await claudeTranscript(session.sessionId);
		assertDefined(process.env.DATA_DIR);
		const changed = join(process.env.DATA_DIR, "large.ts");
		await writeFile(changed, "alpha\nthree\nomega");
		await appendFile(path,
			transcriptLine({ type: "user", message: { content: "edit a large file" } })
			+ transcriptLine({
				type: "user",
				toolUseResult: { filePath: changed, oldString: "one", newString: "two", originalFile: null, replaceAll: false },
			})
			+ transcriptLine({
				type: "user",
				toolUseResult: { filePath: changed, oldString: "two", newString: "three", originalFile: null, replaceAll: false },
			})
			+ transcriptLine({ type: "system", subtype: "turn_duration" }));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);

		expect(await projector.turns(session)).toEqual([{
			turnId: "null-original:0",
			prompt: "edit a large file",
			state: "completed",
			files: [{
				path: changed,
				before: ["alpha", "one", "omega"],
				after: ["alpha", "three", "omega"],
			}],
		}]);
	});

	it("anchors a null-original edit on a later full snapshot instead of the disk", async () => {
		const session = { harness: "claude" as const, sessionId: "anchored" };
		const path = await claudeTranscript(session.sessionId);
		assertDefined(process.env.DATA_DIR);
		const missing = join(process.env.DATA_DIR, "deleted-later.ts");
		await appendFile(path,
			transcriptLine({ type: "user", message: { content: "edit then rewrite" } })
			+ transcriptLine({
				type: "user",
				toolUseResult: { filePath: missing, oldString: "b", newString: "B", originalFile: null, replaceAll: false },
			})
			+ transcriptLine({
				type: "user",
				toolUseResult: { filePath: missing, content: "a\nB\nc", originalFile: "a\nB" },
			})
			+ transcriptLine({ type: "system", subtype: "turn_duration" }));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);

		expect(await projector.turns(session)).toEqual([{
			turnId: "anchored:0",
			prompt: "edit then rewrite",
			state: "completed",
			files: [{ path: missing, before: ["a", "b"], after: ["a", "B", "c"] }],
		}]);
	});

	it("reverses a replaceAll edit across every occurrence", async () => {
		const session = { harness: "claude" as const, sessionId: "replace-all" };
		const path = await claudeTranscript(session.sessionId);
		assertDefined(process.env.DATA_DIR);
		const changed = join(process.env.DATA_DIR, "replace-all.ts");
		await writeFile(changed, "log()\nmid\nlog()");
		await appendFile(path,
			transcriptLine({ type: "user", message: { content: "rename" } })
			+ transcriptLine({
				type: "user",
				toolUseResult: { filePath: changed, oldString: "x()", newString: "log()", originalFile: null, replaceAll: true },
			})
			+ transcriptLine({ type: "system", subtype: "turn_duration" }));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);

		expect(await projector.turns(session)).toEqual([{
			turnId: "replace-all:0",
			prompt: "rename",
			state: "completed",
			files: [{ path: changed, before: ["x()", "mid", "x()"], after: ["log()", "mid", "log()"] }],
		}]);
	});

	it("marks a Session unsafe when the file cannot confirm a null-original edit", async () => {
		const session = { harness: "claude" as const, sessionId: "unconfirmed" };
		const path = await claudeTranscript(session.sessionId);
		assertDefined(process.env.DATA_DIR);
		const changed = join(process.env.DATA_DIR, "diverged.ts");
		await writeFile(changed, "someone rewrote this later");
		await appendFile(path,
			transcriptLine({ type: "user", message: { content: "edit it" } })
			+ transcriptLine({
				type: "user",
				toolUseResult: { filePath: changed, oldString: "one", newString: "two", originalFile: null, replaceAll: false },
			}));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);

		expect(await projector.available(session)).toBe(false);
		expect(await projector.turns(session)).toEqual([]);
	});

	it("marks a Session unsafe when a reversal is ambiguous", async () => {
		const session = { harness: "claude" as const, sessionId: "ambiguous" };
		const path = await claudeTranscript(session.sessionId);
		assertDefined(process.env.DATA_DIR);
		const changed = join(process.env.DATA_DIR, "ambiguous.ts");
		await writeFile(changed, "aba");
		await appendFile(path,
			transcriptLine({ type: "user", message: { content: "edit it" } })
			+ transcriptLine({
				type: "user",
				toolUseResult: { filePath: changed, oldString: "c", newString: "a", originalFile: null, replaceAll: false },
			}));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);

		expect(await projector.available(session)).toBe(false);
	});

	it("does not materialize a prompt-only interaction", async () => {
		const session = { harness: "claude" as const, sessionId: "prompt-only" };
		const path = await claudeTranscript(session.sessionId);
		await appendFile(path,
			transcriptLine({ type: "user", message: { content: "explain" } })
			+ transcriptLine({ type: "system", subtype: "turn_duration" }));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);

		expect(await projector.turns(session)).toEqual([]);
	});
});
