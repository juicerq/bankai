import { ATTENTION_SCAN_WINDOW, matchesAttentionPrompt } from "@main/activity/attention";
import type { AgentPresence } from "@main/activity/Harness";
import { bindShells, childrenByParent } from "@main/activity/SessionBinder";
import { discoverAgents } from "@main/activity/harnesses";
import { procFs } from "@main/activity/procFs";
import { reconcileSessionRefs, type SessionRef } from "@main/activity/SessionRefs";
import { GitProcess } from "@main/git/GitProcess";
import { projectWorktrees } from "@main/git/ProjectWorktrees";
import { ReviewChanges } from "@main/git/ReviewChanges";
import type { Worktree } from "@main/git/contracts";
import { worktreeContaining } from "@main/git/Worktrees";
import { Logger } from "@main/logger";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
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

function turnOpen(state: AgentActivityState | undefined): boolean {
	return state === "working" || state === "needs-attention";
}

export function turnStartShells(
	before: ReadonlyMap<string, AgentActivityState>,
	after: ReadonlyMap<string, AgentActivityState>,
): string[] {
	const started: string[] = [];

	for (const [sessionId, state] of after) {
		if (turnOpen(state) && !turnOpen(before.get(sessionId))) {
			started.push(sessionId);
		}
	}

	return started;
}

export interface ShellOwner {
	projectId: string;
	shellId: string;
}

export function nextShellWorktrees(
	previous: ReadonlyMap<string, string>,
	observed: { shellId: string; worktree?: string }[],
): Map<string, string> {
	const next = new Map<string, string>();

	for (const shell of observed) {
		const worktree = shell.worktree ?? previous.get(shell.shellId);
		if (worktree) {
			next.set(shell.shellId, worktree);
		}
	}

	return next;
}

export function turnBaselineShells(input: {
	before: ReadonlyMap<string, AgentActivityState>;
	after: ReadonlyMap<string, AgentActivityState>;
	owners: ReadonlyMap<string, ShellOwner>;
	previousWorktrees: ReadonlyMap<string, string>;
	worktrees: ReadonlyMap<string, string>;
}): { owner: ShellOwner; worktree?: string }[] {
	const capture = new Map<string, ShellOwner>();

	for (const sessionId of turnStartShells(input.before, input.after)) {
		const owner = input.owners.get(sessionId);
		if (owner) {
			capture.set(owner.shellId, owner);
		}
	}

	for (const [sessionId, state] of input.after) {
		const owner = input.owners.get(sessionId);
		if (!owner || !turnOpen(state)) {
			continue;
		}

		const worktree = input.worktrees.get(owner.shellId);
		if (worktree && worktree !== input.previousWorktrees.get(owner.shellId)) {
			capture.set(owner.shellId, owner);
		}
	}

	return [...capture.values()].map((owner) => {
		const worktree = input.worktrees.get(owner.shellId);
		if (worktree) {
			return { owner, worktree };
		}

		return { owner };
	});
}

async function locateWorktree(projectPath: string, cwd: string): Promise<Worktree | undefined> {
	const listed = await projectWorktrees(projectPath).catch((err) => {
		Logger.error("activity:worktrees-failed", { projectPath, err: String(err) });
		return [];
	});
	const found = worktreeContaining(listed, cwd);
	if (found) {
		return found;
	}

	const fresh = await projectWorktrees(projectPath, { fresh: true }).catch(() => listed);

	return worktreeContaining(fresh, cwd);
}

