import { describe, expect, test } from "bun:test";
import { ClaudeHarness } from "@main/activity/claude";
import { harnessResume } from "@main/activity/harnesses";
import { assertDefined } from "./utils/assertions";

const VALID_SESSION_ID = "67af1e51-358c-475f-b33a-7de1e199d0a5";

describe("claude resume command", () => {
	test("builds the native resume argv for a valid session id", () => {
		const resume = ClaudeHarness.resume;
		assertDefined(resume);

		expect(resume({ sessionId: VALID_SESSION_ID })).toEqual({
			file: "claude",
			args: ["--resume", VALID_SESSION_ID],
		});
	});

	test("rejects session ids that are not plain uuids", () => {
		const resume = ClaudeHarness.resume;
		assertDefined(resume);

		expect(resume({ sessionId: "" })).toBeNull();
		expect(resume({ sessionId: "not-a-uuid" })).toBeNull();
		expect(resume({ sessionId: "../../etc/passwd" })).toBeNull();
		expect(resume({ sessionId: "--dangerously-skip-permissions" })).toBeNull();
		expect(resume({ sessionId: `${VALID_SESSION_ID} --print` })).toBeNull();
		expect(resume({ sessionId: `${VALID_SESSION_ID}\n--print` })).toBeNull();
	});
});

describe("harness resume lookup", () => {
	test("resolves the claude resume capability", () => {
		expect(harnessResume("claude")).toBe(ClaudeHarness.resume);
	});

	test("returns nothing for an unknown harness", () => {
		expect(harnessResume("aider")).toBeUndefined();
	});
});
