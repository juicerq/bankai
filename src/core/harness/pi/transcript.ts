import { homedir } from "node:os";
import { join } from "node:path";
import { type } from "arktype";
import {
	REVIEW_UNAVAILABLE_REASONS,
	type HarnessTranscript,
	type TranscriptEvent,
} from "@core/harness/Harness";
import { accepted, parsedJson } from "@core/harness/external";
import {
	PI_COMPANION_PROTOCOL,
	PI_REVIEW_ENTRY,
} from "@core/harness/pi/protocol";
import { indexTranscripts, readFirstLine } from "@core/harness/transcriptFiles";

const sessionHeader = type({
	type: type.enumerated("session"),
	id: "string",
});
const customEntry = type({
	type: type.enumerated("custom"),
	customType: "string",
	data: "unknown",
});
const companionEntry = type({
	protocol: "number",
	originSessionId: "string",
	event: "unknown",
});
const eligibleEvent = type({ type: type.enumerated("eligible") });
const promptEvent = type({
	type: type.enumerated("prompt"),
	prompt: "string",
});
const changeEvent = type({
	type: type.enumerated("change"),
	path: "string",
	before: "string",
	after: "string",
});
const completeEvent = type({ type: type.enumerated("complete") });
const unavailableEvent = type({
	type: type.enumerated("unavailable"),
	reason: type.enumerated(...REVIEW_UNAVAILABLE_REASONS),
});

function sessionId(raw: string): string | null {
	const parsed = parsedJson(raw);
	if (!parsed.ok) {
		return null;
	}

	const header = accepted(sessionHeader, parsed.value);
	return header ? header.id : null;
}

function normalize(records: unknown[], expectedSessionId: string): TranscriptEvent[] | null {
	const headerRecord = records.find((record) => accepted(sessionHeader, record));
	const header = headerRecord ? accepted(sessionHeader, headerRecord) : null;
	if (header && header.id !== expectedSessionId) {
		return null;
	}

	let eligible = false;
	let incompatible = false;
	const events: TranscriptEvent[] = [];
	for (const raw of records) {
		const custom = accepted(customEntry, raw);
		if (!custom || custom.customType !== PI_REVIEW_ENTRY) {
			continue;
		}

		const entry = accepted(companionEntry, custom.data);
		if (!entry) {
			return null;
		}
		if (entry.originSessionId !== expectedSessionId) {
			continue;
		}
		if (entry.protocol !== PI_COMPANION_PROTOCOL) {
			incompatible = true;
			continue;
		}
		if (accepted(eligibleEvent, entry.event)) {
			eligible = true;
			continue;
		}

		const prompt = accepted(promptEvent, entry.event);
		if (prompt) {
			events.push(prompt);
			continue;
		}
		const change = accepted(changeEvent, entry.event);
		if (change) {
			events.push(change);
			continue;
		}
		if (accepted(completeEvent, entry.event)) {
			events.push({ type: "complete" });
			continue;
		}
		const unavailable = accepted(unavailableEvent, entry.event);
		if (unavailable) {
			events.push(unavailable);
			continue;
		}

		return null;
	}

	if (incompatible || (header && !eligible)) {
		return [{ type: "unavailable", reason: "historical" }];
	}
	return events;
}

export const PiTranscript: HarnessTranscript = {
	historicalImport: "eligible-only",
	async locateMany(sessionIds) {
		const agentDirectory = process.env.PI_CODING_AGENT_DIR
			?? join(homedir(), ".pi", "agent");
		const sessions = process.env.PI_CODING_AGENT_SESSION_DIR
			?? join(agentDirectory, "sessions");

		return await indexTranscripts(sessions, async (path) => {
			if (!path.endsWith(".jsonl")) {
				return null;
			}

			const first = await readFirstLine(path);
			const id = first ? sessionId(first) : null;
			return id && sessionIds.has(id) ? id : null;
		});
	},
	normalize(records, expectedSessionId) {
		return Promise.resolve(normalize(records, expectedSessionId));
	},
};
