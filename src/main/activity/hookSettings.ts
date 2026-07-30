export interface HookInstall {
	scriptName: string;
	events: string[];
	matchedEvents: ReadonlySet<string>;
	matcher: string;
}

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

function withoutBankai(hooks: unknown, scriptName: string): Record<string, unknown> {
	if (!isRecord(hooks)) {
		return {};
	}

	const next: Record<string, unknown> = {};
	for (const [event, groups] of Object.entries(hooks)) {
		if (!Array.isArray(groups)) {
			next[event] = groups;
			continue;
		}

		const kept = groups.filter((group) => !bankaiGroup(group, scriptName));
		if (kept.length > 0) {
			next[event] = kept;
		}
	}

	return next;
}

function withHooks(settings: Record<string, unknown>, hooks: Record<string, unknown>): Record<string, unknown> {
	const next = { ...settings };
	if (Object.keys(hooks).length === 0) {
		delete next.hooks;

		return next;
	}

	next.hooks = hooks;

	return next;
}

function bankaiEntry(event: string, command: string, install: HookInstall): Record<string, unknown> {
	const hooks = [{ type: "command", command }];
	if (install.matchedEvents.has(event)) {
		return { matcher: install.matcher, hooks };
	}

	return { hooks };
}

export function installedSettings(current: unknown, command: string, install: HookInstall): Record<string, unknown> {
	const settings = isRecord(current) ? current : {};
	const hooks = withoutBankai(settings.hooks, install.scriptName);
	for (const event of install.events) {
		const groups = hooks[event];
		hooks[event] = [...(Array.isArray(groups) ? groups : []), bankaiEntry(event, command, install)];
	}

	return withHooks(settings, hooks);
}

export function uninstalledSettings(current: unknown, scriptName: string): Record<string, unknown> {
	const settings = isRecord(current) ? current : {};

	return withHooks(settings, withoutBankai(settings.hooks, scriptName));
}
