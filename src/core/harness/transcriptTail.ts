import { open } from "node:fs/promises";

export type TranscriptTailRead =
	| { state: "ready"; content: string; nextOffset: number; fileId: TranscriptFileId }
	| { state: "replaced" };

export type TranscriptFileId = { dev: string; ino: string };

export const TranscriptTail = {
	async read(
		path: string,
		offset: number,
		expected?: TranscriptFileId,
	): Promise<TranscriptTailRead> {
		const file = await open(path, "r");

		try {
			const stat = await file.stat();
			const fileId = { dev: String(stat.dev), ino: String(stat.ino) };
			if (
				stat.size < offset
				|| (expected && (expected.dev !== fileId.dev || expected.ino !== fileId.ino))
			) {
				return { state: "replaced" };
			}

			const bytes = Buffer.alloc(stat.size - offset);
			let total = 0;
			while (total < bytes.length) {
				const { bytesRead } = await file.read(
					bytes,
					total,
					bytes.length - total,
					offset + total,
				);
				if (bytesRead === 0) {
					break;
				}
				total += bytesRead;
			}
			const content = bytes.subarray(0, total).toString("utf8");
			const completeEnd = content.lastIndexOf("\n") + 1;

			return {
				state: "ready",
				content: content.slice(0, completeEnd),
				nextOffset: offset + Buffer.byteLength(content.slice(0, completeEnd)),
				fileId,
			};
		} finally {
			await file.close();
		}
	},
};
