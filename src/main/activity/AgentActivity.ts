import { ATTENTION_SCAN_WINDOW, matchesAttentionPrompt } from "@main/activity/attention";
import type { AgentPresence } from "@main/activity/Harness";
import { bindShells, childrenByParent } from "@main/activity/SessionBinder";
import { discoverAgents } from "@main/activity/harnesses";
import { procFs } from "@main/activity/procFs";
import { reconcileSessionRefs, type SessionRef } from "@main/activity/SessionRefs";
import { Logger } from "@main/logger";
import { Continuity } from "@main/store/continuity";
import { TerminalSessions } from "@main/terminal/TerminalSessions";
import type { AgentActivityState, ProjectActivitySnapshot } from "@shared/activity";

const ACTIVITY_POLL_MS = 1500;

const ATTENTION_TAIL = 64;

const AGGREGATE_PRIORITY: AgentActivityState[] = ["needs-attention", "done-unseen", "working"];

type BoundStatus = "working" | "waiting" | "idle";

function deriveShellActivity(
	previous: AgentActivityState | undefined,
	bound: BoundStatus | undefined,
): AgentActivityState | undefined {
	if (bound === "working") {
		return "working";
	}
	if (bound === "waiting") {
		return previous;
	}

	const wasActive = previous === "working" || previous === "needs-attention";
	if (!wasActive) {
		return previous;
	}
	if (bound === "idle") {
		return "done-unseen";
	}

	return undefined;
}

export function nextShellActivity(
	previous: AgentActivityState | undefined,
	bound: BoundStatus | undefined,
	viewed: boolean,
	attention: boolean,
): AgentActivityState | undefined {
	if (attention && bound === "waiting") {
		return "needs-attention";
	}

	const next = deriveShellActivity(previous, bound);
	if (next === "done-unseen" && viewed) {
		return undefined;
	}

	return next;
}

export function aggregateProjectActivity(
	states: AgentActivityState[],
): AgentActivityState | null {
	for (const priority of AGGREGATE_PRIORITY) {
		if (states.includes(priority)) {
			return priority;
		}
	}

	return null;
}

function sameSnapshot(
	before: ProjectActivitySnapshot | undefined,
	after: ProjectActivitySnapshot | undefined,
): boolean {
	if ((before?.state ?? null) !== (after?.state ?? null)) {
		return false;
	}

	const beforeShells = before?.shells ?? {};
	const afterShells = after?.shells ?? {};
	const beforeKeys = Object.keys(beforeShells);
	if (beforeKeys.length !== Object.keys(afterShells).length) {
		return false;
	}

	return beforeKeys.every((sessionId) => beforeShells[sessionId] === afterShells[sessionId]);
}

function emptySnapshot(): ProjectActivitySnapshot {
	return { state: null, shells: {} };
}

type ActivityListener = (snapshot: ProjectActivitySnapshot) => void;

class AgentActivityTracker {
	private shellStates = new Map<string, AgentActivityState>();
	private projectSnapshots = new Map<string, ProjectActivitySnapshot>();
	private readonly listeners = new Map<string, Set<ActivityListener>>();
	private readonly attention = new Set<string>();
	private readonly attentionTail = new Map<string, string>();
	private boundSessions = new Set<string>();
	private sessionRefs = new Map<string, SessionRef>();
	private viewed: string | undefined;
	private timer: ReturnType<typeof setInterval> | undefined;
	private ticking = false;

	noteData(sessionId: string, data: string): void {
		if (!this.boundSessions.has(sessionId)) {
			return;
		}

		const combined = (this.attentionTail.get(sessionId) ?? "") + data;
		const window = combined.length > ATTENTION_SCAN_WINDOW
			? combined.slice(-ATTENTION_SCAN_WINDOW)
			: combined;
		if (matchesAttentionPrompt(window)) {
			this.attention.add(sessionId);
		}
		this.attentionTail.set(sessionId, combined.slice(-ATTENTION_TAIL));
	}

	start(): void {
		if (process.platform !== "linux" || this.timer) {
			return;
		}

		this.timer = setInterval(() => this.runTick(), ACTIVITY_POLL_MS);
		this.timer.unref();
	}

	getProjectSnapshot(projectId: string): ProjectActivitySnapshot {
		return this.projectSnapshots.get(projectId) ?? emptySnapshot();
	}

	subscribe(projectId: string, listener: ActivityListener): () => void {
		const set = this.listeners.get(projectId) ?? new Set<ActivityListener>();
		set.add(listener);
		this.listeners.set(projectId, set);

		return () => {
			const current = this.listeners.get(projectId);
			if (!current) {
				return;
			}
			current.delete(listener);
			if (current.size === 0) {
				this.listeners.delete(projectId);
			}
		};
	}

	markViewed(sessionId: string): void {
		this.viewed = sessionId;
		if (this.shellStates.get(sessionId) !== "done-unseen") {
			return;
		}

		const cleared = new Map(this.shellStates);
		cleared.delete(sessionId);
		this.commit(cleared, this.shellProjects());
	}

	private runTick(): void {
		if (this.ticking) {
			return;
		}

		this.ticking = true;
		this.tick()
			.catch((err) => Logger.error("activity:tick-failed", { err: String(err) }))
			.finally(() => {
				this.ticking = false;
			});
	}

