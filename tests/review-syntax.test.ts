import { describe, expect, it } from "bun:test";
import type { DiffLine } from "@main/git/git-contracts";
import { reviewLanguage } from "@renderer/routes/-utils/review-language";
import { highlightDiff } from "@renderer/routes/-utils/review-syntax";

describe("review syntax", () => {
	it("selects a grammar from the filename without guessing unknown files", () => {
		expect(reviewLanguage("src/review-panel.tsx")).toBe("tsx");
		expect(reviewLanguage("Dockerfile")).toBe("dockerfile");
		expect(reviewLanguage("fixtures/data.unknown")).toBeUndefined();
	});

	it("keeps multiline grammar state separate for old and new hunk sides", async () => {
		const lines: DiffLine[] = [
			{ kind: "context", number: 1, oldNumber: 1, hunk: 0, content: "const value = /*" },
			{ kind: "remove", oldNumber: 2, hunk: 0, content: "old comment" },
			{ kind: "add", number: 2, hunk: 0, content: "new comment" },
			{ kind: "context", number: 3, oldNumber: 3, hunk: 0, content: "*/ 1" },
		];

		const highlighted = await highlightDiff(lines, "typescript");

		expect(highlighted[1]).toContainEqual({ length: "old comment".length, tone: "comment" });
		expect(highlighted[2]).toContainEqual({ length: "new comment".length, tone: "comment" });
		expect(highlighted[3]?.[0]?.tone).toBe("comment");
	});
});
