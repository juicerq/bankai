import { open } from "node:fs/promises";
import { Logger } from "@main/logger";
import {
	IDLE_ROLLOUT,
	rolloutMeta,
	turnAfter,
	type CodexRolloutMeta,
	type CodexRolloutState,
} from "@main/activity/codex/rolloutState";

const META_MAX_BYTES = 1024 * 1024;

const SEED_MAX_BYTES = 4 * 1024 * 1024;

interface TailCursor {
	offset: number;
	carry: string;
	state: CodexRolloutState;
}

class CodexRolloutTail {
	private readonly cursors = new Map<string, TailCursor>();
	private readonly metas = new Map<string, CodexRolloutMeta | null>();

	async meta(path: string): Promise<CodexRolloutMeta | null> {
		const known = this.metas.get(path);
		if (known !== undefined) {
			return known;
		}

		const meta = await this.readMeta(path);
		if (meta !== undefined) {
			this.metas.set(path, meta);
		}

		return meta ?? null;
	}

	async state(path: string): Promise<CodexRolloutState> {
		const held = this.cursors.get(path);
		const handle = await open(path, "r").catch((err: unknown) => {
			Logger.info("codex:rollout-unreadable", { path, err: String(err) });

			return null;
		});
		if (!handle) {
			return held?.state ?? IDLE_ROLLOUT;
		}

		try {
			const { size } = await handle.stat();
			const cursor = held && held.offset <= size ? held : undefined;
			const from = cursor?.offset ?? Math.max(0, size - SEED_MAX_BYTES);
			if (cursor && from === size) {
				return cursor.state;
			}

			const { buffer, bytesRead } = await handle.read({
				buffer: Buffer.alloc(size - from),
				position: from,
			});
			const lines = ((cursor?.carry ?? "") + buffer.toString("utf8", 0, bytesRead)).split("\n");
			const carry = lines.pop() ?? "";
			const records = cursor || from === 0 ? lines : lines.slice(1);
			const next = {
				offset: from + bytesRead,
				carry,
				state: turnAfter(cursor?.state ?? IDLE_ROLLOUT, records),
			};
			this.cursors.set(path, next);

			return next.state;
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
		for (const path of this.metas.keys()) {
			if (!live.has(path)) {
				this.metas.delete(path);
			}
		}
	}

	private async readMeta(path: string): Promise<CodexRolloutMeta | null | undefined> {
		const handle = await open(path, "r").catch((err: unknown) => {
			Logger.info("codex:rollout-unreadable", { path, err: String(err) });

			return null;
		});
		if (!handle) {
			return undefined;
		}

		try {
			const { buffer, bytesRead } = await handle.read({
				buffer: Buffer.alloc(META_MAX_BYTES),
				position: 0,
			});
			const head = buffer.toString("utf8", 0, bytesRead);
			const end = head.indexOf("\n");
			if (end < 0) {
				return null;
			}

			return rolloutMeta(head.slice(0, end));
		} finally {
			await handle.close();
		}
	}
}

export const codexRollouts = new CodexRolloutTail();
