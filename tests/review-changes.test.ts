import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "bun:test";
import { REVIEW_CHANGE_DEBOUNCE_MS, ReviewChanges } from "@main/git/ReviewChanges";
import { assertDefined } from "./utils/assertions";

it("debounces recursive project filesystem changes into one invalidation", async () => {
	assertDefined(process.env.DATA_DIR);
	const project = join(process.env.DATA_DIR, "observed");
	const nested = join(project, "src");
	mkdirSync(nested, { recursive: true });

	let notifications = 0;
	const change = Promise.withResolvers<void>();
	const unsubscribe = ReviewChanges.subscribe(project, () => {
		notifications += 1;
		change.resolve();
	});

	try {
		writeFileSync(join(nested, "first.txt"), "first\n");
		writeFileSync(join(nested, "second.txt"), "second\n");
		const result = await Promise.race([
			change.promise.then(() => "changed" as const),
			new Promise<"timeout">((resolve) => {
				setTimeout(() => resolve("timeout"), REVIEW_CHANGE_DEBOUNCE_MS * 8);
			}),
		]);

		expect(result).toBe("changed");
		expect(notifications).toBe(1);
	} finally {
		unsubscribe();
	}
});
