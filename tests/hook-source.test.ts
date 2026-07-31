import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type } from "arktype";
import { CLAUDE_HOOK_INSTALL, claudeHooks, HOOK_EVENTS, HOOK_SCRIPT_NAME } from "@main/activity/claudeHooks";
import { hookedHarnesses } from "@main/activity/harnessHooks";
import { CLAUDE_HARNESS_ID, CODEX_HARNESS_ID } from "@main/activity/harnessIds";
import { installedSettings, uninstalledSettings } from "@main/activity/hookSettings";
import {
	hookScript,
	hookSpoolDir,
	pruneSpool,
	SPOOL_MAX_BYTES,
	SPOOL_SEPARATOR,
	spoolKey,
	spoolPath,
	spoolPrefix,
} from "@main/activity/HookSource";

const run = promisify(execFile);

const SESSION = "0199e7f9-8b1e-7c22-9f4a-5b2d0d9a1c33";

const REF = { harness: CLAUDE_HARNESS_ID, sessionId: SESSION };

const USER_HOOK = { matcher: "Bash", hooks: [{ type: "command", command: "/home/me/lint.sh" }] };

const hookedSchema = type({
	"hooks?": { "[string]": type({ hooks: type({ command: "string" }).array() }).array() },
});

function bankaiCommands(settings: unknown): string[] {
	return Object.values(hookedSchema.assert(settings).hooks ?? {})
		.flat()
		.flatMap((group) => group.hooks.map((entry) => entry.command))
		.filter((command) => command.includes(HOOK_SCRIPT_NAME));
}

describe("hook settings", () => {
	test("installs one entry per event and keeps the rest of the file", () => {
		const next = installedSettings(
			{ model: "opus", hooks: { PreToolUse: [USER_HOOK] } },
			"/data/bankai-trace.sh",
			CLAUDE_HOOK_INSTALL,
		);

		expect(next.model).toBe("opus");
		expect(bankaiCommands(next)).toEqual(Array(HOOK_EVENTS.length).fill("/data/bankai-trace.sh"));
		expect(hookedSchema.assert(next).hooks?.PreToolUse?.[0]).toEqual(USER_HOOK);
	});

	test("subscribes to the notification that says a dialog opened, with no matcher of its own", () => {
		const next = installedSettings({}, "/data/bankai-trace.sh", CLAUDE_HOOK_INSTALL);
		const installed = type({ hooks: { Notification: "unknown[]" } }).assert(next);

		expect(installed.hooks.Notification).toEqual([{ hooks: [{ type: "command", command: "/data/bankai-trace.sh" }] }]);
	});

	test("installing twice leaves exactly one entry per event", () => {
		const once = installedSettings({}, "/data/bankai-trace.sh", CLAUDE_HOOK_INSTALL);
		const twice = installedSettings(once, "/other/bankai-trace.sh", CLAUDE_HOOK_INSTALL);

		expect(bankaiCommands(twice)).toEqual(Array(HOOK_EVENTS.length).fill("/other/bankai-trace.sh"));
	});

	test("uninstalling removes only bankai's entries", () => {
		const installed = installedSettings(
			{ hooks: { PreToolUse: [USER_HOOK] } },
			"/data/bankai-trace.sh",
			CLAUDE_HOOK_INSTALL,
		);
		const next = uninstalledSettings(installed, HOOK_SCRIPT_NAME);

		expect(next).toEqual({ hooks: { PreToolUse: [USER_HOOK] } });
	});

	test("uninstalling drops the hooks block when nothing else is left", () => {
		const installed = installedSettings({ model: "opus" }, "/data/bankai-trace.sh", CLAUDE_HOOK_INSTALL);

		expect(uninstalledSettings(installed, HOOK_SCRIPT_NAME)).toEqual({ model: "opus" });
	});
});

describe("hook script", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "bankai-hook-"));
		mkdirSync(join(dir, "spool"));
		writeFileSync(join(dir, "hook.sh"), hookScript(join(dir, "spool"), spoolPrefix(CLAUDE_HARNESS_ID)), {
			mode: 0o755,
		});
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	async function fire(payload: string): Promise<void> {
		const child = run("/bin/sh", [join(dir, "hook.sh")]);
		child.child.stdin?.end(payload);

		expect((await child).stderr).toBe("");
	}

	test("appends one record per event, stamped with the moment it ran", async () => {
		const before = Date.now();
		await fire(`{"session_id":"${SESSION}","hook_event_name":"PreToolUse","tool_name":"Read"}`);
		await fire(`{"session_id": "${SESSION}", "hook_event_name": "Stop"}`);

		const records = readFileSync(join(dir, "spool", `claude-${SESSION}.spool`), "utf8")
			.split(SPOOL_SEPARATOR)
			.filter((record) => record.length > 0);

		expect(records).toHaveLength(2);
		for (const record of records) {
			const [stamp, payload] = [record.slice(0, record.indexOf(" ")), record.slice(record.indexOf(" ") + 1)];
			expect(Number(stamp)).toBeGreaterThanOrEqual(before);
			expect(JSON.parse(payload).session_id).toBe(SESSION);
		}
	});

	test("writes nothing and stays silent when the payload has no session", async () => {
		await fire('{"hook_event_name":"Stop"}');

		expect(await readdir(join(dir, "spool"))).toEqual([]);
	});

	test("stays silent when the spool directory is gone", async () => {
		rmSync(join(dir, "spool"), { recursive: true });
		await fire(`{"session_id":"${SESSION}","hook_event_name":"Stop"}`);
	});

	test("stays silent when the spool directory cannot be written", async () => {
		chmodSync(join(dir, "spool"), 0o500);
		await fire(`{"session_id":"${SESSION}","hook_event_name":"Stop"}`);
		chmodSync(join(dir, "spool"), 0o700);
	});
});

