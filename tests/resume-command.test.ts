import { describe, expect, it } from "vitest";
import { buildFreshCommand, buildResumeCommand } from "@core/workspace/resumeCommand";

describe("Harness launch", () => {
	it("resumes Claude while retaining safe options", () => {
		expect(buildResumeCommand({
			session: { harness: "claude", sessionId: "sid" },
			argv: ["claude", "--dangerously-skip-permissions", "--resume", "old"],
			kind: "interactive",
		})).toBe("claude --dangerously-skip-permissions --resume sid");
	});

	it("resumes Codex through its native syntax", () => {
		expect(buildResumeCommand({ session: { harness: "codex", sessionId: "sid" } })).toBe("codex resume sid");
	});

	it("preserves safe Codex launch options without replaying resume selection", () => {
		const captured = {
			session: { harness: "codex" as const, sessionId: "sid" },
			argv: ["/usr/bin/codex", "--model", "gpt-5", "--search", "resume", "old"],
			kind: "interactive" as const,
		};
		expect(buildResumeCommand(captured)).toBe("/usr/bin/codex --model gpt-5 --search resume sid");
		expect(buildFreshCommand(captured)).toBe("/usr/bin/codex --model gpt-5 --search");
	});

	it("falls back to the shell for an unsafe Codex fresh launch", () => {
		expect(buildFreshCommand({
			session: { harness: "codex", sessionId: "sid" },
			argv: ["codex", "old prompt"],
			kind: "interactive",
		})).toBeNull();
	});

	it("starts the same Harness fresh", () => {
		expect(buildFreshCommand({ session: { harness: "claude", sessionId: "sid" }, kind: "interactive" })).toBe("claude");
		expect(buildFreshCommand({ session: { harness: "codex", sessionId: "sid" }, kind: "interactive" })).toBe("codex");
	});

	it("falls back to the shell for Claude internal helpers", () => {
		expect(buildFreshCommand({
			session: { harness: "claude", sessionId: "sid" },
			argv: ["claude", "--bg-pty-host", "/tmp/x.sock"],
			kind: "interactive",
		})).toBeNull();
	});
});
