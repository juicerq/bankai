export const HOOK_SCRIPT_NAME = "bankai-trace.sh";

export const HOOK_EVENTS = ["UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "Notification"];

const MATCHED_EVENTS = new Set(["PreToolUse", "PostToolUse"]);

export const SPOOL_SEPARATOR = "\0";

export function shellQuoted(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export function hookScript(spoolDir: string): string {
	return [
		"#!/bin/sh",
		`d=${shellQuoted(spoolDir)}`,
		"p=$(cat)",
		"r=${p#*session_id}",
		"r=${r#*:}",
		'r=${r#*\\"}',
		's=${r%%\\"*}',
		'case "$s" in',
		"\t*[!0-9a-fA-F-]*|\"\") exit 0 ;;",
		"esac",
		"[ ${#s} -eq 36 ] || exit 0",
		`printf '%s %s\\0' "$(date +%s%3N)" "$p" 2>/dev/null >>"$d/$s.spool"`,
		"exit 0",
		"",
	].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bankaiGroup(group: unknown): boolean {
	if (!isRecord(group) || !Array.isArray(group.hooks)) {
		return false;
	}

	return group.hooks.some((entry) =>
		isRecord(entry) && typeof entry.command === "string" && entry.command.includes(HOOK_SCRIPT_NAME)
	);
}

function withoutBankai(hooks: unknown): Record<string, unknown> {
	if (!isRecord(hooks)) {
		return {};
	}

	const next: Record<string, unknown> = {};
	for (const [event, groups] of Object.entries(hooks)) {
		if (!Array.isArray(groups)) {
			next[event] = groups;
			continue;
		}

		const kept = groups.filter((group) => !bankaiGroup(group));
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

function bankaiEntry(event: string, command: string): Record<string, unknown> {
	const hooks = [{ type: "command", command }];
	if (MATCHED_EVENTS.has(event)) {
		return { matcher: "*", hooks };
	}

	return { hooks };
}

export function installedSettings(current: unknown, command: string): Record<string, unknown> {
	const settings = isRecord(current) ? current : {};
	const hooks = withoutBankai(settings.hooks);
	for (const event of HOOK_EVENTS) {
		const groups = hooks[event];
		hooks[event] = [...(Array.isArray(groups) ? groups : []), bankaiEntry(event, command)];
	}

	return withHooks(settings, hooks);
}

export function uninstalledSettings(current: unknown): Record<string, unknown> {
	const settings = isRecord(current) ? current : {};

	return withHooks(settings, withoutBankai(settings.hooks));
}
