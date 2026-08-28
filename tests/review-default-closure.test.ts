import { describe, expect, it } from "bun:test";
import { ReviewDefaultClosure } from "@shared/review-default-closure";

describe("review default closure", () => {
	it("matches files exactly and directories by descendant boundary", () => {
		const targets = [
			{ kind: "file" as const, path: "README" },
			{ kind: "directory" as const, path: "src/app" },
		];

		expect(ReviewDefaultClosure.matches(targets, "README")).toBe(true);
		expect(ReviewDefaultClosure.matches(targets, "README.md")).toBe(false);
		expect(ReviewDefaultClosure.matches(targets, "src/app/index.ts")).toBe(true);
		expect(ReviewDefaultClosure.matches(targets, "src/application.ts")).toBe(false);
	});

	it("lets a manual choice override the stored default", () => {
		const targets = [{ kind: "directory" as const, path: "generated" }];
		const overrides = new Map<string, boolean>([
			["generated/open.ts", false],
			["src/closed.ts", true],
		]);

		expect(ReviewDefaultClosure.closedFiles(
			["generated/open.ts", "generated/closed.ts", "src/closed.ts", "src/open.ts"],
			targets,
			overrides,
		)).toEqual(new Set(["generated/closed.ts", "src/closed.ts"]));
	});

	it("adds and removes only the exact target", () => {
		const parent = { kind: "directory" as const, path: "src" };
		const child = { kind: "file" as const, path: "src/index.ts" };
		const withBoth = ReviewDefaultClosure.update([parent], child, true);

		expect(withBoth).toEqual([parent, child]);
		expect(ReviewDefaultClosure.update(withBoth, parent, false)).toEqual([child]);
		expect(ReviewDefaultClosure.has(withBoth, child)).toBe(true);
	});
});
