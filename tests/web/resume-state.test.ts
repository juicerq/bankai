import { describe, expect, test } from "bun:test";
import {
	initialResumeState,
	nextResumeState,
	resumeNoticeVariant,
} from "@renderer/routes/-features/sessions/lifecycle/resume-state";

const NO_SESSION = "No resumable agent session for this shell";

describe("resume state machine", () => {
	test("mounts resuming only when a session ref is present", () => {
		expect(initialResumeState(true)).toEqual({ phase: "resuming" });
		expect(initialResumeState(false)).toEqual({ phase: "plain" });
	});

	test("a successful automatic resume settles as resumed", () => {
		expect(nextResumeState({ phase: "resuming" }, { kind: "resumed" })).toEqual({ phase: "resumed" });
	});

	test("a failed automatic resume offers a retry and keeps the reason", () => {
		expect(nextResumeState({ phase: "resuming" }, { kind: "failed", reason: NO_SESSION })).toEqual({
			phase: "failed-retryable",
			reason: NO_SESSION,
		});
	});

	test("requesting a retry moves into retrying only from the retryable state, carrying the reason", () => {
		expect(nextResumeState({ phase: "failed-retryable", reason: NO_SESSION }, { kind: "retry" })).toEqual({
			phase: "retrying",
			reason: NO_SESSION,
		});
		expect(nextResumeState({ phase: "resuming" }, { kind: "retry" })).toEqual({ phase: "resuming" });
		expect(nextResumeState({ phase: "failed-final", reason: NO_SESSION }, { kind: "retry" })).toEqual({
			phase: "failed-final",
			reason: NO_SESSION,
		});
	});

	test("the manual retry can still succeed", () => {
		expect(nextResumeState({ phase: "retrying", reason: NO_SESSION }, { kind: "resumed" })).toEqual({ phase: "resumed" });
	});

	test("a failed manual retry is final and adopts the latest reason", () => {
		expect(nextResumeState({ phase: "retrying", reason: NO_SESSION }, { kind: "failed", reason: "still broken" })).toEqual({
			phase: "failed-final",
			reason: "still broken",
		});
	});

	test("terminal states ignore further outcomes", () => {
		expect(nextResumeState({ phase: "resumed" }, { kind: "failed", reason: NO_SESSION })).toEqual({ phase: "resumed" });
		expect(nextResumeState({ phase: "plain" }, { kind: "failed", reason: NO_SESSION })).toEqual({ phase: "plain" });
		expect(nextResumeState({ phase: "failed-final", reason: "final" }, { kind: "resumed" })).toEqual({
			phase: "failed-final",
			reason: "final",
		});
	});

	test("only the two failure states surface an inline notice", () => {
		expect(resumeNoticeVariant({ phase: "failed-retryable", reason: NO_SESSION })).toBe("failed-retryable");
		expect(resumeNoticeVariant({ phase: "failed-final", reason: NO_SESSION })).toBe("failed-final");
		expect(resumeNoticeVariant({ phase: "resuming" })).toBeNull();
		expect(resumeNoticeVariant({ phase: "resumed" })).toBeNull();
		expect(resumeNoticeVariant({ phase: "plain" })).toBeNull();
		expect(resumeNoticeVariant({ phase: "retrying" })).toBeNull();
	});
});
