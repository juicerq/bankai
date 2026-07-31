import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { claudeConfigDir } from "@main/activity/claudeConfig";
import { codexConfigDir } from "@main/activity/codexConfig";
import { atomicWrite } from "@main/store/atomic";
import { resolveDataDir } from "@main/store/paths";

const INSTALLED_HOOKS = [
	{ config: () => join(claudeConfigDir(), "settings.json"), scriptName: "bankai-trace.sh" },
	{ config: () => join(codexConfigDir(), "hooks.json"), scriptName: "bankai-codex-trace.sh" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bankaiGroup(group: unknown, scriptName: string): boolean {
	if (!isRecord(group) || !Array.isArray(group.hooks)) {
		return false;
	}

	return group.hooks.some(
		(entry) => isRecord(entry) && typeof entry.command === "string" && entry.command.includes(scriptName),
	);
}

export function settingsWithoutBankaiHooks(current: unknown, scriptName: string): Record<string, unknown> {
	const settings = isRecord(current) ? current : {};
	const hooks: Record<string, unknown> = {};

	for (const [event, groups] of Object.entries(isRecord(settings.hooks) ? settings.hooks : {})) {
		if (!Array.isArray(groups)) {
			hooks[event] = groups;
			continue;
		}

		const kept = groups.filter((group) => !bankaiGroup(group, scriptName));
		if (kept.length > 0) {
			hooks[event] = kept;
		}
	}

	const next = { ...settings };
	if (Object.keys(hooks).length === 0) {
		delete next.hooks;

		return next;
	}

	next.hooks = hooks;

	return next;
}

async function removeFromConfig(path: string, scriptName: string): Promise<void> {
	const raw = await readFile(path, "utf8").catch((err: unknown) => {
		if (!(err instanceof Error && "code" in err && err.code === "ENOENT")) {
			throw err;
		}

		return null;
	});
	if (raw === null) {
		return;
	}

	const current = JSON.parse(raw);
	const written = `${JSON.stringify(settingsWithoutBankaiHooks(current, scriptName), null, 2)}\n`;
	if (written === `${JSON.stringify(current, null, 2)}\n`) {
		return;
	}

	await atomicWrite(path, written);
}

export async function removeInstalledHooks(): Promise<void> {
	await Promise.all(INSTALLED_HOOKS.map(({ config, scriptName }) => removeFromConfig(config(), scriptName)));
	await rm(join(resolveDataDir(), "hooks"), { recursive: true, force: true });
}
