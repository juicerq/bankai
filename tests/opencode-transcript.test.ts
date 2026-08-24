import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { OpencodeTranscript } from "@main/agents/harness/opencode/opencode-transcript";
import { StorePaths } from "@main/store/store-paths";

let dataHome: string;
let db: DatabaseSync;

const SESSION = "ses_fixture01";
const CWD = "/repo";

function message(id: string, role: string, created: number, completed?: number): void {
	db.prepare(
		"INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)",
	).run(id, SESSION, created, completed ?? created, JSON.stringify({ role, time: { created, ...(completed && { completed }) } }));
}

function part(id: string, messageId: string, created: number, updated: number, data: Record<string, unknown>): void {
	db.prepare(
		"INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)",
	).run(id, messageId, SESSION, created, updated, JSON.stringify(data));
}

function lines(): unknown[] {
	const path = OpencodeTranscript.path(SESSION);
	if (!path) {
		throw new Error("mirror path missing");
	}

	return readFileSync(path, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
}

beforeAll(() => {
	dataHome = mkdtempSync(join(tmpdir(), "bankai-opencode-home-"));
	process.env.XDG_DATA_HOME = dataHome;

	mkdirSync(join(dataHome, "opencode"), { recursive: true });
	db = new DatabaseSync(join(dataHome, "opencode", "opencode.db"));
	db.exec(`
		CREATE TABLE session (id text PRIMARY KEY, project_id text, parent_id text, directory text, title text, time_created integer, time_updated integer, time_archived integer);
		CREATE TABLE message (id text PRIMARY KEY, session_id text, time_created integer, time_updated integer, data text);
		CREATE TABLE part (id text PRIMARY KEY, message_id text, session_id text, time_created integer, time_updated integer, data text);
	`);
	db.prepare(
		"INSERT INTO session (id, project_id, parent_id, directory, title, time_created, time_updated, time_archived) VALUES (?, 'p', NULL, ?, 'Fix the bug', 1, 1, NULL)",
	).run(SESSION, CWD);
	message("msg_1", "user", 10);
	part("prt_1", "msg_1", 11, 11, { type: "text", text: "first prompt" });
	message("msg_2", "assistant", 20);
	part("prt_2", "msg_2", 21, 21, { type: "text", text: "working on it" });
});

afterAll(() => {
	delete process.env.XDG_DATA_HOME;
	rmSync(dataHome, { recursive: true, force: true });
});

describe("the opencode transcript mirror", () => {
	test("the mirror follows the database as the conversation moves", async () => {
		const path = await OpencodeTranscript.locate({ sessionId: SESSION });

		expect(path).toBe(join(StorePaths.dataDir(), "opencode", `${SESSION}.jsonl`));
		expect(lines()).toEqual([
			{ id: "prt_1", role: "user", data: { type: "text", text: "first prompt" } },
			{ id: "prt_2", role: "assistant", data: { type: "text", text: "working on it" } },
		]);

		part("prt_3", "msg_2", 31, 31, { type: "reasoning", text: "hmm" });
		await OpencodeTranscript.sync(SESSION);
		expect(lines()).toHaveLength(3);
		expect(lines()[2]).toEqual({ id: "prt_3", role: "assistant", data: { type: "reasoning", text: "hmm" } });

		db.prepare("UPDATE part SET time_updated = 41, data = ? WHERE id = 'prt_3'").run(
			JSON.stringify({ type: "reasoning", text: "hmm, maybe not" }),
		);
		await OpencodeTranscript.sync(SESSION);
		expect(lines()).toHaveLength(4);
		expect(lines()[3]).toEqual({ id: "prt_3", role: "assistant", data: { type: "reasoning", text: "hmm, maybe not" } });

		OpencodeTranscript.forget(SESSION);
		await OpencodeTranscript.locate({ sessionId: SESSION });
		expect(lines()).toHaveLength(3);
		expect(lines().at(-1)).toEqual({ id: "prt_3", role: "assistant", data: { type: "reasoning", text: "hmm, maybe not" } });
	});
});
