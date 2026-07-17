import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ClaudeDiscovery } from "@core/harness/claude/discovery";
import { assertDefined } from "./utils/assertions";

async function seedSessions(files: Record<string, string>): Promise<void> {
	assertDefined(process.env.DATA_DIR);
	process.env.CLAUDE_CONFIG_DIR = join(process.env.DATA_DIR, "claude");
	const directory = join(process.env.CLAUDE_CONFIG_DIR, "sessions");
	await mkdir(directory, { recursive: true });
	await Promise.all(Object.entries(files).map(([name, content]) =>
		writeFile(join(directory, name), content)));
}

function realRecord(overrides: Record<string, unknown>): string {
	return JSON.stringify({
		pid: 27977,
		sessionId: "session",
		cwd: "/home/user/project",
		startedAt: 1784282317777,
		procStart: "37690",
		version: "2.1.211",
		peerProtocol: 1,
		kind: "interactive",
		entrypoint: "cli",
		name: "app-0b",
		nameSource: "derived",
		status: "idle",
		updatedAt: 1784290217976,
		statusUpdatedAt: 1784290217976,
		...overrides,
	});
}

describe("ClaudeDiscovery", () => {
	it("parses a production-shaped record and skips a malformed file", async () => {
		await seedSessions({
			"27977.json": realRecord({ sessionId: "live" }),
			"broken.json": "{ not json",
		});

		const records = await ClaudeDiscovery.discover();

		expect(records).toEqual([
			{ pid: 27977, sessionId: "live", procStart: "37690", kind: "interactive" },
		]);
	});

	it("maps an absent kind to interactive and drops a foreign kind", async () => {
		await seedSessions({
			"a.json": realRecord({ sessionId: "absent", kind: undefined }),
			"b.json": realRecord({ sessionId: "foreign", kind: "sdk" }),
		});

		const records = await ClaudeDiscovery.discover();
		const byId = new Map(records.map((record) => [record.sessionId, record]));

		expect(byId.get("absent")?.kind).toBe("interactive");
		expect(byId.get("foreign")).toEqual({ pid: 27977, sessionId: "foreign", procStart: "37690" });
	});

	it("returns nothing when the sessions directory is missing", async () => {
		assertDefined(process.env.DATA_DIR);
		process.env.CLAUDE_CONFIG_DIR = join(process.env.DATA_DIR, "absent-claude");

		expect(await ClaudeDiscovery.discover()).toEqual([]);
	});
});