	private async tick(): Promise<void> {
		const shells = TerminalSessions.list();
		const shellProjects = new Map(shells.map((shell) => [shell.sessionId, shell.projectId]));
		if (shells.length === 0) {
			this.boundSessions = new Set();
			this.sessionRefs = new Map();
			this.attention.clear();
			this.attentionTail.clear();
			this.commit(new Map(), shellProjects);
			return;
		}

		const presences = await discoverAgents();
		const liveByPid = new Map<number, AgentPresence>();
		await Promise.all(presences.map(async (presence) => {
			const start = await procFs.procStart(presence.pid);
			if (start !== null && start === presence.procStart) {
				liveByPid.set(presence.pid, presence);
			}
		}));
		const livePids = new Set(liveByPid.keys());

		const foregrounds = await Promise.all(shells.map(async (shell) => ({
			sessionId: shell.sessionId,
			pid: shell.pid,
			foreground: await procFs.foreground(shell.pid),
		})));
		const needsWalk = foregrounds.some(
			(shell) => shell.foreground !== null && shell.foreground !== shell.pid && !livePids.has(shell.foreground),
		);
		const children = needsWalk ? await childrenByParent() : new Map<number, number[]>();
		const bindings = bindShells(foregrounds, livePids, children);
		this.boundSessions = new Set(bindings.keys());
		this.pruneAttention(shellProjects);

		const nextStates = new Map<string, AgentActivityState>();
		for (const shell of shells) {
			const boundPid = bindings.get(shell.sessionId);
			const bound = boundPid === undefined ? undefined : liveByPid.get(boundPid)?.status;
			if (bound !== "waiting") {
				this.attention.delete(shell.sessionId);
			}
			const next = nextShellActivity(
				this.shellStates.get(shell.sessionId),
				bound,
				shell.sessionId === this.viewed,
				this.attention.has(shell.sessionId),
			);
			if (next !== undefined) {
				nextStates.set(shell.sessionId, next);
			}
		}

		this.captureSessionRefs(shells, bindings, liveByPid);
		this.commit(nextStates, shellProjects);
	}

	private captureSessionRefs(
		shells: { sessionId: string; shellId: string; projectId: string }[],
		bindings: Map<string, number>,
		liveByPid: Map<number, AgentPresence>,
	): void {
		const observations = shells.map((shell) => {
			const boundPid = bindings.get(shell.sessionId);
			const presence = boundPid === undefined ? undefined : liveByPid.get(boundPid);

			return {
				shellId: shell.shellId,
				projectId: shell.projectId,
				session: presence
					? { harness: presence.harness, sessionId: presence.sessionId, cwd: presence.cwd }
					: undefined,
			};
		});

		const { changes, next } = reconcileSessionRefs(this.sessionRefs, observations);
		this.sessionRefs = next;

		for (const change of changes) {
			const persist = change.kind === "upsert"
				? Continuity.setShellSession({ projectId: change.projectId, shellId: change.shellId, session: change.session })
				: Continuity.clearShellSession({ projectId: change.projectId, shellId: change.shellId });
			persist.catch((err) => Logger.error("activity:session-ref-persist-failed", { err: String(err) }));
		}
	}

	private shellProjects(): Map<string, string> {
		return new Map(TerminalSessions.list().map((shell) => [shell.sessionId, shell.projectId]));
	}

	private pruneAttention(present: Map<string, string>): void {
		for (const sessionId of this.attention) {
			if (!present.has(sessionId)) {
				this.attention.delete(sessionId);
			}
		}
		for (const sessionId of this.attentionTail.keys()) {
			if (!present.has(sessionId)) {
				this.attentionTail.delete(sessionId);
			}
		}
	}

	private commit(
		shellStates: Map<string, AgentActivityState>,
		shellProjects: Map<string, string>,
	): void {
		this.shellStates = shellStates;

		const shellsByProject = new Map<string, Record<string, AgentActivityState>>();
		for (const [sessionId, state] of shellStates) {
			const projectId = shellProjects.get(sessionId);
			if (projectId === undefined) {
				continue;
			}
			const grouped = shellsByProject.get(projectId) ?? {};
			grouped[sessionId] = state;
			shellsByProject.set(projectId, grouped);
		}

		const nextSnapshots = new Map<string, ProjectActivitySnapshot>();
		for (const [projectId, shells] of shellsByProject) {
			nextSnapshots.set(projectId, {
				state: aggregateProjectActivity(Object.values(shells)),
				shells,
			});
		}

		const previous = this.projectSnapshots;
		this.projectSnapshots = nextSnapshots;

		for (const projectId of new Set([...previous.keys(), ...nextSnapshots.keys()])) {
			const before = previous.get(projectId);
			const after = nextSnapshots.get(projectId) ?? emptySnapshot();
			if (!sameSnapshot(before, after)) {
				this.notify(projectId, after);
			}
		}
	}

	private notify(projectId: string, snapshot: ProjectActivitySnapshot): void {
		const set = this.listeners.get(projectId);
		if (!set) {
			return;
		}
		for (const listener of set) {
			listener(snapshot);
		}
	}
}

export const AgentActivity = new AgentActivityTracker();
