import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { HOOK_COMMAND, HOOK_EVENTS } from "@core/hooks/HookGateway";
import { atomicWrite } from "@core/store/atomic";

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
	if (!value || typeof value !== "object") {
		return false;
	}

	return !Array.isArray(value);
}

function settingsPath(): string {
	return join(homedir(), ".claude", "settings.json");
}

async function readSettings(path: string): Promise<Rec> {
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return {};
		}
		throw err;
	}

	const parsed: unknown = JSON.parse(raw);
	if (!isRec(parsed)) {
		throw new Error("~/.claude/settings.json is not a JSON object");
	}

	return parsed;
}

function ownsCommand(group: unknown): boolean {
	const hooks = isRec(group) && Array.isArray(group.hooks) ? group.hooks : [];
	return hooks.some((hook) => isRec(hook) && hook.command === HOOK_COMMAND);
}

function groupFor(matcher: string | undefined) {
	const hooks = [{ type: "command", command: HOOK_COMMAND }];
	return matcher ? { matcher, hooks } : { hooks };
}

export const HookInstaller = {
	async install(): Promise<void> {
		const path = settingsPath();
		const settings = await readSettings(path);
		const hooks = isRec(settings.hooks) ? settings.hooks : {};
		let changed = false;

		for (const { event, matcher } of HOOK_EVENTS) {
			const groups = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : [];
			if (groups.some(ownsCommand)) {
				continue;
			}

			groups.push(groupFor(matcher));
			hooks[event] = groups;
			changed = true;
		}

		if (!changed) {
			return;
		}

		settings.hooks = hooks;
		await atomicWrite(path, `${JSON.stringify(settings, null, 2)}\n`);
	},
};
