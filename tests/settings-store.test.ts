import { describe, expect, it } from "vitest";
import { Settings } from "@core/store/settings";

describe("Settings", () => {
	it("seeds claude as the default harness", async () => {
		expect(await Settings.read()).toEqual({ defaultHarness: "claude" });
	});

	it("persists a changed default harness, read back from disk", async () => {
		await Settings.setDefaultHarness("pi");

		expect(await Settings.read()).toEqual({ defaultHarness: "pi" });
	});
});
