import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { HarnessSettings } from "@main/settings/harness-settings";
import { LayoutSettings } from "@main/settings/layout-settings";
import { PushSettings } from "@main/settings/push-settings";
import { ServerSettings } from "@main/settings/server-settings";
import { ThemeSettings } from "@main/settings/theme-settings";
import { SettingsStore } from "@main/store/settings-store";
import { SERVER_DEFAULT_PORT, SERVER_TOKEN_BYTES } from "@shared/server";
import { DEFAULT_THEME } from "@shared/theme";
import { assertDefined } from "./utils/assertions";

describe("settings layout", () => {
	it("returns no layout for a fresh store", async () => {
		expect((await SettingsStore.read()).layout).toBeUndefined();
	});

	it("persists a layout patch and reads it back", async () => {
		await LayoutSettings.update({ railWidth: 300, diffWidth: 700, treeWidth: 240, fullscreen: true });

		expect((await SettingsStore.read()).layout).toEqual({
			railWidth: 300,
			diffWidth: 700,
			treeWidth: 240,
			fullscreen: true,
		});
	});

	it("merges partial patches without clobbering the other regions", async () => {
		await LayoutSettings.update({ railWidth: 300 });
		await LayoutSettings.update({ fullscreen: true });
		const merged = await LayoutSettings.update({ diffWidth: 512 });

		expect(merged).toEqual({ railWidth: 300, fullscreen: true, diffWidth: 512 });
	});
});

describe("settings harness", () => {
	it("returns no harness choice for a fresh store", async () => {
		expect((await SettingsStore.read()).harness).toBeUndefined();
	});

	it("persists the harness choice and reads it back", async () => {
		expect(await HarnessSettings.update({ autostart: true, id: "claude" })).toEqual({
			autostart: true,
			id: "claude",
		});
		expect((await SettingsStore.read()).harness).toEqual({ autostart: true, id: "claude" });
	});

	it("replaces the whole choice rather than merging it", async () => {
		await HarnessSettings.update({ autostart: true, id: "claude" });
		await HarnessSettings.update({ autostart: false, id: "codex" });

		expect((await SettingsStore.read()).harness).toEqual({ autostart: false, id: "codex" });
	});

	it("drops the extra arguments when the choice is saved without them", async () => {
		const profiles = { claude: { args: "--model opus" } };
		await HarnessSettings.update({ autostart: true, id: "claude", profiles });
		expect((await SettingsStore.read()).harness).toEqual({ autostart: true, id: "claude", profiles });

		await HarnessSettings.update({ autostart: true, id: "claude" });
		expect((await SettingsStore.read()).harness).toEqual({ autostart: true, id: "claude" });
	});

	it("keeps each harness profile apart", async () => {
		const profiles = {
			claude: { args: "--model opus" },
			codex: { args: "--model gpt-5.6" },
		};
		await HarnessSettings.update({ autostart: true, id: "codex", profiles });

		expect((await SettingsStore.read()).harness).toEqual({ autostart: true, id: "codex", profiles });
	});

	it("moves a v4 flat harness choice into the profile of the harness it belonged to", async () => {
		assertDefined(process.env.DATA_DIR);
		writeFileSync(
			join(process.env.DATA_DIR, "settings.json"),
			JSON.stringify({
				version: 4,
				data: { harness: { autostart: true, id: "claude", args: "--model opus", liveTrace: false } },
			}),
		);

		expect((await SettingsStore.read()).harness).toEqual({
			autostart: true,
			id: "claude",
			profiles: { claude: { args: "--model opus" } },
		});
	});

	it("drops the live trace choice a v5 file still carries", async () => {
		assertDefined(process.env.DATA_DIR);
		writeFileSync(
			join(process.env.DATA_DIR, "settings.json"),
			JSON.stringify({
				version: 5,
				data: {
					harness: {
						autostart: true,
						id: "claude",
						profiles: { claude: { args: "--model opus", liveTrace: false }, codex: { args: "--model gpt-5.6" } },
					},
				},
			}),
		);

		expect((await SettingsStore.read()).harness).toEqual({
			autostart: true,
			id: "claude",
			profiles: { claude: { args: "--model opus" }, codex: { args: "--model gpt-5.6" } },
		});
	});

	it("carries a v2 file forward with no harness choice recorded", async () => {
		assertDefined(process.env.DATA_DIR);
		writeFileSync(
			join(process.env.DATA_DIR, "settings.json"),
			JSON.stringify({ version: 2, data: { layout: { railWidth: 260 } } }),
		);

		const settings = await SettingsStore.read();
		expect(settings.layout).toEqual({ railWidth: 260 });
		expect(settings.harness).toBeUndefined();
	});
});

