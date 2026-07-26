import type { HarnessCommand } from "@main/activity/Harness";
import { DEFAULT_HARNESS_SETTINGS, harnessLaunch } from "@main/activity/harnesses";
import { Logger } from "@main/logger";
import { type HarnessSettings, Settings } from "@main/store/settings";
import { shellCommandLine, splitArguments } from "@main/terminal/commandLine";

async function harnessSettings(): Promise<HarnessSettings> {
	const settings = await Settings.get().catch((err) => {
		Logger.warn("terminal:autostart-settings-unreadable", { err: String(err) });
		return null;
	});

	return settings?.harness ?? DEFAULT_HARNESS_SETTINGS;
}

export async function autostartCommandLine(): Promise<string | undefined> {
	const harness = await harnessSettings();
	if (!harness.autostart) {
		return undefined;
	}

	const launch = harnessLaunch(harness.id);
	if (!launch) {
		Logger.warn("terminal:autostart-unknown-harness", { harness: harness.id });
		return undefined;
	}

	return withExtraArguments(launch(), harness.args);
}

export async function harnessCommandLine(command: HarnessCommand, harnessId: string): Promise<string> {
	const harness = await harnessSettings();
	if (harness.id !== harnessId) {
		return shellCommandLine(command);
	}

	return withExtraArguments(command, harness.args);
}

function withExtraArguments(command: HarnessCommand, extra?: string): string {
	return shellCommandLine({
		file: command.file,
		args: [...command.args, ...splitArguments(extra ?? "")],
	});
}
