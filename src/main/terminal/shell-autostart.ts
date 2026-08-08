import type { HarnessCommand } from "@main/agents/harness/harness";
import { Harnesses } from "@main/agents/harness/harnesses";
import { Logger } from "@main/infra/logger";
import { HarnessSettings } from "@main/settings/harness-settings";
import { ShellCommandLine } from "@main/terminal/shell-command-line";
import type { ContinuityShell } from "@shared/continuity";
import { type HarnessSettings as HarnessSettingsValue, harnessProfile } from "@shared/settings";

async function harnessSettings(): Promise<HarnessSettingsValue> {
	const harness = await HarnessSettings.get().catch((err) => {
		Logger.warn("terminal:autostart-settings-unreadable", { err: String(err) });
		return null;
	});

	return harness ?? Harnesses.DEFAULT_HARNESS_SETTINGS;
}

async function autostartCommandLine(): Promise<string | undefined> {
	const harness = await harnessSettings();
	if (!harness.autostart) {
		return undefined;
	}

	const launch = Harnesses.get(harness.id)?.launch;
	if (!launch) {
		Logger.warn("terminal:autostart-unknown-harness", { harness: harness.id });
		return undefined;
	}

	return withExtraArguments(launch(), harnessProfile(harness, harness.id).args);
}

async function shellLaunchLine(shell: Partial<Pick<ContinuityShell, "plain" | "launch">> | undefined) {
	// A command shell launches its saved command; a plain shell launches nothing;
	// everything else gets the configured harness.
	if (shell?.launch) {
		return shell.launch;
	}

	if (shell?.plain) {
		return;
	}

	return await autostartCommandLine();
}

async function harnessCommandLine(command: HarnessCommand, harnessId: string): Promise<string> {
	// A session resumes under the harness that owns it, with that harness's arguments,
	// whichever harness is currently selected for new shells.
	return withExtraArguments(command, harnessProfile(await harnessSettings(), harnessId).args);
}

function withExtraArguments(command: HarnessCommand, extra?: string): string {
	return ShellCommandLine.of({
		file: command.file,
		args: [...command.args, ...ShellCommandLine.split(extra ?? "")],
	});
}

export const ShellAutostart = {
	commandLine: autostartCommandLine,
	launchLine: shellLaunchLine,
	harnessLine: harnessCommandLine,
};