describe("settings theme", () => {
	it("opens on the default theme until a choice is stored", async () => {
		expect((await SettingsStore.read()).theme).toBeUndefined();
		expect(await ThemeSettings.get()).toBe(DEFAULT_THEME);
	});

	it("persists the chosen theme and reads it back", async () => {
		expect(await ThemeSettings.update("light")).toBe("light");
		expect(await ThemeSettings.get()).toBe("light");

		await ThemeSettings.update("system");

		expect(await ThemeSettings.get()).toBe("system");
	});

	it("keeps the rest of the settings when the theme changes", async () => {
		await HarnessSettings.update({ autostart: true, id: "claude" });
		await ThemeSettings.update("light");

		expect((await SettingsStore.read()).harness).toEqual({ autostart: true, id: "claude" });
	});

	it("leaves a v6 file on the dark theme it was already showing", async () => {
		assertDefined(process.env.DATA_DIR);
		writeFileSync(
			join(process.env.DATA_DIR, "settings.json"),
			JSON.stringify({
				version: 6,
				data: { layout: { railWidth: 260 }, harness: { autostart: true, id: "claude" } },
			}),
		);

		const settings = await SettingsStore.read();

		expect(settings.theme).toBe("dark");
		expect(settings.layout).toEqual({ railWidth: 260 });
		expect(settings.harness).toEqual({ autostart: true, id: "claude" });
	});
});

describe("settings server", () => {
	afterEach(() => {
		delete process.env.SERVER_PORT;
	});

	it("lets the environment move the port off the stored one, and refuses a value that is not a port", () => {
		expect(ServerSettings.port(5000)).toBe(5000);

		process.env.SERVER_PORT = "4700";

		expect(ServerSettings.port(5000)).toBe(4700);

		process.env.SERVER_PORT = "nope";

		expect(() => ServerSettings.port(5000)).toThrow("SERVER_PORT");
	});

	it("generates the token once and keeps it across calls", async () => {
		const first = await ServerSettings.ensure();
		const second = await ServerSettings.ensure();

		expect(first.token).toHaveLength(SERVER_TOKEN_BYTES * 2);
		expect(second.token).toBe(first.token);
		expect((await SettingsStore.read()).server?.token).toBe(first.token);
	});

	it("defaults the port and honours a configured one", async () => {
		expect((await ServerSettings.ensure()).port).toBe(SERVER_DEFAULT_PORT);

		await SettingsStore.mutate((current) => ({ ...current, server: { token: "kept", port: 5000 } }));

		expect(await ServerSettings.ensure()).toEqual({ port: 5000, token: "kept" });
	});

	it("mints a new token on regeneration and keeps the configured port", async () => {
		await SettingsStore.mutate((current) => ({ ...current, server: { token: "revoked", port: 5000 } }));

		const regenerated = await ServerSettings.regenerateToken();

		expect(regenerated.port).toBe(5000);
		expect(regenerated.token).toHaveLength(SERVER_TOKEN_BYTES * 2);
		expect(regenerated.token).not.toBe("revoked");
		expect(await ServerSettings.ensure()).toEqual(regenerated);
	});
});

describe("settings vapid", () => {
	it("mints the keypair once and leaves the file untouched afterwards", async () => {
		assertDefined(process.env.DATA_DIR);
		const path = join(process.env.DATA_DIR, "settings.json");
		const minted = { publicKey: "public", privateKey: "private" };

		expect(await PushSettings.ensureKeys(() => minted)).toEqual(minted);
		const writtenAt = statSync(path, { bigint: true }).mtimeNs;

		expect(await PushSettings.ensureKeys(() => ({ publicKey: "other", privateKey: "other" }))).toEqual(minted);
		expect(statSync(path, { bigint: true }).mtimeNs).toBe(writtenAt);
	});
});
