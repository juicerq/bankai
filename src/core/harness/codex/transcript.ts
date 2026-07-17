import { homedir } from "node:os";
import { join } from "node:path";
import { type } from "arktype";
import type {
	HarnessTranscript,
	TranscriptEvent,
} from "@core/harness/Harness";
import { codexPatchEvents } from "@core/harness/codex/patch";
import { codexEvent, codexSessionId } from "@core/harness/codex/records";
import { accepted } from "@core/harness/external";
import { indexTranscripts, readFirstLine } from "@core/harness/transcriptFiles";

const userMessage = type({
	type: type.enumerated("user_message"),
	message: "string",
});
const taskComplete = type({ type: type.enumerated("task_complete") });

async function normalize(records: unknown[]): Promise<TranscriptEvent[] | null> {
	const patchEvents = await codexPatchEvents(records);
	if (!patchEvents) {
		return null;
	}

	const events: TranscriptEvent[] = [];
	for (const record of records) {
		const event = codexEvent(record);
		const user = accepted(userMessage, event?.payload);
		if (user) {
			events.push({ type: "prompt", prompt: user.message });
		} else if (accepted(taskComplete, event?.payload)) {
			events.push({ type: "complete" });
		}
		events.push(...(patchEvents.get(record) ?? []));
	}

	return events;
}

export const CodexTranscript: HarnessTranscript = {
	historicalImport: "observed-only",
	async locateMany(sessionIds) {
		const root = process.env.CODEX_HOME ?? join(homedir(), ".codex");
		return await indexTranscripts(join(root, "sessions"), async (path) => {
			if (!path.endsWith(".jsonl")) {
				return null;
			}

			const first = await readFirstLine(path);
			const sessionId = first ? codexSessionId(first) : null;
			return sessionId && sessionIds.has(sessionId) ? sessionId : null;
		});
	},
	normalize,
};
