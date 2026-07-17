import { describe, expect, it } from "vitest";
import { CodexDiscovery } from "@core/harness/codex/discovery";
import { codexSessionId } from "@core/harness/codex/records";

describe("codexSessionId", () => {
	it("reads the id from a session_meta first line", () => {
		expect(codexSessionId(JSON.stringify({
			type: "session_meta",
			payload: { id: "abc-123" },
		}))).toBe("abc-123");
	});

	it("returns null for a non-meta record and for malformed json", () => {
		expect(codexSessionId(JSON.stringify({ type: "event_msg", payload: {} }))).toBeNull();
		expect(codexSessionId("{ not json")).toBeNull();
	});
});

describe("CodexDiscovery", () => {
	it("resolves to an array against the live process table", async () => {
		expect(Array.isArray(await CodexDiscovery.discover())).toBe(true);
	});
});
