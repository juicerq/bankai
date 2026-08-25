import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { OpencodeDb } from "@main/agents/harness/opencode/opencode-db";

let dataHome: string;
let db: DatabaseSync;

const SESSION = "ses_state0001";
const OTHER = "ses_other001";

beforeAll(() => {
	dataHome = mkdtempSync(join(tmpdir(), "bankai-opencode-state-"));
	process.env.XDG_DATA_HOME = dataHome;

	mkdirSync(join(dataHome, "opencode"), { recursive: true });
	db = new DatabaseSync(join(dataHome, "opencode", "opencode.db"));
	db.exec(`
		CREATE TABLE session (id text PRIMARY KEY, project_id text, parent_id text, directory text, title text, time_created integer, time_updated integer, time_archived integer);
		CREATE TABLE message (id text PRIMARY KEY, session_id text, time_created integer, time_updated integer, data text);
		CREATE TABLE part (id text PRIMARY KEY, message_id text, session_id text, time_created integer, time_updated integer, data text);
	`);
});

afterAll(() => {
	delete process.env.XDG_DATA_HOME;
	rmSync(dataHome, { recursive: true, force: true });
});

function seedSession(id: string, directory: string, title: string): void {
	db.prepare(
		"INSERT INTO session (id, project_id, parent_id, directory, title, time_created, time_updated, time_archived) VALUES (?, 'p', NULL, ?, ?, 1, 1, NULL)",
	).run(id, directory, title);
}

describe("the opencode database state", () => {
	test("a finished assistant message closes the turn and carries the title", () => {
		seedSession(SESSION, "/repo/a", "Fix the bug");
		db.prepare("INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('m1', ?, 10, 20, ?)").run(
			SESSION,
			JSON.stringify({ role: "assistant", time: { created: 10, completed: 20 } }),
		);

		expect(OpencodeDb.state(SESSION)).toEqual({ cwd: "/repo/a", turn: { open: false, endedAt: 20 } });
		expect(OpencodeDb.title(SESSION)).toBe("Fix the bug");
	});

	test("a running question turns an open turn into waiting since the question", () => {
		seedSession(OTHER, "/repo/b", "Ask away");
		db.prepare("INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('q1', ?, 30, 30, ?)").run(
			OTHER,
			JSON.stringify({ role: "assistant", time: { created: 30 } }),
		);
		db.prepare(
			"INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES ('qp1', 'q1', ?, 31, 31, ?)",
		).run(
			OTHER,
			JSON.stringify({ type: "tool", tool: "question", callID: "call_q", state: { status: "running", time: { start: 35 } } }),
		);

		expect(OpencodeDb.state(OTHER)).toEqual({
			cwd: "/repo/b",
			turn: { open: true, startedAt: 30 },
			questionSince: 35,
		});
	});

	test("the root sessions of a directory carry their creation and activity times", () => {
		const older = "ses_older0001";
		seedSession(older, "/repo/c", "Older");
		db.prepare("UPDATE session SET time_created = 2, time_updated = 5 WHERE id = ?").run(older);
		seedSession("ses_newer0001", "/repo/c", "Newer");
		db.prepare("UPDATE session SET time_created = 7, time_updated = 9 WHERE id = ?").run("ses_newer0001");

		expect(OpencodeDb.rootSessions("/repo/c", 2)).toEqual([
			{ sessionId: "ses_newer0001", cwd: "/repo/c", timeCreated: 7, timeUpdated: 9 },
			{ sessionId: older, cwd: "/repo/c", timeCreated: 2, timeUpdated: 5 },
		]);
	});

	test("the busiest session comes along even when younger ones crowd the limit", () => {
		seedSession("ses_busy00001", "/repo/e", "Busy");
		db.prepare("UPDATE session SET time_created = 1, time_updated = 90 WHERE id = ?").run("ses_busy00001");
		seedSession("ses_young00001", "/repo/e", "Young");
		db.prepare("UPDATE session SET time_created = 50, time_updated = 60 WHERE id = ?").run("ses_young00001");

		expect(OpencodeDb.rootSessions("/repo/e", 1).map((session) => session.sessionId)).toEqual([
			"ses_young00001",
			"ses_busy00001",
		]);
	});

	test("a task tool names the child session it delegated to", () => {
		seedSession("ses_parent01", "/repo/d", "Parent");
		db.prepare("INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES ('p1', 'ses_parent01', 1, 1, ?)").run(
			JSON.stringify({ role: "assistant", time: { created: 1 } }),
		);
		db.prepare(
			"INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES ('tp1', 'p1', 'ses_parent01', 2, 2, ?)",
		).run(
			JSON.stringify({
				type: "tool",
				tool: "task",
				callID: "call_t",
				state: { status: "completed", metadata: { sessionId: "ses_child001" } },
			}),
		);

		expect(OpencodeDb.subagentSession("ses_parent01", "call_t")).toBe("ses_child001");
		expect(OpencodeDb.subagentSession("ses_parent01", "call_missing")).toBeUndefined();
	});
});
