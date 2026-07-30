import { chmod, mkdir, open, readdir, readFile, rm, stat, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Logger } from "@main/logger";
import { atomicWrite } from "@main/store/atomic";
import { resolveDataDir } from "@main/store/paths";

const SPOOL_SUFFIX = ".spool";

export const SPOOL_SEPARATOR = "\0";

export const SPOOL_MAX_BYTES = 1024 * 1024;

export function hookSpoolDir(): string {
	return join(resolveDataDir(), "hooks", "spool");
}

export function spoolKey(ref: { harness: string; sessionId: string }): string {
	return `${spoolPrefix(ref.harness)}${ref.sessionId}`;
}

export function spoolPrefix(harnessId: string): string {
	return `${harnessId}-`;
}

export function spoolPath(ref: { harness: string; sessionId: string }): string {
	return join(hookSpoolDir(), `${spoolKey(ref)}${SPOOL_SUFFIX}`);
}

export function hookScriptPath(scriptName: string): string {
	return join(resolveDataDir(), "hooks", scriptName);
}

export async function writeHookScript(scriptName: string, contents: string): Promise<void> {
	const path = hookScriptPath(scriptName);
	await mkdir(hookSpoolDir(), { recursive: true });
	await writeFile(path, contents, { mode: 0o755 });
	await chmod(path, 0o755);
}

export function shellQuoted(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export const NAMING_ENV = "BANKAI_NAMING";

export function hookScript(spoolDir: string, prefix: string): string {
	return [
		"#!/bin/sh",
		`[ -n "\${${NAMING_ENV}}" ] && exit 0`,
		`d=${shellQuoted(spoolDir)}`,
		"p=$(cat)",
		"r=${p#*session_id}",
		"r=${r#*:}",
		'r=${r#*\\"}',
		's=${r%%\\"*}',
		'case "$s" in',
		'\t*[!0-9a-fA-F-]*|"") exit 0 ;;',
		"esac",
		"[ ${#s} -eq 36 ] || exit 0",
		`printf '%s %s\\0' "$(date +%s%3N)" "$p" 2>/dev/null >>"$d/${prefix}$s.spool"`,
		"exit 0",
		"",
	].join("\n");
}

async function readJsonConfig(path: string): Promise<unknown> {
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

export async function rewriteJsonConfig(
	path: string,
	next: (current: unknown) => Record<string, unknown>,
): Promise<void> {
	const current = await readJsonConfig(path);
	const written = `${JSON.stringify(next(current), null, 2)}\n`;
	if (written === `${JSON.stringify(current, null, 2)}\n`) {
		return;
	}

	await atomicWrite(path, written);
}

async function spoolFiles(): Promise<string[]> {
	const entries = await readdir(hookSpoolDir()).catch((): string[] => []);

	return entries.filter((entry) => entry.endsWith(SPOOL_SUFFIX));
}

export async function clearSpool(harnessId: string): Promise<void> {
	const files = await spoolFiles();
	await Promise.all(
		files
			.filter((file) => file.startsWith(spoolPrefix(harnessId)))
			.map((file) => rm(join(hookSpoolDir(), file), { force: true })),
	);
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

const SPOOL_TAIL_BYTES = 16 * 1024;

export async function readSpoolTail(path: string): Promise<string | null> {
	const handle = await open(path, "r").catch((err: unknown) => {
		if (!missingFile(err)) {
			Logger.warn("hook-spool:unreadable", { path, err: String(err) });
		}

		return null;
	});
	if (!handle) {
		return null;
	}

	try {
		const { size } = await handle.stat();
		const length = Math.min(size, SPOOL_TAIL_BYTES);
		const { buffer, bytesRead } = await handle.read({ buffer: Buffer.alloc(length), position: size - length });

		return buffer.toString("utf8", 0, bytesRead);
	} finally {
		await handle.close();
	}
}

function missingFile(err: unknown): boolean {
	return err instanceof Error && "code" in err && err.code === "ENOENT";
}
