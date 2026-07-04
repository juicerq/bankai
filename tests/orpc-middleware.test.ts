import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertDefined } from "./utils/assertions";
import { testClient } from "./utils/orpc";

type LogLine = {
	ts: number;
	severity: string;
	message: string;
	data?: { err?: string };
};

function logPath(): string {
	assertDefined(process.env.DATA_DIR);
	return join(process.env.DATA_DIR, "log.ndjson");
}

function readLog(): LogLine[] {
	return readFileSync(logPath(), "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as LogLine);
}

describe("orpc error middleware", () => {
	it("logs orpc:<path> when a handler throws", async () => {
		assertDefined(process.env.DATA_DIR);
		writeFileSync(join(process.env.DATA_DIR, "settings.json"), "{not-json");

		await expect(testClient.settings.get()).rejects.toThrow();

		const events = readLog();
		const errLine = events.find((e) => e.message === "orpc:settings.get");
		assertDefined(errLine);
		expect(errLine.severity).toBe("error");
		expect(errLine.data?.err).toBeTruthy();
	});

	it("does not log when the handler resolves", async () => {
		await testClient.todos.list();

		if (!existsSync(logPath())) {
			return;
		}
		const orpcErrors = readLog().filter((e) => e.message.startsWith("orpc:"));
		expect(orpcErrors.length).toBe(0);
	});
});