describe("installing the source", () => {
	let config: string;

	beforeEach(() => {
		config = mkdtempSync(join(tmpdir(), "bankai-claude-"));
		process.env.CLAUDE_CONFIG_DIR = config;
	});

	afterEach(() => {
		rmSync(config, { recursive: true, force: true });
		delete process.env.CLAUDE_CONFIG_DIR;
	});

	function settings(): Record<string, unknown> {
		return JSON.parse(readFileSync(join(config, "settings.json"), "utf8"));
	}

	test("writes an executable script into bankai's data directory and points the harness at it", async () => {
		await claudeHooks.install();

		const commands = bankaiCommands(settings());
		expect(commands).toHaveLength(HOOK_EVENTS.length);
		const script = commands[0]?.replaceAll("'", "") ?? "";
		expect(script.startsWith(process.env.DATA_DIR ?? "")).toBe(true);
		expect(statSync(script).mode & 0o111).toBeGreaterThan(0);
	});

	test("repairs a script that was deleted", async () => {
		await claudeHooks.install();
		const script = (bankaiCommands(settings())[0] ?? "").replaceAll("'", "");
		rmSync(script);
		await claudeHooks.install();

		expect(readFileSync(script, "utf8")).toBe(hookScript(hookSpoolDir(), spoolPrefix(CLAUDE_HARNESS_ID)));
	});

	test("uninstalling leaves the user's own hooks running", async () => {
		writeFileSync(join(config, "settings.json"), JSON.stringify({ hooks: { PreToolUse: [USER_HOOK] } }));
		await claudeHooks.install();
		await claudeHooks.uninstall();

		expect(settings()).toEqual({ hooks: { PreToolUse: [USER_HOOK] } });
	});

	test("leaves an unreadable settings file untouched", async () => {
		writeFileSync(join(config, "settings.json"), "{ not json");
		const failed = await claudeHooks
			.install()
			.then(() => false)
			.catch(() => true);

		expect(failed).toBe(true);
		expect(readFileSync(join(config, "settings.json"), "utf8")).toBe("{ not json");
	});
});

describe("choosing which harnesses install their hook", () => {
	test("only a harness that has one is ever hooked, and the default is on", () => {
		expect(hookedHarnesses({ autostart: true, id: CLAUDE_HARNESS_ID })).toEqual(new Set([CLAUDE_HARNESS_ID]));
		expect(hookedHarnesses()).toEqual(new Set([CLAUDE_HARNESS_ID]));
	});

	test("the harness's own preference turns it off", () => {
		expect(
			hookedHarnesses({
				autostart: true,
				id: CLAUDE_HARNESS_ID,
				profiles: { [CLAUDE_HARNESS_ID]: { hooks: false } },
			}),
		).toEqual(new Set());
	});

	test("a harness that was never chosen still hooks on its own preference", () => {
		expect(hookedHarnesses({ autostart: true, id: CODEX_HARNESS_ID })).toEqual(new Set([CLAUDE_HARNESS_ID]));
	});
});

describe("pruning the spool", () => {
	beforeEach(() => mkdirSync(hookSpoolDir(), { recursive: true }));

	test("removes files of sessions that no longer exist", async () => {
		writeFileSync(spoolPath(REF), "x");
		writeFileSync(spoolPath({ harness: CLAUDE_HARNESS_ID, sessionId: "dead" }), "x");
		await pruneSpool(new Set([spoolKey(REF)]));

		expect(await readdir(hookSpoolDir())).toEqual([`claude-${SESSION}.spool`]);
	});

	test("keeps every file when no session was discovered", async () => {
		writeFileSync(spoolPath(REF), "x");
		await pruneSpool(new Set());

		expect(await readdir(hookSpoolDir())).toEqual([`claude-${SESSION}.spool`]);
	});

	test("empties a live spool that outgrew its cap", async () => {
		writeFileSync(spoolPath(REF), "x".repeat(SPOOL_MAX_BYTES + 1));
		await pruneSpool(new Set([spoolKey(REF)]));

		expect(statSync(spoolPath(REF)).size).toBe(0);
	});
});
