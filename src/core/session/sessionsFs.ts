import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionRecord, SessionSource } from "@core/session/SessionBinder";

const DIR = join(homedir(), ".claude", "sessions");

function parse(raw: string): SessionRecord | null {
	const data = ((): unknown => {
		try {
			return JSON.parse(raw);
		} catch {
			return null;
		}
	})();

	if (typeof data !== "object" || data === null) {
		return null;
	}

	const { pid, sessionId, procStart } = data as Record<string, unknown>;
	if (typeof pid !== "number" || typeof sessionId !== "string" || typeof procStart !== "string") {
		return null;
	}

	return { pid, sessionId, procStart };
}

async function list(): Promise<SessionRecord[]> {
	const files = await readdir(DIR).catch(() => [] as string[]);
	const raws = await Promise.all(
		files
			.filter((file) => file.endsWith(".json"))
			.map((file) => readFile(join(DIR, file), "utf8").catch(() => null)),
	);

	return raws.flatMap((raw) => {
		const record = raw === null ? null : parse(raw);

		return record ? [record] : [];
	});
}

export const sessionsFs: SessionSource = { list };
