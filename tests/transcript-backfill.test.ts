import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { HookEvent } from "@core/hooks/HookGateway";
import { ReviewModel } from "@core/review/ReviewModel";
import { backfillTurns, parseTranscript } from "@core/review/TranscriptBackfill";

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
		{ event: "UserPromptSubmit", sessionId: SID, prompt: "add a compound interest helper to finance.ts" },
		{ event: "PostToolUse", sessionId: SID, filePath: "/home/user/projects/demo/finance.ts", content: "export function compoundInterest(principal: number, rate: number) {\n  return principal * rate;\n}" },
		{ event: "UserPromptSubmit", sessionId: SID, prompt: "now bump the auto-compact window to 250k" },
		{ event: "PostToolUse", sessionId: SID, filePath: "/home/user/.claude/settings.json", oldString: '    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "180000",', newString: '    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "250000",', replaceAll: false },
	];
	for (const event of events) {
		model.apply(event);
	}

	return model.getTurns(SID);
}

const userLine = (content: unknown) =>
	JSON.stringify({ type: "user", message: { role: "user", content }, sessionId: SID });

const writeLine = (filePath: string, content: string) =>
	JSON.stringify({
		type: "assistant",
		message: {
			role: "assistant",
			content: [{ type: "tool_use", id: "t", name: "Write", input: { file_path: filePath, content } }],
		},
		sessionId: SID,
	});

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

	it("normalizes a slash command into its typed form and keeps its edits", () => {
		const transcript = [
			userLine(
				"<command-name>/to-tasks</command-name>\n<command-message>to-tasks</command-message>\n<command-args>fatia 1</command-args>",
			),
			writeLine("/grill/tasks/01.md", "task"),
		].join("\n");

		expect(parseTranscript(SID, transcript).map((t) => t.prompt)).toEqual(["/to-tasks fatia 1"]);
	});

	it("drops a command that edited nothing", () => {
		const transcript = [
			userLine("add helper"),
			writeLine("/a.ts", "x"),
			userLine("<command-name>/compact</command-name>\n<command-message>compact</command-message>"),
		].join("\n");

		expect(parseTranscript(SID, transcript).map((t) => t.prompt)).toEqual(["add helper"]);
	});

	it("keeps edits after command output and interrupts on the real turn", () => {
		const transcript = [
			userLine("add helper"),
			writeLine("/a.ts", "x"),
			userLine("<local-command-stdout>Compacted</local-command-stdout>"),
			userLine([{ type: "text", text: "[Request interrupted by user]" }]),
			writeLine("/b.ts", "y"),
		].join("\n");

		expect(parseTranscript(SID, transcript).map((t) => t.files.map((f) => f.path))).toEqual([
			["/a.ts", "/b.ts"],
		]);
	});

	it("drops a talk-only prompt without leaving a turn", () => {
		const transcript = [userLine("how does this work?"), userLine("thanks")].join("\n");

		expect(parseTranscript(SID, transcript)).toEqual([]);
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
