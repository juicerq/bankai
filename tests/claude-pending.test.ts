import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { ClaudePending } from "@main/agents/harness/claude/claude-pending";
import { ClaudeTranscript } from "@main/agents/harness/claude/claude-transcript";

let configDir: string | undefined;

afterEach(() => {
	if (configDir) {
		rmSync(configDir, { recursive: true, force: true });
		configDir = undefined;
	}
	delete process.env.CLAUDE_CONFIG_DIR;
});

let sessionSerial = 0;

function freshRef(): { sessionId: string; cwd: string } {
	configDir = mkdtempSync(join(tmpdir(), "claude-config-"));
	process.env.CLAUDE_CONFIG_DIR = configDir;
	sessionSerial += 1;

	return {
		sessionId: `00000000-0000-4000-8000-${String(sessionSerial).padStart(12, "0")}`,
		cwd: "/home/jui/projects/bankai",
	};
}

function transcript(ref: { sessionId: string; cwd: string }, lines: string[]): string {
	const path = ClaudeTranscript.path(ref);
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, lines.map((line) => `${line}\n`).join(""));

	return path;
}

function agentLaunch(agentId: string): string {
	return JSON.stringify({
		type: "user",
		message: { content: [{ type: "tool_result", tool_use_id: "toolu_launch", content: "Async agent launched successfully." }] },
		toolUseResult: {
			agentId,
			status: "async_launched",
			isAsync: true,
			description: "tarefa",
			prompt: "faz",
			outputFile: `/tmp/tasks/${agentId}.output`,
			canReadOutputFile: false,
			resolvedModel: "haiku",
		},
		timestamp: "2026-08-04T14:00:45.606Z",
	});
}

function bashLaunch(taskId: string): string {
	return JSON.stringify({
		type: "user",
		message: { content: [{ type: "tool_result", tool_use_id: "toolu_bash", content: "Command running in background" }] },
		toolUseResult: {
			backgroundTaskId: taskId,
			stdout: "",
			stderr: "",
			interrupted: false,
			isImage: false,
			noOutputExpected: false,
		},
		timestamp: "2026-08-04T11:30:02.930Z",
	});
}

function notice(taskId: string): string {
	return JSON.stringify({
		type: "user",
		message: { content: `<task-notification>\n<task-id>${taskId}</task-id>\n<status>completed</status>\n<result>ok</result>\n</task-notification>` },
		timestamp: "2026-08-04T14:00:54.099Z",
	});
}

function queuedNotice(taskId: string): string {
	return JSON.stringify({
		type: "queue-operation",
		operation: "enqueue",
		content: `<task-notification>\n<task-id>${taskId}</task-id>\n<status>completed</status>\n</task-notification>`,
		timestamp: "2026-08-04T14:00:54.077Z",
	});
}

function attachedNotice(taskId: string): string {
	return JSON.stringify({
		type: "attachment",
		attachment: {
			type: "queued_command",
			commandMode: "prompt",
			prompt: `<task-notification>\n<task-id>${taskId}</task-id>\n<status>completed</status>\n</task-notification>`,
			timestamp: "2026-08-04T11:30:47.761Z",
		},
		timestamp: "2026-08-04T11:30:47.761Z",
	});
}

function taskStop(taskId: string): string {
	return JSON.stringify({
		type: "user",
		message: { content: [{ type: "tool_result", tool_use_id: "toolu_stop", content: "stopped" }] },
		toolUseResult: {
			message: `Successfully stopped task: ${taskId} (bun watch.ts)`,
			task_id: taskId,
			task_type: "local_bash",
			command: "bun watch.ts",
		},
		timestamp: "2026-08-04T11:44:47.863Z",
	});
}

describe("deliveries a session still owes", () => {
	test("a launched subagent without its notification is owed", async () => {
		const ref = freshRef();
		transcript(ref, [agentLaunch("a338995e095ab30ed")]);

		expect(await ClaudePending.owes(ref)).toBe(true);
	});

	test("the notification arriving settles the debt", async () => {
		const ref = freshRef();
		const path = transcript(ref, [agentLaunch("a338995e095ab30ed")]);

		expect(await ClaudePending.owes(ref)).toBe(true);

		appendFileSync(path, `${notice("a338995e095ab30ed")}\n`);

		expect(await ClaudePending.owes(ref)).toBe(false);
	});

	test("a background command is owed until its queued notification", async () => {
		const ref = freshRef();
		const path = transcript(ref, [bashLaunch("bjiy7phoh")]);

		expect(await ClaudePending.owes(ref)).toBe(true);

		appendFileSync(path, `${queuedNotice("bjiy7phoh")}\n`);

		expect(await ClaudePending.owes(ref)).toBe(false);
	});

	test("stopping a task on purpose also settles it", async () => {
		const ref = freshRef();
		transcript(ref, [bashLaunch("brh3qznsz"), taskStop("brh3qznsz")]);

		expect(await ClaudePending.owes(ref)).toBe(false);
	});

	test("only the settled task clears; the other launch keeps the debt", async () => {
		const ref = freshRef();
		transcript(ref, [agentLaunch("a111"), bashLaunch("b222"), notice("a111")]);

		expect(await ClaudePending.owes(ref)).toBe(true);
	});

	test("a compacted transcript replaying an old launch stays settled", async () => {
		const ref = freshRef();
		transcript(ref, [
			agentLaunch("ae9c9aeeeeb477b80"),
			notice("ae9c9aeeeeb477b80"),
			agentLaunch("ae9c9aeeeeb477b80"),
			attachedNotice("ae9c9aeeeeb477b80"),
		]);

		expect(await ClaudePending.owes(ref)).toBe(false);
	});

	test("launch markers quoted inside other records arm nothing", async () => {
		const ref = freshRef();
		const quoted = JSON.stringify({
			type: "assistant",
			message: { content: [{ type: "tool_use", id: "toolu_grep", name: "Bash", input: { command: "grep '\"async_launched\"' transcript | grep '\"backgroundTaskId\"'" } }] },
			timestamp: "2026-08-04T15:36:20.448Z",
		});
		transcript(ref, [quoted]);

		expect(await ClaudePending.owes(ref)).toBe(false);
	});

	test("a half-written line waits for its newline before it counts", async () => {
		const ref = freshRef();
		const path = transcript(ref, [agentLaunch("a333")]);
		const settling = notice("a333");
		appendFileSync(path, settling.slice(0, 40));

		expect(await ClaudePending.owes(ref)).toBe(true);

		appendFileSync(path, `${settling.slice(40)}\n`);

		expect(await ClaudePending.owes(ref)).toBe(false);
	});

	test("a session with no transcript owes nothing", async () => {
		const ref = freshRef();

		expect(await ClaudePending.owes(ref)).toBe(false);
	});
});
