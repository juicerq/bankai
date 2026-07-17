import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TranscriptProjector } from "@core/review/TranscriptProjector";
import { assertDefined } from "./utils/assertions";
import { codexTranscript, transcriptLine } from "./utils/transcripts";

describe("Codex Transcript projection", () => {
	it("projects task messages and verified structured patches", async () => {
		const session = { harness: "codex" as const, sessionId: "codex-session" };
		const path = await codexTranscript(session.sessionId);
		assertDefined(process.env.DATA_DIR);
		const changed = join(process.env.DATA_DIR, "a.ts");
		const context = ["two", "three", "four", "five", "six", "seven", "eight", "nine"];
		await writeFile(changed, ["new", ...context, "right"].join("\n"));
		const fixture = await readFile(join(
			import.meta.dirname,
			"fixtures/transcripts/codex.jsonl",
		), "utf8");
		await writeFile(path, fixture.replace("$PATH", changed));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);

		expect(await projector.turns(session)).toEqual([{
			turnId: "codex-session:0",
			prompt: "update it",
			state: "completed",
			files: [{
				path: changed,
				before: ["old", ...context, "left"],
				after: ["new", ...context, "right"],
			}],
		}]);
	});

	it("does not partially import an unobserved stopped Session", async () => {
		const session = { harness: "codex" as const, sessionId: "historical" };
		await codexTranscript(session.sessionId);
		const projector = new TranscriptProjector();

		await projector.refresh(session, false);
		await projector.refresh(session, false);

		expect(await projector.turns(session)).toEqual([]);
	});

	it("rejects a patch not confirmed by the materialized file", async () => {
		const session = { harness: "codex" as const, sessionId: "unsafe" };
		const path = await codexTranscript(session.sessionId);
		assertDefined(process.env.DATA_DIR);
		const changed = join(process.env.DATA_DIR, "unsafe.ts");
		await writeFile(changed, "someone changed this later");
		await appendFile(path,
			transcriptLine({ type: "event_msg", payload: { type: "user_message", message: "update" } })
			+ transcriptLine({
				type: "event_msg",
				payload: {
					type: "patch_apply_end",
					success: true,
					changes: {
						[changed]: {
							type: "update",
							unified_diff: "@@ -1 +1 @@\n-old\n+new\n",
						},
					},
				},
			}));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);

		expect(await projector.available(session)).toBe(false);
	});

	it("rejects malformed and unconfirmed patch results", async () => {
		const malformed = { harness: "codex" as const, sessionId: "malformed" };
		const malformedPath = await codexTranscript(malformed.sessionId);
		await appendFile(malformedPath, transcriptLine({
			type: "event_msg",
			payload: { type: "patch_apply_end", success: true },
		}));

		const projector = new TranscriptProjector();
		await projector.refresh(malformed, true);
		expect(await projector.available(malformed)).toBe(false);

		const unconfirmed = { harness: "codex" as const, sessionId: "unconfirmed" };
		const unconfirmedPath = await codexTranscript(unconfirmed.sessionId);
		await appendFile(unconfirmedPath, transcriptLine({
			type: "event_msg",
			payload: { type: "patch_apply_end", changes: {} },
		}));
		await projector.refresh(unconfirmed, true);
		expect(await projector.available(unconfirmed)).toBe(false);
	});

	it("does not materialize a prompt-only interaction", async () => {
		const session = { harness: "codex" as const, sessionId: "prompt-only" };
		const path = await codexTranscript(session.sessionId);
		await appendFile(path,
			transcriptLine({
				type: "event_msg",
				payload: { type: "user_message", message: "explain" },
			})
			+ transcriptLine({
				type: "event_msg",
				payload: { type: "task_complete" },
			}));

		const projector = new TranscriptProjector();
		await projector.refresh(session, true);

		expect(await projector.turns(session)).toEqual([]);
	});
});
