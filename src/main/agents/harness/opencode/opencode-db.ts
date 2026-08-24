import { type } from "arktype";
import { DatabaseSync } from "node:sqlite";
import { OpencodeConfig } from "@main/agents/harness/opencode/opencode-config";

interface OpencodeTurn {
	open: boolean;
	startedAt?: number;
	endedAt?: number;
}

export interface OpencodeSessionState {
	sessionId: string;
	cwd: string;
	title?: string;
	turn: OpencodeTurn;
	questionSince?: number;
}

interface PartUpdate {
	id: string;
	role: string;
	data: string;
	time_updated: number;
}

const sessionRowSchema = type({
	id: "string",
	directory: "string",
	title: "string",
});

const partUpdateRowSchema = type({
	id: "string",
	role: "string",
	data: "string",
	time_updated: "number",
});

let handle: DatabaseSync | undefined;
let handlePath: string | undefined;

function database(): DatabaseSync | undefined {
	const path = OpencodeConfig.dbPath();
	if (handle && handlePath === path) {
		return handle;
	}

	dropHandle();
	try {
		handle = new DatabaseSync(path, { readOnly: true });
		handlePath = path;
	} catch {
		return undefined;
	}

	return handle;
}

function dropHandle(): void {
	try {
		handle?.close();
	} catch {
		return;
	}

	handle = undefined;
}

function rows(sql: string, parameters: (string | number)[]): Record<string, unknown>[] {
	const db = database();
	if (!db) {
		return [];
	}

	try {
		return db.prepare(sql).all(...parameters);
	} catch {
		dropHandle();

		return [];
	}
}

function firstRow(sql: string, parameters: (string | number)[]): Record<string, unknown> | undefined {
	return rows(sql, parameters)[0];
}

function scalar(query: string, parameters: (string | number)[]): unknown {
	const row = rows(query, parameters)[0];
	if (!row) {
		return undefined;
	}

	return Object.values(row)[0];
}

function latestRootSession(directory: string): { sessionId: string; cwd: string } | undefined {
	const row = firstRow(
		"SELECT id, directory, title FROM session WHERE parent_id IS NULL AND time_archived IS NULL AND directory = ? ORDER BY time_updated DESC LIMIT 1",
		[directory],
	);
	if (!row) {
		return undefined;
	}

	const parsed = sessionRowSchema(row);
	if (parsed instanceof type.errors) {
		return undefined;
	}

	return { sessionId: parsed.id, cwd: parsed.directory };
}

function messageTurn(sessionId: string): OpencodeTurn {
	const raw = scalar("SELECT data FROM message WHERE session_id = ? ORDER BY time_created DESC LIMIT 1", [sessionId]);
	if (typeof raw !== "string") {
		return { open: false };
	}

	let data: { role?: string; time?: { created?: number; completed?: number } };
	try {
		data = JSON.parse(raw);
	} catch {
		return { open: false };
	}

	if (data.role !== "assistant" || data.time?.completed === undefined) {
		return { open: true, startedAt: data.time?.created };
	}

	return { open: false, endedAt: data.time.completed };
}

function pendingQuestionSince(sessionId: string): number | undefined {
	const since = scalar(
		"SELECT json_extract(data,'$.state.time.start') FROM part WHERE session_id = ? AND json_extract(data,'$.tool') = 'question' AND json_extract(data,'$.state.status') = 'running' ORDER BY time_created DESC LIMIT 1",
		[sessionId],
	);

	if (typeof since !== "number") {
		return undefined;
	}

	return since;
}

function state(sessionId: string): Omit<OpencodeSessionState, "sessionId"> | undefined {
	const row = firstRow("SELECT id, directory, title FROM session WHERE id = ?", [sessionId]);
	if (!row) {
		return undefined;
	}

	const parsed = sessionRowSchema(row);
	if (parsed instanceof type.errors) {
		return undefined;
	}

	const questionSince = pendingQuestionSince(sessionId);

	return {
		cwd: parsed.directory,
		turn: messageTurn(sessionId),
		...(questionSince !== undefined && { questionSince }),
	};
}

function updatedParts(sessionId: string, sinceAt: number): PartUpdate[] {
	return rows(
		`SELECT p.id, p.time_updated, p.data, json_extract(m.data,'$.role') AS role
			FROM part p JOIN message m ON m.id = p.message_id
			WHERE p.session_id = ? AND p.time_updated >= ?
			ORDER BY p.time_created, p.id`,
		[sessionId, sinceAt],
	).flatMap((row) => {
		const parsed = partUpdateRowSchema(row);
		if (parsed instanceof type.errors) {
			return [];
		}

		return [parsed];
	});
}

function title(sessionId: string): string | null {
	const found = scalar("SELECT title FROM session WHERE id = ?", [sessionId]);
	if (typeof found !== "string" || !found) {
		return null;
	}

	return found;
}

function subagentSession(sessionId: string, callId: string): string | undefined {
	const found = scalar(
		"SELECT json_extract(data,'$.state.metadata.sessionId') FROM part WHERE session_id = ? AND json_extract(data,'$.callID') = ? AND json_extract(data,'$.type') = 'tool' ORDER BY time_created DESC LIMIT 1",
		[sessionId, callId],
	);

	if (typeof found !== "string" || !found.startsWith("ses_")) {
		return undefined;
	}

	return found;
}

export const OpencodeDb = {
	latestRootSession,
	state,
	title,
	updatedParts,
	subagentSession,
};
