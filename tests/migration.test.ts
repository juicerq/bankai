import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type } from "arktype";
import { describe, expect, it } from "vitest";
import { Store } from "@core/store/Store";
import { assertDefined } from "./utils/assertions";

function fixture(name: string, value: unknown): void {
	assertDefined(process.env.DATA_DIR);
	writeFileSync(
		join(process.env.DATA_DIR, `${name}.json`),
		JSON.stringify(value),
	);
}

describe("store envelope migration", () => {
	it("upgrades a v1 file to v2 via the registered migrator", async () => {
		fixture("profile", { version: 1, data: { name: "Alice" } });

		const profileV2 = type({ name: "string", joinedAt: "number" });
		const store = new Store({
			name: "profile",
			version: 2,
			contract: profileV2,
			migrators: {
				1: (raw) => ({ ...(raw as { name: string }), joinedAt: 0 }),
			},
			seed: () => ({ name: "default", joinedAt: 0 }),
		});

		const value = await store.read();
		expect(value).toEqual({ name: "Alice", joinedAt: 0 });
	});

	it("chains migrators across multiple versions", async () => {
		fixture("chained", { version: 1, data: { count: 1 } });

		const finalSchema = type({ count: "number", doubled: "number" });
		const store = new Store({
			name: "chained",
			version: 3,
			contract: finalSchema,
			migrators: {
				1: (raw) => raw,
				2: (raw) => {
					const prev = raw as { count: number };
					return { ...prev, doubled: prev.count * 2 };
				},
			},
			seed: () => ({ count: 0, doubled: 0 }),
		});

		const value = await store.read();
		expect(value).toEqual({ count: 1, doubled: 2 });
	});

	it("throws when the file version is newer than the code version", async () => {
		fixture("ahead", { version: 3, data: {} });

		const store = new Store({
			name: "ahead",
			version: 1,
			contract: type({}),
			migrators: {},
			seed: () => ({}),
		});

		await expect(store.read()).rejects.toThrow(/newer than code version/);
	});

	it("throws when a required migrator is missing", async () => {
		fixture("gap", { version: 1, data: {} });

		const store = new Store({
			name: "gap",
			version: 3,
			contract: type({}),
			migrators: { 2: (raw) => raw },
			seed: () => ({}),
		});

		await expect(store.read()).rejects.toThrow(/missing migrator from v1/);
	});

	it("writes back in the current envelope version after migration", async () => {
		fixture("written-back", { version: 1, data: { value: "old" } });

		const v2 = type({ value: "string", marker: "string" });
		const store = new Store({
			name: "written-back",
			version: 2,
			contract: v2,
			migrators: {
				1: (raw) => ({ ...(raw as { value: string }), marker: "migrated" }),
			},
			seed: () => ({ value: "", marker: "" }),
		});

		await store.mutate((current) => ({ ...current, value: "new" }));

		assertDefined(process.env.DATA_DIR);
		const onDisk = JSON.parse(
			readFileSync(join(process.env.DATA_DIR, "written-back.json"), "utf8"),
		) as { version: number; data: { value: string; marker: string } };

		expect(onDisk.version).toBe(2);
		expect(onDisk.data).toEqual({ value: "new", marker: "migrated" });
	});
});
