import { useMemo, useSyncExternalStore } from "react";
import { activityStream } from "@renderer/lib/stream/activity";
import { streamResync } from "@renderer/lib/stream/resync";

export function useShellFocus(shellId: string) {
	const reporter = useMemo(() => new ShellFocusReporter(shellId), [shellId]);

	useSyncExternalStore(reporter.subscribe, reporter.getSnapshot);
}

class ShellFocusReporter {
	constructor(private readonly shellId: string) {}

	readonly getSnapshot = () => this.shellId;

	readonly subscribe = () => {
		const stopResync = streamResync.register("watch", this.report);

		this.report();
		document.addEventListener("visibilitychange", this.report);

		return () => {
			stopResync();
			document.removeEventListener("visibilitychange", this.report);
			activityStream.focusShell();
		};
	};

	private readonly report = () => {
		activityStream.focusShell(document.visibilityState === "visible" ? this.shellId : undefined);
	};
}
