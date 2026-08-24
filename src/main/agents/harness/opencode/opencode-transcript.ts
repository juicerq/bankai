import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OpencodeDb } from "@main/agents/harness/opencode/opencode-db";
import { Logger } from "@main/infra/logger";
import { StorePaths } from "@main/store/store-paths";

interface PartRow {
	id: string;
	role: string;
	data: string;
	time_updated: number;
}

function mirrorPath(sessionId: string): string {
	return join(StorePaths.dataDir(), "opencode", `${sessionId}.jsonl`);
}

function lineOf(row: PartRow): string | undefined {
	let data: unknown;
	try {
		data = JSON.parse(row.data);
	} catch {
		return undefined;
	}

	return `${JSON.stringify({ id: row.id, role: row.role, data })}\n`;
}

function linesOf(rows: PartRow[]): string {
	const lines: string[] = [];
	for (const row of rows) {
		const line = lineOf(row);
		if (line !== undefined) {
			lines.push(line);
		}
	}

	return lines.join("");
}

const known = new Map<string, number>();
const emitted = new Map<string, Map<string, string>>();
const chains = new Map<string, Promise<unknown>>();

function unseen(sessionId: string, rows: PartRow[]): PartRow[] {
	const seen = emitted.get(sessionId) ?? new Map<string, string>();
	emitted.set(sessionId, seen);

	return rows.filter((row) => {
		const fingerprint = createHash("sha256").update(row.data).digest("hex");
		if (seen.get(row.id) === fingerprint) {
			return false;
		}

		seen.set(row.id, fingerprint);

		return true;
	});
}

function cursorOf(rows: PartRow[], fallback: number): number {
	return rows.reduce((latest, row) => Math.max(latest, row.time_updated), fallback);
}

async function rebuild(sessionId: string): Promise<void> {
	const rows = OpencodeDb.updatedParts(sessionId, 0);
	await mkdir(join(StorePaths.dataDir(), "opencode"), { recursive: true });
	emitted.set(sessionId, new Map());
	await writeFile(mirrorPath(sessionId), linesOf(unseen(sessionId, rows)));
	known.set(sessionId, cursorOf(rows, 0));
}

async function appendNew(sessionId: string): Promise<void> {
	const since = known.get(sessionId);
	if (since === undefined) {
		return await rebuild(sessionId);
	}

	const fetched = OpencodeDb.updatedParts(sessionId, since);
	const next = cursorOf(fetched, since);
	const rows = unseen(sessionId, fetched);
	if (rows.length > 0) {
		await appendFile(mirrorPath(sessionId), linesOf(rows));
	}

	known.set(sessionId, next);
}

function serialized<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
	const previous = chains.get(sessionId) ?? Promise.resolve();
	const next = previous.then(work, work);
	chains.set(
		sessionId,
		next.catch((err) => Logger.warn("opencode:mirror-failed", { sessionId, err: String(err) })),
	);

	return next;
}

export const OpencodeTranscript = {
	path: mirrorPath,
	sync: (sessionId: string): Promise<void> => serialized(sessionId, () => appendNew(sessionId)),
	pumpKnown: (): void => {
		for (const sessionId of known.keys()) {
			void OpencodeTranscript.sync(sessionId).catch((err) =>
				Logger.warn("opencode:mirror-pump-failed", { sessionId, err: String(err) }),
			);
		}
	},
	locate: async (ref: { sessionId: string }): Promise<string | null> => {
		try {
			await OpencodeTranscript.sync(ref.sessionId);
		} catch (err) {
			Logger.warn("opencode:transcript-unavailable", { ...ref, err: String(err) });

			return null;
		}

		return mirrorPath(ref.sessionId);
	},
	subagentTranscript: async (ref: { sessionId: string }, agent: string): Promise<string | undefined> => {
		const sessionId = OpencodeDb.subagentSession(ref.sessionId, agent);
		if (!sessionId) {
			return undefined;
		}

		return (await OpencodeTranscript.locate({ sessionId })) ?? undefined;
	},
	forget: (sessionId: string): void => {
		known.delete(sessionId);
		emitted.delete(sessionId);
		chains.delete(sessionId);
	},
};
