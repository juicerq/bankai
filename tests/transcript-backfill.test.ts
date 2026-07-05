import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { HookEvent } from "@main/hooks/HookGateway";
import { ReviewModel } from "@main/review/ReviewModel";
import { backfillTurns, parseTranscript } from "@main/review/TranscriptBackfill";

const SID = "289b3a77-1628-4e96-8d9b-428fa7df8795";
const PROJECTS = join(import.meta.dirname, "fixtures", "projects");
const fixture = readFileSync(
	join(PROJECTS, "-home-user-projects-demo", `${SID}.jsonl`),
	"utf8",
);

// The same edits the fixture records, expressed as the live hook stream, so we can assert
// the parser yields turns identical to the path task 04 already covers.
function liveTurns() {
	const model = new ReviewModel();
	const events: HookEvent[] = [
		{ event: "UserPromptSubmit", sessionId: SID, prompt: "add a compound interest helper to finance.ts", raw: null },
		{ event: "PostToolUse", sessionId: SID, filePath: "/home/user/projects/demo/finance.ts", content: "export function compoundInterest(principal: number, rate: number) {\n  return principal * rate;\n}", raw: null },
		{ event: "UserPromptSubmit", sessionId: SID, prompt: "now bump the auto-compact window to 250k", raw: null },
		{ event: "PostToolUse", sessionId: SID, filePath: "/home/user/.claude/settings.json", oldString: '    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "180000",', newString: '    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "250000",', replaceAll: false, raw: null },
	];
	for (const event of events) {
		model.apply(event);
	}

	return model.getTurns(SID);
}

describe("TranscriptBackfill", () => {
	it("parses a real transcript into turns identical to the live hook path", () => {
		expect(parseTranscript(SID, fixture)).toEqual(liveTurns());
	});

	it("skips tool results, meta lines, and non-edit tool_use blocks", () => {
		const turns = parseTranscript(SID, fixture);
		expect(turns.map((t) => t.turnId)).toEqual([`${SID}:0`, `${SID}:1`]);
		expect(turns.map((t) => t.files.map((f) => f.path))).toEqual([
			["/home/user/projects/demo/finance.ts"],
			["/home/user/.claude/settings.json"],
		]);
	});

	it("tolerates malformed lines and unknown types without throwing", () => {
		expect(parseTranscript(SID, "not json\n{broken\n\n")).toEqual([]);
	});

	it("locates a session's transcript by the single UUID glob", async () => {
		expect(await backfillTurns(SID, PROJECTS)).toEqual(liveTurns());
	});

	it("returns no turns when the transcript does not exist yet", async () => {
		expect(await backfillTurns("00000000-0000-0000-0000-000000000000", PROJECTS)).toEqual([]);
	});
});
