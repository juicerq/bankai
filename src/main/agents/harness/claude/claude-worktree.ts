import { open } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { type } from "arktype";
import { Worktrees } from "@main/git/worktree/worktrees";
import type { Worktree } from "@shared/review";
import { Logger } from "@main/infra/logger";

const RECORD = type({
	type: type.enumerated("assistant", "user"),
	"isSidechain?": "boolean",
	message: { content: "unknown[]" },
});
const TOOL = type({
	type: "'tool_use'",
	id: "string",
	name: "string",
	input: { "command?": "string", "file_path?": "string", "run_in_background?": "boolean" },
});
const RESULT = type({ type: "'tool_result'", tool_use_id: "string", "is_error?": "boolean" });
const CHUNK_BYTES = 256 * 1024;

function commandDirectory(command: string): string | undefined {
	const match = /^\s*(?:cd\s+(?:--\s+)?|git\s+-C\s+)(?:'([^']+)'|"([^"$`\\]+)"|([^\s;&|<>"'`$\\]+))(?=\s|$)(.*)$/s.exec(command);
	if (!match) {
		return undefined;
	}

	const path = match[1] ?? match[2] ?? match[3];
	if (!path || !isAbsolute(path)) {
		return undefined;
	}
	const rest = match[4] ?? "";
	if (/^\s*cd\s/.test(command) && !/^\s*(?:&&|$)/.test(rest)) {
		return undefined;
	}

	if (/\|\||(?:[;&|\n]|^)\s*(?:cd\s|git\s+-C\s)|(?:^|\s)-C(?:\s|$)/.test(rest)) {
		return undefined;
	}

	return path;
}

function operationDirectory(tool: typeof TOOL.infer): string | undefined {
	if (tool.name === "Bash" && tool.input.command && !tool.input.run_in_background) {
		return commandDirectory(tool.input.command);
	}
	if (["Edit", "Write", "MultiEdit"].includes(tool.name) && tool.input.file_path && isAbsolute(tool.input.file_path)) {
		return dirname(tool.input.file_path);
	}

	return undefined;
}

class OperationWorktree {
	private readonly pending = new Map<string, string>();
	path: string | undefined;

	consume(line: string, worktrees: Worktree[]): void {
		try {
			const value: unknown = JSON.parse(line);
			if (!RECORD.allows(value)) {
				return;
			}

			const record = RECORD.assert(value);
			if (record.isSidechain) {
				return;
			}

			for (const block of record.message.content) {
				this.consumeBlock(record.type, block, worktrees);
			}
		} catch {
			return;
		}
	}

	private consumeBlock(kind: typeof RECORD.infer.type, block: unknown, worktrees: Worktree[]): void {
		if (kind === "assistant" && TOOL.allows(block)) {
			const tool = TOOL.assert(block);
			const directory = operationDirectory(tool);
			if (directory) {
				this.pending.set(tool.id, directory);
			}

			return;
		}
		if (kind !== "user" || !RESULT.allows(block)) {
			return;
		}

		const result = RESULT.assert(block);
		const directory = this.pending.get(result.tool_use_id);
		this.pending.delete(result.tool_use_id);
		if (directory && !result.is_error) {
			this.path = Worktrees.containing(worktrees, directory)?.path ?? this.path;
		}
	}
}

interface Cursor {
	inode: number;
	offset: number;
	carry: Buffer;
	operations: OperationWorktree;
}

class ClaudeWorktreeReader {
	private readonly cursors = new Map<string, Cursor>();
	private readonly reading = new Map<string, Promise<string | undefined>>();

	async read(path: string, cwd: string): Promise<string | undefined> {
		const pending = this.reading.get(path);
		if (pending) {
			return await pending;
		}

		const reading = this.readTranscript(path, cwd);
		this.reading.set(path, reading);
		try {
			return await reading;
		} finally {
			this.reading.delete(path);
		}
	}

	private async readTranscript(path: string, cwd: string): Promise<string | undefined> {
		const held = this.cursors.get(path);
		const handle = await open(path, "r").catch(() => null);
		if (!handle) {
			return held?.operations.path;
		}

		try {
			const { size, ino } = await handle.stat();
			const cursor = held?.inode === ino && held.offset <= size
				? held
				: { inode: ino, offset: 0, carry: Buffer.alloc(0), operations: new OperationWorktree() };
			this.cursors.set(path, cursor);
			if (cursor.offset === size) {
				return cursor.operations.path;
			}

			const worktrees = await Worktrees.read(cwd);
			if (worktrees.length === 0) {
				return cursor.operations.path;
			}

			while (cursor.offset < size) {
				const { buffer, bytesRead } = await handle.read({ buffer: Buffer.alloc(Math.min(CHUNK_BYTES, size - cursor.offset)), position: cursor.offset });
				if (bytesRead === 0) {
					break;
				}

				const content = Buffer.concat([cursor.carry, buffer.subarray(0, bytesRead)]);
				const end = content.lastIndexOf(10);
				for (const line of content.subarray(0, end + 1).toString("utf8").split("\n")) {
					if (line) {
						cursor.operations.consume(line, worktrees);
					}
				}
				cursor.carry = content.subarray(end + 1);
				cursor.offset += bytesRead;
			}

			return cursor.operations.path;
		} catch (err) {
			Logger.warn("claude:worktree-unreadable", { path, err: String(err) });

			return held?.operations.path;
		} finally {
			await handle.close();
		}
	}

	forget(live: ReadonlySet<string>): void {
		for (const path of this.cursors.keys()) {
			if (!live.has(path)) {
				this.cursors.delete(path);
			}
		}
	}
}

export const ClaudeWorktree = new ClaudeWorktreeReader();
