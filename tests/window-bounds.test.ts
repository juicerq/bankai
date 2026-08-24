import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { WindowBoundsStore } from "@main/desktop/window-bounds-store";
import { SettingsStore } from "@main/store/settings-store";
import type { WindowBounds } from "@shared/settings";
import { assertDefined } from "./utils/assertions";

const BOUNDS: WindowBounds = { x: 10, y: 20, width: 1200, height: 800, maximized: false };
const OLD_BOUNDS: WindowBounds = { x: 1, y: 2, width: 900, height: 620, maximized: true };

test("a fresh install has no remembered bounds", async () => {
	expect(await WindowBoundsStore.read()).toBeUndefined();
});

test("bounds saved to the window store read back", async () => {
	await WindowBoundsStore.save(BOUNDS);

	expect(await WindowBoundsStore.read()).toEqual(BOUNDS);
});

test("bounds left in settings.json still open the window on the first read", async () => {
	await SettingsStore.mutate((current) => ({ ...current, windowBounds: OLD_BOUNDS }));

	expect(await WindowBoundsStore.read()).toEqual(OLD_BOUNDS);
});

test("an unreadable window store opens the window at its default size", async () => {
	assertDefined(process.env.DATA_DIR);
	writeFileSync(join(process.env.DATA_DIR, "window.json"), "{ not json");

	expect(await WindowBoundsStore.read()).toBeUndefined();
});

test("once the window store holds bounds, the ones in settings.json are ignored", async () => {
	await SettingsStore.mutate((current) => ({ ...current, windowBounds: OLD_BOUNDS }));
	await WindowBoundsStore.save(BOUNDS);

	expect(await WindowBoundsStore.read()).toEqual(BOUNDS);
});
