import { describe, expect, it } from "vitest";
import { buildFreshCommand, buildResumeCommand } from "@core/workspace/resumeCommand";

describe("buildResumeCommand", () => {
	it("replays a clean interactive argv with a normalized --resume, keeping flags", () => {
		const command = buildResumeCommand({
			sessionId: "sid-1",
			argv: ["claude", "--dangerously-skip-permissions"],
			kind: "interactive",
		});

		expect(command).toBe("claude --dangerously-skip-permissions --resume sid-1");
	});

	it("keeps an absolute claude path (accepted by basename) and appends --resume", () => {
		const command = buildResumeCommand({
			sessionId: "sid-2",
			argv: ["/usr/local/bin/claude", "--model", "opus"],
			kind: "interactive",
		});

		expect(command).toBe("/usr/local/bin/claude --model opus --resume sid-2");
	});

	it("falls back to bare resume when the cmdline was never captured", () => {
		const command = buildResumeCommand({ sessionId: "sid-3", kind: "interactive" });

		expect(command).toBe("claude --resume sid-3");
	});

	it("falls back to bare resume for a bg session even with a claude-looking argv", () => {
		const command = buildResumeCommand({
			sessionId: "sid-4",
			argv: ["claude", "--dangerously-skip-permissions"],
			kind: "bg",
		});

		expect(command).toBe("claude --resume sid-4");
	});

	it("falls back to bare resume when the first token is not claude", () => {
		const command = buildResumeCommand({
			sessionId: "sid-5",
			argv: ["node", "claude", "--resume", "x"],
			kind: "interactive",
		});

		expect(command).toBe("claude --resume sid-5");
	});

	it("falls back to bare resume on the --bg-pty-host marker", () => {
		const command = buildResumeCommand({
			sessionId: "sid-6",
			argv: ["claude", "--bg-pty-host", "/tmp/cc/pty/x.sock", "177", "47"],
		});

		expect(command).toBe("claude --resume sid-6");
	});

	it("falls back to bare resume on an internal fork-session invocation", () => {
		const command = buildResumeCommand({
			sessionId: "sid-7",
			argv: [
				"/home/me/.bun/claude",
				"--session-id",
				"19cf",
				"--fork-session",
				"--resume",
				"/home/me/.claude/projects/x/6ed.jsonl",
				"--permission-mode",
				"bypassPermissions",
			],
			kind: "interactive",
		});

		expect(command).toBe("claude --resume sid-7");
	});

	it("falls back to bare resume when --resume points at a .jsonl transcript", () => {
		const command = buildResumeCommand({
			sessionId: "sid-8",
			argv: ["claude", "--resume", "/home/me/.claude/projects/x/abc.jsonl"],
			kind: "interactive",
		});

		expect(command).toBe("claude --resume sid-8");
	});

	it("falls back to bare resume when any token is a socket path", () => {
		const command = buildResumeCommand({
			sessionId: "sid-9",
			argv: ["claude", "--bg-spare", "/tmp/cc-daemon/spare/x.claim.sock"],
		});

		expect(command).toBe("claude --resume sid-9");
	});

	it("strips a pre-existing --resume and appends the new one exactly once", () => {
		const command = buildResumeCommand({
			sessionId: "new-id",
			argv: ["claude", "--resume", "old-id"],
			kind: "interactive",
		});

		expect(command).toBe("claude --resume new-id");
		expect(command.split("--resume").length - 1).toBe(1);
	});

	it("strips a pre-existing --session-id and its value before appending --resume", () => {
		const command = buildResumeCommand({
			sessionId: "new-id",
			argv: ["claude", "--session-id", "old-uuid", "--dangerously-skip-permissions"],
			kind: "interactive",
		});

		expect(command).toBe("claude --dangerously-skip-permissions --resume new-id");
	});

	it("strips a pre-existing --continue before appending --resume", () => {
		const command = buildResumeCommand({
			sessionId: "new-id",
			argv: ["claude", "--dangerously-skip-permissions", "--continue"],
			kind: "interactive",
		});

		expect(command).toBe("claude --dangerously-skip-permissions --resume new-id");
	});
});

describe("buildFreshCommand", () => {
	it("keeps the captured flags but drops --resume for an empty session", () => {
		const command = buildFreshCommand({
			sessionId: "sid-1",
			argv: ["claude", "--dangerously-skip-permissions", "--resume", "sid-1"],
			kind: "interactive",
		});

		expect(command).toBe("claude --dangerously-skip-permissions");
	});

	it("falls back to a bare claude when the cmdline was never captured", () => {
		const command = buildFreshCommand({ sessionId: "sid-2", kind: "interactive" });

		expect(command).toBe("claude");
	});

	it("falls back to a bare claude for a non-replayable bg session", () => {
		const command = buildFreshCommand({
			sessionId: "sid-3",
			argv: ["claude", "--dangerously-skip-permissions"],
			kind: "bg",
		});

		expect(command).toBe("claude");
	});
});
