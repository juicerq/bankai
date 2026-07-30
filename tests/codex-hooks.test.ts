import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { HOOK_SCRIPT_NAME } from "@main/activity/claudeHooks";
import {
	CODEX_HOOK_EVENTS,
	CODEX_HOOK_INSTALL,
	CODEX_HOOK_SCRIPT_NAME,
	codexHooksPath,
	codexLiveTrace,
} from "@main/activity/codexHooks";
import { CLAUDE_HARNESS_ID, CODEX_HARNESS_ID } from "@main/activity/harnessIds";
import { tracedHarnesses } from "@main/activity/liveTrace";
import { hookScript, hookSpoolDir, NAMING_ENV, SPOOL_SEPARATOR, spoolPrefix } from "@main/activity/HookSource";

const run = promisify(execFile);

const SESSION = "019fb42f-6131-7b33-aca6-154f86ed4f64";

const USER_HOOK = {
	matcher: "Edit|Write",
	hooks: [{ type: "command", command: "~/.codex/hooks/forward-event.sh", timeout: 2 }],
};

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "bankai-codex-home-"));
	process.env.CODEX_HOME = home;
});

afterEach(async () => {
	await codexLiveTrace.uninstall().catch(() => {});
	rmSync(home, { recursive: true, force: true });
	delete process.env.CODEX_HOME;
});

interface HookGroup {
	matcher?: string;
	hooks?: { command?: string }[];
}

interface CodexHooksFile {
	schemaVersion?: number;
	hooks?: Record<string, HookGroup[]>;
}

function hooks(): CodexHooksFile {
	return JSON.parse(readFileSync(codexHooksPath(), "utf8"));
}

function events(): Record<string, HookGroup[]> {
	return hooks().hooks ?? {};
}

function bankaiCommands(file: CodexHooksFile): string[] {
	return Object.values(file.hooks ?? {})
		.flatMap((event) => event.flatMap((group) => group.hooks ?? []))
		.flatMap((entry) => entry.command ?? [])
		.filter((command) => command.includes(CODEX_HOOK_SCRIPT_NAME));
}

describe("installing the codex hook", () => {
	test("registers one group per event it reads, and no Notification", async () => {
		await codexLiveTrace.install();

		expect(Object.keys(events()).sort()).toEqual([...CODEX_HOOK_EVENTS].sort());
		expect(Object.keys(events())).not.toContain("Notification");
	});

	test("writes an executable script into bankai's data directory and points codex at it", async () => {
		await codexLiveTrace.install();

		const script = (bankaiCommands(hooks())[0] ?? "").replaceAll("'", "");
		expect(script.startsWith(process.env.DATA_DIR ?? "")).toBe(true);
		expect(statSync(script).mode & 0o111).toBeGreaterThan(0);
		expect(readFileSync(script, "utf8")).toBe(hookScript(hookSpoolDir(), spoolPrefix(CODEX_HARNESS_ID)));
	});

	test("matches every tool on the events that carry one", async () => {
		await codexLiveTrace.install();

		const file = events();
		for (const event of CODEX_HOOK_EVENTS) {
			const group = file[event]?.at(-1);
			expect(group?.matcher).toBe(
				CODEX_HOOK_INSTALL.matchedEvents.has(event) ? CODEX_HOOK_INSTALL.matcher : undefined,
			);
		}
	});

	test("keeps the user's own hook first so codex's trust keys never shift", async () => {
		writeFileSync(codexHooksPath(), JSON.stringify({ hooks: { PostToolUse: [USER_HOOK] } }));
		await codexLiveTrace.install();

		expect(events().PostToolUse?.[0]).toEqual(USER_HOOK);
	});

	test("leaves unknown fields of the file exactly as they were", async () => {
		writeFileSync(codexHooksPath(), JSON.stringify({ schemaVersion: 3, hooks: {} }));
		await codexLiveTrace.install();

		expect(hooks().schemaVersion).toBe(3);
	});

	test("installing twice leaves one group per event", async () => {
		await codexLiveTrace.install();
		await codexLiveTrace.install();

		expect(bankaiCommands(hooks())).toHaveLength(CODEX_HOOK_EVENTS.length);
	});

	test("repairs a script that was deleted", async () => {
		await codexLiveTrace.install();
		const script = (bankaiCommands(hooks())[0] ?? "").replaceAll("'", "");
		rmSync(script);
		await codexLiveTrace.install();

		expect(readFileSync(script, "utf8")).toBe(hookScript(hookSpoolDir(), spoolPrefix(CODEX_HARNESS_ID)));
	});

	test("leaves an unreadable hooks file untouched", async () => {
		writeFileSync(codexHooksPath(), "{ not json");
		const failed = await codexLiveTrace
			.install()
			.then(() => false)
			.catch(() => true);

		expect(failed).toBe(true);
		expect(readFileSync(codexHooksPath(), "utf8")).toBe("{ not json");
	});

	test("writes nothing when the user configured hooks inline in config.toml", async () => {
		writeFileSync(join(home, "config.toml"), 'model = "gpt-5.6"\n\n[[hooks.PreToolUse]]\ncommand = "mine.sh"\n');
		await codexLiveTrace.install();

		expect(await readdir(home)).toEqual(["config.toml"]);
	});

	test("installs beside the trust bookkeeping codex writes into config.toml itself", async () => {
		writeFileSync(
			join(home, "config.toml"),
			'model = "gpt-5.6"\n\n[hooks.state]\n\n[hooks.state."/x/hooks.json:stop:0:0"]\ntrusted_hash = "sha256:aa"\n',
		);
		await codexLiveTrace.install();

		expect(bankaiCommands(hooks())).toHaveLength(CODEX_HOOK_EVENTS.length);
	});
});

