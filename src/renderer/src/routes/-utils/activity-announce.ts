import { useMemo, useSyncExternalStore } from "react";
import type { AgentActivityState } from "@shared/activity";

export const ANNOUNCE_ENTER_MS = 16;
export const ANNOUNCE_HOLD_MS = 2200;
export const ANNOUNCE_EXIT_MS = 300;

export type AnnouncePhase = "enter" | "announce" | "residue" | "leaving";

export interface ActivityAnnounce {
	state: AgentActivityState;
	phase: AnnouncePhase;
}

export function useActivityAnnounce(projectIds: string[]): ReadonlyMap<string, ActivityAnnounce> {
	const key = [...projectIds].sort().join(" ");
	const controller = useMemo(
		() => new ActivityAnnounceController(key ? key.split(" ") : []),
		[key],
	);

	return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}

class ActivityAnnounceController {
	private snapshot: ReadonlyMap<string, ActivityAnnounce> = new Map();
	private notify: (() => void) | undefined;
	private readonly pending = new Map<string, () => void>();

	constructor(private readonly projectIds: string[]) {}

	readonly getSnapshot = () => this.snapshot;

	readonly subscribe = (notify: () => void) => {
		this.notify = notify;
		const stopListening = window.bankaiActivity.onChanged((event) => {
			if (this.projectIds.includes(event.projectId)) {
				this.receive(event.projectId, event.state, true);
			}
		});

		for (const projectId of this.projectIds) {
			window.bankaiActivity.watch(projectId)
				.then((snapshot) => this.receive(projectId, snapshot.state, false))
				.catch((err) => console.error("Failed to watch agent activity", err));
		}

		return () => {
			stopListening();
			this.notify = undefined;
			for (const cancel of this.pending.values()) {
				cancel();
			}
			this.pending.clear();
			for (const projectId of this.projectIds) {
				window.bankaiActivity.unwatch(projectId);
			}
		};
	};

	private receive(projectId: string, state: AgentActivityState | null, live: boolean) {
		const previous = this.snapshot.get(projectId);

		if (!live) {
			if (state !== null && !previous) {
				this.write(projectId, { state, phase: "residue" });
			}
			return;
		}

		if (state === null) {
			if (!previous || previous.phase === "leaving") {
				return;
			}

			this.cancelPending(projectId);
			this.write(projectId, { state: previous.state, phase: "leaving" });
			this.after(projectId, ANNOUNCE_EXIT_MS, () => this.write(projectId));
			return;
		}

		if (previous && previous.state === state && previous.phase !== "leaving") {
			return;
		}

		this.cancelPending(projectId);
		if (previous) {
			this.announce(projectId, state);
			return;
		}

		this.write(projectId, { state, phase: "enter" });
		this.after(projectId, ANNOUNCE_ENTER_MS, () => this.announce(projectId, state));
	}

	private announce(projectId: string, state: AgentActivityState) {
		this.write(projectId, { state, phase: "announce" });
		this.after(projectId, ANNOUNCE_HOLD_MS, () => this.write(projectId, { state, phase: "residue" }));
	}

	private after(projectId: string, delay: number, run: () => void) {
		const timer = setTimeout(() => {
			this.pending.delete(projectId);
			run();
		}, delay);
		this.pending.set(projectId, () => clearTimeout(timer));
	}

	private cancelPending(projectId: string) {
		const cancel = this.pending.get(projectId);
		if (cancel) {
			cancel();
			this.pending.delete(projectId);
		}
	}

	private write(projectId: string, value?: ActivityAnnounce) {
		const next = new Map(this.snapshot);
		if (value === undefined) {
			next.delete(projectId);
		} else {
			next.set(projectId, value);
		}
		this.snapshot = next;
		this.notify?.();
	}
}
