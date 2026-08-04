import { open } from "node:fs/promises";
import { type } from "arktype";
import { ClaudeTranscript } from "@main/agents/harness/claude/claude-transcript";

const NOTICE_PATTERN = /<task-id>([^<]+)<\/task-id>/g;

const LINE_MARKS = ['"async_launched"', '"backgroundTaskId"', '"task_id"', "<task-id>"];

const taskResultSchema = type({
	type: "'user'",
	toolUseResult: {
		"agentId?": "string",
		"backgroundTaskId?": "string",
		"status?": "string",
		"task_id?": "string",
	},
});

const noticeSchema = type({
	type: "'user'",
	message: { content: "string" },
}).or({
	type: "'queue-operation'",
	content: "string",
}).or({
	type: "'attachment'",
	attachment: { prompt: "string" },
});

interface TranscriptScan {
	offset: number;
	pending: Set<string>;
}

const scans = new Map<string, TranscriptScan>();

function noticeText(notice: typeof noticeSchema.infer): string {
	if (notice.type === "user") {
		return notice.message.content;
	}
	if (notice.type === "queue-operation") {
		return notice.content;
	}

	return notice.attachment.prompt;
}

function apply(line: string, pending: Set<string>): void {
	if (!LINE_MARKS.some((mark) => line.includes(mark))) {
		return;
	}

	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return;
	}

	const task = taskResultSchema(value);
	if (!(task instanceof type.errors)) {
		const result = task.toolUseResult;
		if (result.status === "async_launched" && result.agentId) {
			pending.add(result.agentId);
		}
		if (result.backgroundTaskId) {
			pending.add(result.backgroundTaskId);
		}
		if (result.task_id) {
			pending.delete(result.task_id);
		}
	}

	const notice = noticeSchema(value);
	if (!(notice instanceof type.errors)) {
		for (const [, taskId] of noticeText(notice).matchAll(NOTICE_PATTERN)) {
			if (taskId) {
				pending.delete(taskId);
			}
		}
	}
}

async function owes(ref: { sessionId: string; cwd: string }): Promise<boolean> {
	const scan = scans.get(ref.sessionId) ?? { offset: 0, pending: new Set<string>() };
	scans.set(ref.sessionId, scan);

	const handle = await open(await ClaudeTranscript.locate(ref)).catch(() => null);
	if (!handle) {
		return scan.pending.size > 0;
	}

	try {
		const { size } = await handle.stat();
		if (size < scan.offset) {
			scan.offset = 0;
			scan.pending.clear();
		}
		if (size === scan.offset) {
			return scan.pending.size > 0;
		}

		const buffer = Buffer.alloc(size - scan.offset);
		await handle.read(buffer, 0, buffer.length, scan.offset);
		const terminal = buffer.lastIndexOf(10);
		if (terminal === -1) {
			return scan.pending.size > 0;
		}

		const complete = buffer.subarray(0, terminal + 1);
		scan.offset += complete.length;
		for (const line of complete.toString("utf8").split("\n")) {
			apply(line, scan.pending);
		}

		return scan.pending.size > 0;
	} finally {
		await handle.close();
	}
}

export const ClaudePending = {
	owes,
};
