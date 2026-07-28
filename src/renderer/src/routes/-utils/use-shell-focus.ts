import { useMemo, useSyncExternalStore } from "react";
import { activityStream } from "@renderer/lib/stream/activity";
import { streamResync } from "@renderer/lib/stream/resync";

export const FOCUS_IDLE_MS = 60_000;

const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

export function useShellFocus(shellId?: string) {
	const reporter = useMemo(() => new ShellFocusReporter(shellId), [shellId]);

	useSyncExternalStore(reporter.subscribe, reporter.getSnapshot);
}

class ShellFocusReporter {
	private published: string | undefined;
	private lastInputAt = Date.now();
	private idleTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(private readonly shellId?: string) {}

	readonly getSnapshot = () => this.shellId;

	readonly subscribe = () => {
		const stopResync = streamResync.register("watch", this.resync);

		this.noteInput();
		document.addEventListener("visibilitychange", this.publish);
		window.addEventListener("focus", this.noteInput);
		window.addEventListener("blur", this.publish);
		for (const event of INPUT_EVENTS) {
			document.addEventListener(event, this.noteInput, { passive: true });
		}

		return () => {
			stopResync();
			document.removeEventListener("visibilitychange", this.publish);
			window.removeEventListener("focus", this.noteInput);
			window.removeEventListener("blur", this.publish);
			for (const event of INPUT_EVENTS) {
				document.removeEventListener(event, this.noteInput);
			}

			clearTimeout(this.idleTimer);
			this.idleTimer = undefined;
			activityStream.focusShell();
		};
	};

	private readonly resync = () => {
		this.published = undefined;
		this.publish();
	};

	private readonly noteInput = () => {
		this.lastInputAt = Date.now();
		this.arm(FOCUS_IDLE_MS);
		this.publish();
	};

	private readonly publish = () => {
		const next = this.watching() ? this.shellId : undefined;
		if (next === this.published) {
			return;
		}

		this.published = next;
		activityStream.focusShell(next);
	};

	private readonly expire = () => {
		this.idleTimer = undefined;
		const remaining = this.lastInputAt + FOCUS_IDLE_MS - Date.now();

		if (remaining > 0) {
			this.arm(remaining);

			return;
		}

		this.publish();
	};

	private watching(): boolean {
		return (
			document.visibilityState === "visible" &&
			document.hasFocus() &&
			Date.now() - this.lastInputAt < FOCUS_IDLE_MS
		);
	}

	private arm(delay: number): void {
		if (this.idleTimer) {
			return;
		}

		this.idleTimer = setTimeout(this.expire, delay);
	}
}
