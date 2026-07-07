import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Logger } from "@core/logger";
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
		const event = JSON.parse(first) as {
			ts: number;
			severity: string;
			message: string;
			data: { code: number };
		};

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
		const event = JSON.parse(first) as Record<string, unknown>;

		expect(event).not.toHaveProperty("data");
		expect(event.severity).toBe("info");
	});
});
