import { readdir, readlink } from "node:fs/promises";
import type { HarnessDiscovery, NativeSessionRecord } from "@core/harness/Harness";
import { interactiveCodexCommand } from "@core/harness/codex/command";
import { codexSessionId } from "@core/harness/codex/records";
import { readFirstLine } from "@core/harness/transcriptFiles";
import { procFs } from "@core/proc/procFs";

async function processRecord(pid: number): Promise<NativeSessionRecord | null> {
	const argv = await procFs.cmdline(pid);
	if (!argv || !interactiveCodexCommand(argv)) {
		return null;
	}

	const descriptors = await readdir(`/proc/${pid}/fd`).catch((): string[] => []);
	const targets = await Promise.all(descriptors.map((descriptor) =>
		readlink(`/proc/${pid}/fd/${descriptor}`).catch(() => null)));
	const transcript = targets.find((target) =>
		target?.includes("/.codex/sessions/") && target.endsWith(".jsonl"));
	if (!transcript) {
		return null;
	}

	const first = await readFirstLine(transcript);
	const sessionId = first ? codexSessionId(first) : null;
	const procStart = await procFs.procStart(pid);
	return sessionId && procStart
		? { pid, sessionId, procStart, kind: "interactive" }
		: null;
}

export const CodexDiscovery: HarnessDiscovery = {
	async discover() {
		const records = await Promise.all((await procFs.pids()).map(processRecord));

		return records.filter((record): record is NativeSessionRecord => record !== null);
	},
};
