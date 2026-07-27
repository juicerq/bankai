import { chmod, mkdir, readdir, readFile, rm, stat, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { claudeConfigDir } from "@main/activity/claudeConfig";
import {
	HOOK_SCRIPT_NAME,
	hookScript,
	installedSettings,
	shellQuoted,
	uninstalledSettings,
} from "@main/activity/claudeHooks";
import { Logger } from "@main/logger";
import { atomicWrite } from "@main/store/atomic";
import { resolveDataDir } from "@main/store/paths";

const SPOOL_SUFFIX = ".spool";

export const SPOOL_MAX_BYTES = 1024 * 1024;

export function hookSpoolDir(): string {
	return join(resolveDataDir(), "hooks", "spool");
}

export function spoolPath(sessionId: string): string {
	return join(hookSpoolDir(), `${sessionId}${SPOOL_SUFFIX}`);
}

function hookScriptPath(): string {
	return join(resolveDataDir(), "hooks", HOOK_SCRIPT_NAME);
}

function claudeSettingsPath(): string {
	return join(claudeConfigDir(), "settings.json");
}

async function readClaudeSettings(path: string): Promise<unknown> {
	const raw = await readFile(path, "utf8").catch((err: unknown) => {
		if (!missingFile(err)) {
			throw err;
		}

		return null;
	});
	if (raw === null) {
		return {};
	}

	return JSON.parse(raw);
}

async function rewriteClaudeSettings(next: (current: unknown) => Record<string, unknown>): Promise<void> {
	const path = claudeSettingsPath();
	const current = await readClaudeSettings(path);
	const written = `${JSON.stringify(next(current), null, 2)}\n`;
	if (written === `${JSON.stringify(current, null, 2)}\n`) {
		return;
	}

	await atomicWrite(path, written);
}

export async function installHookSource(): Promise<void> {
	const script = hookScriptPath();
	await mkdir(hookSpoolDir(), { recursive: true });
	await writeFile(script, hookScript(hookSpoolDir()), { mode: 0o755 });
	await chmod(script, 0o755);
	await rewriteClaudeSettings((current) => installedSettings(current, shellQuoted(script)));
}

export async function uninstallHookSource(): Promise<void> {
	await rewriteClaudeSettings(uninstalledSettings);
	await rm(hookScriptPath(), { force: true });
	await clearSpool();
}

export async function applyHookSource(enabled: boolean): Promise<void> {
	const apply = enabled ? installHookSource() : uninstallHookSource();
	await apply.catch((err: unknown) => {
		Logger.error("hook-source:apply-failed", { enabled, err: String(err) });
	});
}

async function spoolFiles(): Promise<string[]> {
	const entries = await readdir(hookSpoolDir()).catch((): string[] => []);

	return entries.filter((entry) => entry.endsWith(SPOOL_SUFFIX));
}

async function clearSpool(): Promise<void> {
	const files = await spoolFiles();
	await Promise.all(files.map((file) => rm(join(hookSpoolDir(), file), { force: true })));
}

export async function pruneSpool(live: ReadonlySet<string>): Promise<void> {
	if (live.size === 0) {
		return;
	}

	const files = await spoolFiles();
	await Promise.all(files.map(async (file) => {
		const path = join(hookSpoolDir(), file);
		if (!live.has(file.slice(0, -SPOOL_SUFFIX.length))) {
			await rm(path, { force: true });
			return;
		}

		const size = await stat(path).then(({ size }) => size).catch(() => 0);
		if (size > SPOOL_MAX_BYTES) {
			await truncate(path, 0);
		}
	}));
}

function missingFile(err: unknown): boolean {
	return err instanceof Error && "code" in err && err.code === "ENOENT";
}
