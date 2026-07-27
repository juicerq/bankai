import type { ShellTrace } from "@main/activity/AgentActivity";

export const TRACE_DWELL_MS = 500;

export const TRACE_QUEUE_CAP = 2;

interface Held {
	shown: ShellTrace;
	shownAt: number;
	queued: ShellTrace[];
}

export interface DwellResult {
	visible: Map<string, ShellTrace>;
	wakeIn?: number;
}

function newest(held: Held): ShellTrace {
	return held.queued.at(-1) ?? held.shown;
}

export class TraceDwell {
	private held = new Map<string, Held>();

	next(input: {
		traces: ReadonlyMap<string, ShellTrace>;
		immediate: ReadonlySet<string>;
		now: number;
	}): DwellResult {
		for (const shellId of this.held.keys()) {
			if (!input.traces.has(shellId)) {
				this.held.delete(shellId);
			}
		}

		let wakeIn: number | undefined;
		const visible = new Map<string, ShellTrace>();
		for (const [shellId, trace] of input.traces) {
			const held = this.held.get(shellId);
			if (!held || input.immediate.has(shellId)) {
				this.held.set(shellId, { shown: trace, shownAt: input.now, queued: [] });
				visible.set(shellId, trace);
				continue;
			}

			if (trace.label !== newest(held).label) {
				held.queued = [...held.queued, trace].slice(-TRACE_QUEUE_CAP);
			}

			const waited = input.now - held.shownAt;
			const due = held.queued.length > 0 && waited >= TRACE_DWELL_MS;
			if (due) {
				held.shown = held.queued.shift() ?? held.shown;
				held.shownAt = input.now;
			}
			if (held.queued.length > 0) {
				const remaining = due ? TRACE_DWELL_MS : TRACE_DWELL_MS - waited;
				wakeIn = Math.min(wakeIn ?? remaining, remaining);
			}

			visible.set(shellId, held.shown);
		}

		if (wakeIn === undefined) {
			return { visible };
		}

		return { visible, wakeIn };
	}
}
