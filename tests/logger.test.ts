import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type } from "arktype";
import { describe, expect, it } from "bun:test";
import { LOGGER_MAX_SIZE_BYTES, Logger } from "@main/infra/logger";
import { assertDefined } from "./utils/assertions";

describe("logger", () => {
	it("appends a JSONL line with ts, severity, message and data", () => {
		Logger.error("boom", { code: 42 });

		assertDefined(process.env.DATA_DIR);
		const raw = readFileSync(join(process.env.DATA_DIR, "log.ndjson"), "utf8");
		const lines = raw.trim().split("\n");

		expect(lines.length).toBe(1);
		const [first] = lines;
		assertDefined(first);
		const event = type({
			ts: "number",
			severity: "string",
			message: "string",
			data: type({ code: "number" }),
		}).assert(JSON.parse(first));

		expect(event.severity).toBe("error");
		expect(event.message).toBe("boom");
		expect(event.data.code).toBe(42);
		expect(event.ts).toBeGreaterThan(0);
	});

	it("omits data when not provided", () => {
		Logger.info("plain");

		assertDefined(process.env.DATA_DIR);
		const raw = readFileSync(join(process.env.DATA_DIR, "log.ndjson"), "utf8");
		const [first] = raw.trim().split("\n");
		assertDefined(first);
		const event = type({
			ts: "number",
			severity: "string",
			message: "string",
		}).assert(JSON.parse(first));

		expect(event).not.toHaveProperty("data");
		expect(event.severity).toBe("info");
	});

	it("stays quiet when it can resolve no path to write to", () => {
		const restore = process.env.DATA_DIR;
		delete process.env.DATA_DIR;

		expect(() => Logger.info("nowhere to write")).not.toThrow();

		process.env.DATA_DIR = restore;
	});

	it("writes to its own file when it runs inside the daemon", () => {
		process.env.BANKAI_DAEMON = "1";

		Logger.info("from the daemon");

		delete process.env.BANKAI_DAEMON;
		assertDefined(process.env.DATA_DIR);
		const raw = readFileSync(join(process.env.DATA_DIR, "log-daemon.ndjson"), "utf8");

		expect(raw).toContain("from the daemon");
		expect(existsSync(join(process.env.DATA_DIR, "log.ndjson"))).toBe(false);
	});

	it("rotates before an append would exceed the size limit", () => {
		assertDefined(process.env.DATA_DIR);
		const path = join(process.env.DATA_DIR, "log.ndjson");
		writeFileSync(path, "x".repeat(LOGGER_MAX_SIZE_BYTES - 4));

		Logger.info("next");

		expect(statSync(path).size).toBeLessThanOrEqual(LOGGER_MAX_SIZE_BYTES);
		expect(statSync(`${path}.old`).size).toBe(LOGGER_MAX_SIZE_BYTES - 4);
	});
});
