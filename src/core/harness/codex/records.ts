import { type } from "arktype";
import { accepted, parsedJson } from "@core/harness/external";

const sessionMeta = type({
	type: type.enumerated("session_meta"),
	payload: { id: "string" },
});
const eventRecord = type({
	type: type.enumerated("event_msg"),
	payload: "unknown",
});

export function codexSessionId(raw: string): string | null {
	const parsed = parsedJson(raw);
	if (!parsed.ok) {
		return null;
	}

	const meta = accepted(sessionMeta, parsed.value);
	return meta ? meta.payload.id : null;
}

export function codexEvent(record: unknown) {
	return accepted(eventRecord, record);
}
