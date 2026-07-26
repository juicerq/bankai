import { DEFAULT_HARNESS_SETTINGS, harnessLaunch } from "@main/activity/harnesses";
import { Logger } from "@main/logger";
import { Settings } from "@main/store/settings";
import { shellCommandLine } from "@main/terminal/commandLine";

export async function autostartCommandLine(): Promise<string | undefined> {
	const settings = await Settings.get().catch((err) => {
		Logger.warn("terminal:autostart-settings-unreadable", { err: String(err) });
		return null;
	});
	const harness = settings?.harness ?? DEFAULT_HARNESS_SETTINGS;
	if (!harness.autostart) {
		return undefined;
	}

	const launch = harnessLaunch(harness.id);
	if (!launch) {
		Logger.warn("terminal:autostart-unknown-harness", { harness: harness.id });
		return undefined;
	}

	return shellCommandLine(launch());
}