function shellOwners(shells: { sessionId: string; projectId: string; shellId: string }[]): Map<string, ShellOwner> {
	return new Map(
		shells.map((shell) => [shell.sessionId, { projectId: shell.projectId, shellId: shell.shellId }]),
	);
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

function sameRecord(before: Record<string, string>, after: Record<string, string>): boolean {
	const keys = Object.keys(before);
	if (keys.length !== Object.keys(after).length) {
		return false;
	}

	return keys.every((key) => before[key] === after[key]);
}

function sameSnapshot(
	before: ProjectActivitySnapshot | undefined,
	after: ProjectActivitySnapshot | undefined,
): boolean {
	if ((before?.state ?? null) !== (after?.state ?? null)) {
		return false;
	}
	if (!sameRecord(before?.shells ?? {}, after?.shells ?? {})) {
		return false;
	}

	return sameRecord(before?.worktreeByShellId ?? {}, after?.worktreeByShellId ?? {});
}

function emptySnapshot(): ProjectActivitySnapshot {
	return { state: null, shells: {}, worktreeByShellId: {} };
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
	private shellWorktrees = new Map<string, string>();
	private agentCwds = new Map<string, string>();
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
		this.commit(cleared, shellOwners(TerminalSessions.list()), this.shellWorktrees);
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
		const owners = shellOwners(shells);
		if (shells.length === 0) {
			this.boundSessions = new Set();
			this.sessionRefs = new Map();
			this.attention.clear();
			this.attentionTail.clear();
			this.agentCwds.clear();
			this.commit(new Map(), owners, new Map());
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
		this.pruneAttention(owners);

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
		this.commit(nextStates, owners, await this.observeWorktrees(shells, bindings, liveByPid));
	}

	private async observeWorktrees(
		shells: { sessionId: string; shellId: string; projectId: string }[],
		bindings: Map<string, number>,
		liveByPid: Map<number, AgentPresence>,
	): Promise<Map<string, string>> {
		const observed = await Promise.all(shells.map(async (shell) => {
			const boundPid = bindings.get(shell.sessionId);
			const cwd = boundPid === undefined ? undefined : liveByPid.get(boundPid)?.cwd;
			if (cwd === undefined) {
				return { shellId: shell.shellId };
			}
			if (this.agentCwds.get(shell.shellId) === cwd) {
				const known = this.shellWorktrees.get(shell.shellId);
				if (known) {
					return { shellId: shell.shellId, worktree: known };
				}

				return { shellId: shell.shellId };
			}

			this.agentCwds.set(shell.shellId, cwd);
			const project = await Projects.find(shell.projectId).catch(() => null);
			if (!project) {
				return { shellId: shell.shellId };
			}

			const worktree = await locateWorktree(project.path, cwd);
			if (worktree) {
				return { shellId: shell.shellId, worktree: worktree.path };
			}

			return { shellId: shell.shellId };
		}));

		const living = new Set(shells.map((shell) => shell.shellId));
		for (const shellId of this.agentCwds.keys()) {
			if (!living.has(shellId)) {
				this.agentCwds.delete(shellId);
			}
		}

		return nextShellWorktrees(this.shellWorktrees, observed);
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

	private pruneAttention(present: Map<string, ShellOwner>): void {
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
		owners: Map<string, ShellOwner>,
		worktrees: Map<string, string>,
	): void {
		const previousStates = this.shellStates;
		const previousWorktrees = this.shellWorktrees;
		this.shellStates = shellStates;
		this.shellWorktrees = worktrees;

		const projectIds = new Set<string>();
		const shellsByProject = new Map<string, Record<string, AgentActivityState>>();
		for (const [sessionId, state] of shellStates) {
			const owner = owners.get(sessionId);
			if (owner === undefined) {
				continue;
			}
			const grouped = shellsByProject.get(owner.projectId) ?? {};
			grouped[sessionId] = state;
			shellsByProject.set(owner.projectId, grouped);
			projectIds.add(owner.projectId);
		}

		const worktreesByProject = new Map<string, Record<string, string>>();
		for (const owner of owners.values()) {
			const worktree = worktrees.get(owner.shellId);
			if (worktree === undefined) {
				continue;
			}
			const grouped = worktreesByProject.get(owner.projectId) ?? {};
			grouped[owner.shellId] = worktree;
			worktreesByProject.set(owner.projectId, grouped);
			projectIds.add(owner.projectId);
		}

		const nextSnapshots = new Map<string, ProjectActivitySnapshot>();
		for (const projectId of projectIds) {
			const shells = shellsByProject.get(projectId) ?? {};
			nextSnapshots.set(projectId, {
				state: aggregateProjectActivity(Object.values(shells)),
				shells,
				worktreeByShellId: worktreesByProject.get(projectId) ?? {},
			});
		}

		const previous = this.projectSnapshots;
		this.projectSnapshots = nextSnapshots;

		const baselines = turnBaselineShells({
			before: previousStates,
			after: shellStates,
			owners,
			previousWorktrees,
			worktrees,
		});
		for (const baseline of baselines) {
			this.captureTurnBaseline(baseline).catch((err) =>
				Logger.error("activity:turn-baseline-failed", { ...baseline.owner, err: String(err) }),
			);
		}

		for (const projectId of new Set([...previous.keys(), ...nextSnapshots.keys()])) {
			const before = previous.get(projectId);
			const after = nextSnapshots.get(projectId) ?? emptySnapshot();
			if (!sameSnapshot(before, after)) {
				this.notify(projectId, after);
			}
		}
	}

	private async captureTurnBaseline(baseline: { owner: ShellOwner; worktree?: string }): Promise<void> {
		const path = baseline.worktree ?? (await Projects.find(baseline.owner.projectId)).path;
		await GitProcess.startTurn({ path, shellId: baseline.owner.shellId });
		ReviewChanges.touch(path);
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
