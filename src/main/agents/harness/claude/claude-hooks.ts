import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { ClaudeConfig } from "@main/agents/harness/claude/claude-config";
import { CodexConfig } from "@main/agents/harness/codex/codex-config";
import { AtomicFile } from "@main/infra/atomic-file";
import { StorePaths } from "@main/store/store-paths";

const INSTALLED_HOOKS = [
	{ config: () => join(ClaudeConfig.dir(), "settings.json"), scriptName: "bankai-trace.sh" },
	{ config: () => join(CodexConfig.dir(), "hooks.json"), scriptName: "bankai-codex-trace.sh" },
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

function settingsWithoutBankaiHooks(current: unknown, scriptName: string): Record<string, unknown> {
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

	await AtomicFile.write(path, written);
}

async function removeInstalledHooks(): Promise<void> {
	await Promise.all(INSTALLED_HOOKS.map(({ config, scriptName }) => removeFromConfig(config(), scriptName)));
	await rm(join(StorePaths.dataDir(), "hooks"), { recursive: true, force: true });
}

export const ClaudeHooks = {
	settingsWithout: settingsWithoutBankaiHooks,
	removeInstalled: removeInstalledHooks,
};
