import { unwatchFile, watchFile } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { ConversationParser } from "@main/agents/harness/claude/claude-conversation";
import { Logger } from "@main/infra/logger";
import { type ConversationBlock, type ConversationSnapshot, mergeConversationBlocks } from "@shared/conversation";

export const CONVERSATION_BACKFILL_BYTES = 512 * 1024;

export interface ConversationLineParser {
	title: string | undefined;
	consume: (line: string) => ConversationBlock[];
}

const READ_CHUNK_BYTES = 256 * 1024;
const WATCH_INTERVAL_MS = 500;

async function openTranscript(path: string): Promise<FileHandle | undefined> {
	try {
		return await open(path, "r");
	} catch (err) {
		if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) {
			Logger.warn("conversation:transcript-unreadable", { path, err: String(err) });
		}

		return undefined;
	}
}

export class ConversationTail {
	private readonly decoder = new StringDecoder("utf8");
	private pending = "";
	private offset = 0;
	private startOffset = 0;
	private skipping = false;
	private stopped = false;
	private pumping = false;
	private again = false;
	private backfill: ConversationBlock[] | undefined;

	constructor(
		private readonly path: string,
		private readonly onAppended: (event: { blocks: ConversationBlock[]; title?: string }) => void,
		private readonly watchIntervalMs: number = WATCH_INTERVAL_MS,
		private readonly parser: ConversationLineParser = new ConversationParser(),
	) {}

	async start(from?: number): Promise<ConversationSnapshot> {
		this.backfill = [];

		const handle = await openTranscript(this.path);
		if (handle) {
			const { size } = await handle.stat();
			await handle.close();
			this.startOffset = Math.min(from ?? Math.max(0, size - CONVERSATION_BACKFILL_BYTES), size);
			this.offset = this.startOffset;
			this.skipping = this.offset > 0;
			await this.readAppended();
		}

		const backfill = this.backfill;
		this.backfill = undefined;

		if (!this.stopped) {
			watchFile(this.path, { interval: this.watchIntervalMs }, this.onChange);
		}

		return {
			blocks: backfill,
			title: this.parser.title,
			startOffset: this.startOffset,
			atStart: this.startOffset === 0,
		};
	}

	stop(): void {
		this.stopped = true;
		unwatchFile(this.path, this.onChange);
	}

	private readonly onChange = (): void => {
		this.pump().catch((err) => Logger.warn("conversation:tail-failed", { path: this.path, err: String(err) }));
	};

	private async pump(): Promise<void> {
		if (this.pumping) {
			this.again = true;

			return;
		}

		this.pumping = true;
		try {
			do {
				this.again = false;
				await this.readAppended();
			} while (this.again && !this.stopped);
		} finally {
			this.pumping = false;
		}
	}

	private async readAppended(): Promise<void> {
		const handle = await openTranscript(this.path);
		if (!handle) {
			return;
		}

		try {
			const { size } = await handle.stat();
			if (size < this.offset) {
				this.offset = size;
				this.pending = "";
			}

			while (this.offset < size && !this.stopped) {
				const length = Math.min(READ_CHUNK_BYTES, size - this.offset);
				const { buffer, bytesRead } = await handle.read({
					buffer: Buffer.alloc(length),
					position: this.offset,
				});
				if (bytesRead === 0) {
					return;
				}

				this.offset += bytesRead;
				this.emit(this.feed(this.decoder.write(buffer.subarray(0, bytesRead))));
			}
		} finally {
			await handle.close();
		}
	}

	private feed(text: string): ConversationBlock[] {
		let incoming = text;

		if (this.skipping) {
			const cut = incoming.indexOf("\n");
			if (cut === -1) {
				return [];
			}

			this.skipping = false;
			incoming = incoming.slice(cut + 1);
		}

		const lines = (this.pending + incoming).split("\n");
		this.pending = lines.pop() ?? "";

		return lines.flatMap((line) => this.parser.consume(line));
	}

	private emit(blocks: ConversationBlock[]): void {
		if (this.backfill) {
			this.backfill = mergeConversationBlocks(this.backfill, blocks);

			return;
		}

		if (blocks.length === 0) {
			return;
		}

		this.onAppended({ blocks, title: this.parser.title });
	}
}