describe("removing the codex hook", () => {
	test("leaves the user's own hooks running and takes the script with it", async () => {
		writeFileSync(codexHooksPath(), JSON.stringify({ hooks: { PostToolUse: [USER_HOOK] } }));
		await codexLiveTrace.install();
		const script = (bankaiCommands(hooks())[0] ?? "").replaceAll("'", "");
		await codexLiveTrace.uninstall();

		expect(hooks()).toEqual({ hooks: { PostToolUse: [USER_HOOK] } });
		expect(() => statSync(script)).toThrow();
	});

	test("removes only this harness's spool", async () => {
		mkdirSync(hookSpoolDir(), { recursive: true });
		writeFileSync(join(hookSpoolDir(), `codex-${SESSION}.spool`), "x");
		writeFileSync(join(hookSpoolDir(), `claude-${SESSION}.spool`), "x");
		await codexLiveTrace.uninstall();

		expect(await readdir(hookSpoolDir())).toEqual([`claude-${SESSION}.spool`]);
	});
});

describe("the codex hook script itself", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "bankai-codex-hook-"));
		mkdirSync(join(dir, "spool"));
		writeFileSync(join(dir, "hook.sh"), hookScript(join(dir, "spool"), spoolPrefix(CODEX_HARNESS_ID)), {
			mode: 0o755,
		});
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	async function fire(payload: string, env?: Record<string, string>): Promise<void> {
		const child = run("/bin/sh", [join(dir, "hook.sh")], { env: { ...process.env, ...env } });
		child.child.stdin?.end(payload);

		expect((await child).stderr).toBe("");
	}

	test("spools a real codex payload under a name no other harness can collide with", async () => {
		await fire(
			JSON.stringify({
				session_id: SESSION,
				turn_id: "019fb42f-6281-70a0-9179-41e3cc7f8b51",
				transcript_path: null,
				cwd: "/tmp/codex-name-probe",
				hook_event_name: "UserPromptSubmit",
				model: "gpt-5.6-sol",
				permission_mode: "bypassPermissions",
				prompt: "reply with just the word ok",
			}),
		);

		expect(await readdir(join(dir, "spool"))).toEqual([`codex-${SESSION}.spool`]);
		const records = readFileSync(join(dir, "spool", `codex-${SESSION}.spool`), "utf8")
			.split(SPOOL_SEPARATOR)
			.filter((record) => record.length > 0);
		expect(records).toHaveLength(1);
	});

	test("writes nothing for the naming helper's own ephemeral session", async () => {
		await fire(JSON.stringify({ session_id: SESSION, hook_event_name: "Stop" }), { [NAMING_ENV]: "1" });

		expect(await readdir(join(dir, "spool"))).toEqual([]);
	});

	test("writes nothing and stays silent for a payload with no session", async () => {
		await fire('{"hook_event_name":"Stop"}');

		expect(await readdir(join(dir, "spool"))).toEqual([]);
	});
});

describe("the two harnesses' hook scripts", () => {
	test("carry names neither one can mistake for the other", () => {
		expect(CODEX_HOOK_SCRIPT_NAME).not.toBe(HOOK_SCRIPT_NAME);
		expect(CODEX_HOOK_SCRIPT_NAME.includes(HOOK_SCRIPT_NAME)).toBe(false);
		expect(HOOK_SCRIPT_NAME.includes(CODEX_HOOK_SCRIPT_NAME)).toBe(false);
	});
});

describe("choosing which harnesses trace live", () => {
	test("each harness's own preference decides, and the default is on", () => {
		expect(tracedHarnesses({ autostart: true, id: CLAUDE_HARNESS_ID })).toEqual(
			new Set([CLAUDE_HARNESS_ID, CODEX_HARNESS_ID]),
		);
		expect(
			tracedHarnesses({
				autostart: true,
				id: CLAUDE_HARNESS_ID,
				profiles: { [CODEX_HARNESS_ID]: { liveTrace: false } },
			}),
		).toEqual(new Set([CLAUDE_HARNESS_ID]));
	});

	test("a harness that was never chosen still traces on its own preference", () => {
		expect(
			tracedHarnesses({
				autostart: true,
				id: CODEX_HARNESS_ID,
				profiles: { [CLAUDE_HARNESS_ID]: { liveTrace: false } },
			}),
		).toEqual(new Set([CODEX_HARNESS_ID]));
	});

	test("no stored choice traces both", () => {
		expect(tracedHarnesses()).toEqual(new Set([CLAUDE_HARNESS_ID, CODEX_HARNESS_ID]));
	});
});
