import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { Settings } from "@main/store/settings";
import { assertDefined } from "./utils/assertions";

describe("settings layout", () => {
	it("returns no layout for a fresh store", async () => {
		expect((await Settings.get()).layout).toBeUndefined();
	});

	it("persists a layout patch and reads it back", async () => {
		await Settings.updateLayout({ railWidth: 300, diffWidth: 700, treeWidth: 240, fullscreen: true });

		expect((await Settings.get()).layout).toEqual({
			railWidth: 300,
			diffWidth: 700,
			treeWidth: 240,
			fullscreen: true,
		});
	});

	it("merges partial patches without clobbering the other regions", async () => {
		await Settings.updateLayout({ railWidth: 300 });
		await Settings.updateLayout({ fullscreen: true });
		const merged = await Settings.updateLayout({ diffWidth: 512 });

		expect(merged).toEqual({ railWidth: 300, fullscreen: true, diffWidth: 512 });
	});

	it("keeps window bounds intact when the layout changes", async () => {
		await Settings.update({ windowBounds: { x: 1, y: 2, width: 900, height: 620, maximized: false } });
		await Settings.updateLayout({ railWidth: 260 });

		const settings = await Settings.get();
		expect(settings.windowBounds?.width).toBe(900);
		expect(settings.layout).toEqual({ railWidth: 260 });
	});
});

describe("settings harness", () => {
	it("returns no harness choice for a fresh store", async () => {
		expect((await Settings.get()).harness).toBeUndefined();
	});

	it("persists the harness choice and reads it back", async () => {
		expect(await Settings.updateHarness({ autostart: true, id: "claude" })).toEqual({
			autostart: true,
			id: "claude",
		});
		expect((await Settings.get()).harness).toEqual({ autostart: true, id: "claude" });
	});

	it("replaces the whole choice rather than merging it", async () => {
		await Settings.updateHarness({ autostart: true, id: "claude" });
		await Settings.updateHarness({ autostart: false, id: "codex" });

		expect((await Settings.get()).harness).toEqual({ autostart: false, id: "codex" });
	});

	it("carries a v2 file forward with no harness choice recorded", async () => {
		assertDefined(process.env.DATA_DIR);
		writeFileSync(
			join(process.env.DATA_DIR, "settings.json"),
			JSON.stringify({ version: 2, data: { layout: { railWidth: 260 } } }),
		);

		const settings = await Settings.get();
		expect(settings.layout).toEqual({ railWidth: 260 });
		expect(settings.harness).toBeUndefined();
	});
});
