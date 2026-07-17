import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TranscriptProjector } from "@core/review/TranscriptProjector";
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
