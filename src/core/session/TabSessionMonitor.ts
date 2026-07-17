import { sameSession, sessionKey, type SessionRef } from "@core/harness/registry";
import { procFs } from "@core/proc/procFs";
import { SessionBinder } from "@core/session/SessionBinder";
import type { WorkspaceExecution } from "@core/store/workspace";

export type TabCapture =
	| { state: "empty" }
	| { state: "bound"; session: SessionRef; running?: WorkspaceExecution };

type SessionObservation = { session: SessionRef; alive: boolean };

export type TabSessionPoll = {
	captures: Record<string, TabCapture>;
	observations: SessionObservation[];
};

function sameExecution(left: WorkspaceExecution, right: WorkspaceExecution): boolean {
	if (left.kind !== right.kind) {
		return false;
	}

	return (left.argv?.join("\0") ?? "") === (right.argv?.join("\0") ?? "");
}

function sameCaptures(
	left: Record<string, TabCapture>,
	right: Record<string, TabCapture>,
): boolean {
	const keys = Object.keys(left);
	if (keys.length !== Object.keys(right).length) {
		return false;
	}

	for (const key of keys) {
		const a = left[key];
		const b = right[key];
		if (!a || !b || a.state !== b.state) {
			return false;
		}
		if (a.state === "empty" || b.state === "empty") {
			continue;
		}
		if (!sameSession(a.session, b.session)) {
			return false;
		}
		if (a.running && b.running) {
			if (!sameExecution(a.running, b.running)) {
				return false;
			}
		} else if (a.running !== b.running) {
			return false;
		}
	}

	return true;
}

export function retainTabSessions(
	tabs: { tabId: string }[],
	running: Record<string, TabCapture>,
	previous: Record<string, TabCapture>,
): Record<string, TabCapture> {
	return Object.fromEntries(tabs.map(({ tabId }) => {
		const live = running[tabId];
		const prior = previous[tabId];
		return [tabId, live ?? (prior?.state === "bound"
			? { state: "bound", session: prior.session }
			: { state: "empty" })];
	}));
}

export class TabSessionMonitor {
	private captures: Record<string, TabCapture>;
	private queue = Promise.resolve();

	constructor(initialCaptures: Record<string, TabCapture>) {
		this.captures = initialCaptures;
	}

	poll(tabs: { tabId: string; pid: number }[]): Promise<TabSessionPoll> {
		const next = this.queue.catch(() => {}).then(() => this.pollNow(tabs));
		this.queue = next.then(() => {});
		return next;
	}

	private async pollNow(tabs: { tabId: string; pid: number }[]): Promise<TabSessionPoll> {
		const bindings = await SessionBinder.resolveMany(tabs);
		const running: Record<string, TabCapture> = {};

		await Promise.all(Object.entries(bindings).map(async ([tabId, binding]) => {
			const execution: WorkspaceExecution = {};
			const argv = await procFs.cmdline(binding.pid);
			if (argv) {
				execution.argv = argv;
			}
			if (binding.kind !== undefined) {
				execution.kind = binding.kind;
			}

			running[tabId] = {
				state: "bound",
				session: binding.session,
				running: execution,
			};
		}));

		const next = retainTabSessions(tabs, running, this.captures);
		const live = new Set(Object.values(running).flatMap((capture) =>
			capture.state === "bound" ? [sessionKey(capture.session)] : [],
		));
		const sessions = new Map<string, SessionRef>();

		for (const capture of [...Object.values(this.captures), ...Object.values(running)]) {
			if (capture.state === "bound") {
				sessions.set(sessionKey(capture.session), capture.session);
			}
		}

		if (!sameCaptures(this.captures, next)) {
			this.captures = next;
		}

		return {
			captures: this.captures,
			observations: [...sessions].map(([key, session]) => ({
				session,
				alive: live.has(key),
			})),
		};
	}
}
