import { useState } from "react";
import type { HarnessId } from "@core/harness/registry";
import { Logger } from "@core/logger";
import { Settings } from "@core/store/settings";

export function useSettingsOverlay(initialDefaultHarness: HarnessId) {
	const [open, setOpen] = useState(false);
	const [defaultHarness, setDefaultHarness] = useState(initialDefaultHarness);

	return {
		open,
		defaultHarness,

		show() {
			setOpen(true);
		},

		close() {
			setOpen(false);
		},

		select(harness: HarnessId) {
			setDefaultHarness(harness);
			Settings.setDefaultHarness(harness)
				.catch((err) => Logger.error("settings:save-failed", String(err)));
		},
	};
}
