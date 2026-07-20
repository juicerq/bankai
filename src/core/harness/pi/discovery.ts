import { readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { type } from "arktype";
import type { HarnessDiscovery, NativeSessionRecord } from "@core/harness/Harness";
import { accepted, parsedJson } from "@core/harness/external";
import {
	PI_COMPANION_PROTOCOL,
	PI_DISCOVERY_DIRECTORY,
	PI_DISCOVERY_DIR_ENV,
} from "@core/harness/pi/protocol";
import { procFs } from "@core/proc/procFs";
import { resolveDataDir } from "@core/store/paths";

const discoveryRecord = type({
	protocol: `${PI_COMPANION_PROTOCOL}`,
	pid: "number.integer > 0",
	procStart: "string",
	sessionId: "string",
	transcriptPath: "string",
	mode: type.enumerated("interactive"),
});

function parseRecord(raw: string): NativeSessionRecord | null {
	const parsed = parsedJson(raw);
	const record = parsed.ok ? accepted(discoveryRecord, parsed.value) : null;
	return record ? {
		pid: record.pid,
		procStart: record.procStart,
		sessionId: record.sessionId,
		kind: "interactive",
	} : null;
}

export function piDiscoveryDirectory(): string {
	return process.env[PI_DISCOVERY_DIR_ENV]
		?? join(resolveDataDir(), PI_DISCOVERY_DIRECTORY);
}

export const PiDiscovery: HarnessDiscovery = {
	async discover() {
		const directory = piDiscoveryDirectory();
		const files = await readdir(directory).catch((): string[] => []);
		const records = await Promise.all(files
			.filter((file) => file.endsWith(".json"))
			.map(async (file) => {
				const path = join(directory, file);
				const raw = await readFile(path, "utf8").catch(() => null);
				const record = raw === null ? null : parseRecord(raw);
				const start = record ? await procFs.procStart(record.pid) : null;
				if (!record || start !== record.procStart) {
					await unlink(path).catch(() => {});
					return null;
				}

				return record;
			}));

		return records.filter((record): record is NativeSessionRecord => record !== null);
	},
};
