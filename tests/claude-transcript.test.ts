import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { ClaudeTranscript } from "@main/agents/harness/claude/claude-transcript";

function userRecord(content: unknown, extra: Record<string, unknown> = {}): string {
	return JSON.stringify({ type: "user", message: { content }, ...extra });
}

describe("ClaudeTranscript.recordIntent", () => {
	it("reads a plain string message as the intent", () => {
		expect(ClaudeTranscript.recordIntent(userRecord("roda o app pra mim"))).toBe("roda o app pra mim");
	});

	it("reads the first text block of a block list", () => {
		expect(
			ClaudeTranscript.recordIntent(userRecord([{ type: "text", text: "quero decidir B" }, { type: "text", text: "e depois C" }])),
		).toBe("quero decidir B");
	});

	it("collapses whitespace and cuts a long message down to a title", () => {
		const long = "a".repeat(200);

		expect(ClaudeTranscript.recordIntent(userRecord(`linha um\n\n  linha dois`))).toBe("linha um linha dois");
		expect(ClaudeTranscript.recordIntent(userRecord(long))).toHaveLength(120);
	});

	it("skips every known noise family", () => {
		const noise = [
			"<local-command-caveat>ignore</local-command-caveat>",
			"<command-name>/wayfinder</command-name>",
			"<command-message>wayfinder</command-message>",
			"<command-args>map</command-args>",
			"<local-command-stdout>ok</local-command-stdout>",
			"<system-reminder>remember</system-reminder>",
			"<task-notification>done</task-notification>",
			'<skill name="investigate">',
			"Caveat: the messages below were generated",
			"Base directory for this skill: /home/jui/.claude/skills/x",
			"Another Claude session sent a message: hi",
			"The conversation history before this point was compacted into the following summary:",
			"This session is being continued from a previous conversation that ran out of context.",
			"[Request interrupted by user]",
			"[Image #1]",
			"   ",
		];

		for (const text of noise) {
			expect(ClaudeTranscript.recordIntent(userRecord(text))).toBeNull();
			expect(ClaudeTranscript.recordIntent(userRecord([{ type: "text", text }]))).toBeNull();
		}
	});

	it("ignores blocks that carry no user text", () => {
		expect(ClaudeTranscript.recordIntent(userRecord([{ type: "tool_result", content: "diff" }]))).toBeNull();
		expect(ClaudeTranscript.recordIntent(userRecord([{ type: "image", source: { data: "..." } }]))).toBeNull();
		expect(ClaudeTranscript.recordIntent(userRecord([{ type: "something-new-nobody-has-seen" }]))).toBeNull();
	});

	it("ignores records that are not a user's own message", () => {
		expect(ClaudeTranscript.recordIntent(JSON.stringify({ type: "assistant", message: { content: "hello" } }))).toBeNull();
		expect(ClaudeTranscript.recordIntent(userRecord("system note", { isMeta: true }))).toBeNull();
		expect(ClaudeTranscript.recordIntent("not json at all")).toBeNull();
		expect(ClaudeTranscript.recordIntent(JSON.stringify({ type: "user" }))).toBeNull();
	});

	it("takes the first real intent when a block list mixes noise with it", () => {
		expect(
			ClaudeTranscript.recordIntent(
				userRecord([
					{ type: "text", text: "<system-reminder>noise</system-reminder>" },
					{ type: "tool_result", content: "diff" },
					{ type: "text", text: "arruma o header" },
				]),
			),
		).toBe("arruma o header");
	});
});

describe("ClaudeTranscript.title", () => {
	let configDir: string | undefined;

	afterEach(() => {
		if (configDir) {
			rmSync(configDir, { recursive: true, force: true });
			configDir = undefined;
		}
		delete process.env.CLAUDE_CONFIG_DIR;
	});

	function transcript(ref: { sessionId: string; cwd: string }, lines: string[]): void {
		configDir = mkdtempSync(join(tmpdir(), "claude-config-"));
		process.env.CLAUDE_CONFIG_DIR = configDir;
		const path = ClaudeTranscript.path(ref);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, `${lines.join("\n")}\n`);
	}

	const REF = { sessionId: "8a8f0838-5ef9-40a6-bdef-706514079823", cwd: "/home/jui/projects/bankai" };

	it("slugs the working directory into the transcript's folder", () => {
		process.env.CLAUDE_CONFIG_DIR = "/config";

		expect(ClaudeTranscript.path(REF)).toBe(
			"/config/projects/-home-jui-projects-bankai/8a8f0838-5ef9-40a6-bdef-706514079823.jsonl",
		);
		expect(ClaudeTranscript.path({ ...REF, cwd: "/home/jui/app/.claude-worktrees/x" })).toContain(
			"-home-jui-app--claude-worktrees-x",
		);
	});

	it("stops at the first user message that is real intent", async () => {
		transcript(REF, [
			JSON.stringify({ type: "summary", summary: "old" }),
			userRecord("<command-name>/wayfinder</command-name>"),
			userRecord("vamos comecar a implementacao"),
			userRecord("a segunda mensagem"),
		]);

		expect(await ClaudeTranscript.title(REF)).toBe("vamos comecar a implementacao");
	});

	it("yields nothing for a transcript that is all noise", async () => {
		transcript(REF, [userRecord("<system-reminder>x</system-reminder>"), userRecord([{ type: "image" }])]);

		expect(await ClaudeTranscript.title(REF)).toBeNull();
	});

	it("yields nothing when the transcript does not exist", async () => {
		process.env.CLAUDE_CONFIG_DIR = join(tmpdir(), "claude-config-missing-xyz");

		expect(await ClaudeTranscript.title(REF)).toBeNull();
	});
});

describe("ClaudeTranscript.locate", () => {
	let configDir: string | undefined;

	afterEach(() => {
		if (configDir) {
			rmSync(configDir, { recursive: true, force: true });
			configDir = undefined;
		}
		delete process.env.CLAUDE_CONFIG_DIR;
	});

	function write(ref: { sessionId: string; cwd: string }, lines: string[]): string {
		const path = ClaudeTranscript.path(ref);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, `${lines.join("\n")}\n`);

		return path;
	}

	function freshConfigDir(): void {
		configDir = mkdtempSync(join(tmpdir(), "claude-config-"));
		process.env.CLAUDE_CONFIG_DIR = configDir;
	}

	it("returns the cwd-derived path when the transcript lives there", async () => {
		freshConfigDir();
		const ref = { sessionId: "11f0838a-5ef9-40a6-bdef-706514079823", cwd: "/home/jui/projects/bankai" };
		const path = write(ref, [userRecord("oi")]);

		expect(await ClaudeTranscript.locate(ref)).toBe(path);
	});

	it("finds the origin transcript of a session that entered a worktree", async () => {
		freshConfigDir();
		const sessionId = "22f0838a-5ef9-40a6-bdef-706514079823";
		const origin = write({ sessionId, cwd: "/home/jui/dogama/app" }, [userRecord("conserta o bug")]);
		const moved = { sessionId, cwd: "/tmp/claude-worktrees/app/fix-bug" };

		expect(await ClaudeTranscript.locate(moved)).toBe(origin);
		expect(await ClaudeTranscript.title(moved)).toBe("conserta o bug");
	});

	it("falls back to the cwd-derived path when no transcript exists anywhere", async () => {
		freshConfigDir();
		const ref = { sessionId: "33f0838a-5ef9-40a6-bdef-706514079823", cwd: "/tmp/claude-worktrees/app/fix-bug" };

		expect(await ClaudeTranscript.locate(ref)).toBe(ClaudeTranscript.path(ref));
	});
});
