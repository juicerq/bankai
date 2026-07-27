import { COMPACTION_SCAN_WINDOW, COMPACTION_TRACE, matchesCompactionNotice } from "@main/activity/compaction";
import type { AgentPresence, HarnessTrace } from "@main/activity/Harness";
import { bindShells, childrenReader, type ChildrenOf } from "@main/activity/SessionBinder";
import { discoverAgents, harnessTrace } from "@main/activity/harnesses";
import { procFs } from "@main/activity/procFs";
import { reconcileSessionRefs, type SessionRef } from "@main/activity/SessionRefs";
import { stampShell } from "@main/continuity/ShellFacts";
import { GitProcess } from "@main/git/GitProcess";
import { projectWorktrees } from "@main/git/ProjectWorktrees";
import { ReviewChanges } from "@main/git/ReviewChanges";
import type { Worktree } from "@main/git/contracts";
import { worktreeContaining } from "@main/git/Worktrees";
import { Logger } from "@main/logger";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { shellOutputLines } from "@main/terminal/ShellOutputLines";
import { TerminalSessions } from "@main/terminal/TerminalSessions";
import type { AgentActivityState, ProjectActivitySnapshot } from "@shared/activity";

const ACTIVITY_POLL_MS = 1500;

const OUTPUT_TAIL = 64;

const childless: ChildrenOf = () => Promise.resolve([]);

type BoundStatus = "working" | "waiting" | "idle";

function deriveShellActivity(
	previous: AgentActivityState | undefined,
	bound: BoundStatus | undefined,
): AgentActivityState | undefined {
	if (bound === "working") {
		return "working";
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
): AgentActivityState | undefined {
	if (bound === "waiting") {
		return "needs-attention";
	}

	const next = deriveShellActivity(previous, bound);
	if (next === "done-unseen" && viewed) {
		return undefined;
	}

	return next;
}

export function clockSince(input: {
	previous: AgentActivityState | undefined;
	next: AgentActivityState | undefined;
	held: number | undefined;
	reported: number | undefined;
}): number | undefined {
	if (input.next !== input.previous) {
		return input.reported;
	}

	return input.held ?? input.reported;
}

const NO_RECORD = "";

export function nextCompactionAnchor(input: {
	anchor: string | undefined;
	noticed: boolean;
	recordId: string | undefined;
	bound: BoundStatus | undefined;
}): string | undefined {
	const record = input.recordId ?? NO_RECORD;
	if (input.noticed) {
		return record;
	}
	if (input.anchor === undefined) {
		return undefined;
	}
	if (input.bound !== "working" || record !== input.anchor) {
		return undefined;
	}

	return input.anchor;
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

async function observeTraces(
	shells: { sessionId: string; shellId: string }[],
	bindings: Map<string, number>,
	liveByPid: Map<number, AgentPresence>,
): Promise<Map<string, HarnessTrace>> {
	const traces = new Map<string, HarnessTrace>();

	await Promise.all(shells.map(async (shell) => {
		const boundPid = bindings.get(shell.sessionId);
		const presence = boundPid === undefined ? undefined : liveByPid.get(boundPid);
		if (!presence) {
			return;
		}

		const read = harnessTrace(presence.harness);
		if (!read) {
			return;
		}

		const trace = await read(presence);
		if (trace) {
			traces.set(shell.shellId, trace);
		}
	}));

	return traces;
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

export function sessionTraces(input: {
	compacting: ReadonlySet<string>;
	harnessTraces: ReadonlyMap<string, HarnessTrace>;
	waitingFor: ReadonlyMap<string, string>;
	outputLines: ReadonlyMap<string, string>;
}): Map<string, string> {
	const traces = new Map(input.outputLines);
	for (const [shellId, trace] of input.harnessTraces) {
		traces.set(shellId, trace.label);
	}
	for (const [shellId, reason] of input.waitingFor) {
		traces.set(shellId, reason);
	}
	for (const shellId of input.compacting) {
		traces.set(shellId, COMPACTION_TRACE);
	}

	return traces;
}

export function snapshotsByProject({
	shellStates,
	owners,
	worktrees,
	traces,
	statusSince,
}: {
	shellStates: Map<string, AgentActivityState>;
	owners: Map<string, ShellOwner>;
	worktrees: Map<string, string>;
	traces: ReadonlyMap<string, string>;
	statusSince: ReadonlyMap<string, number>;
}): Map<string, ProjectActivitySnapshot> {
	const projectIds = new Set<string>();
	const shellsByProject = new Map<string, Record<string, AgentActivityState>>();
	for (const [sessionId, state] of shellStates) {
		const owner = owners.get(sessionId);
		if (owner === undefined) {
			continue;
		}

		const grouped = shellsByProject.get(owner.projectId) ?? {};
		grouped[owner.shellId] = state;
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

	const snapshots = new Map<string, ProjectActivitySnapshot>();
	for (const projectId of projectIds) {
		const shells = shellsByProject.get(projectId) ?? {};
		const traceByShellId: Record<string, string> = {};
		const statusSinceByShellId: Record<string, number> = {};
		for (const shellId of Object.keys(shells)) {
			const trace = traces.get(shellId);
			if (trace) {
				traceByShellId[shellId] = trace;
			}

			const since = statusSince.get(shellId);
			if (since) {
				statusSinceByShellId[shellId] = since;
			}
		}

		snapshots.set(projectId, {
			shells,
			worktreeByShellId: worktreesByProject.get(projectId) ?? {},
			traceByShellId,
			statusSinceByShellId,
		});
	}

	return snapshots;
}

function sameRecord<T>(before: Record<string, T>, after: Record<string, T>): boolean {
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
	if (!sameRecord(before?.shells ?? {}, after?.shells ?? {})) {
		return false;
	}
	if (!sameRecord(before?.worktreeByShellId ?? {}, after?.worktreeByShellId ?? {})) {
		return false;
	}
	if (!sameRecord(before?.statusSinceByShellId ?? {}, after?.statusSinceByShellId ?? {})) {
		return false;
	}

	return sameRecord(before?.traceByShellId ?? {}, after?.traceByShellId ?? {});
}

function emptySnapshot(): ProjectActivitySnapshot {
	return { shells: {}, worktreeByShellId: {}, traceByShellId: {}, statusSinceByShellId: {} };
}

type ActivityListener = (snapshot: ProjectActivitySnapshot) => void;

class AgentActivityTracker {
	private shellStates = new Map<string, AgentActivityState>();
	private projectSnapshots = new Map<string, ProjectActivitySnapshot>();
	private readonly listeners = new Map<string, Set<ActivityListener>>();
	private readonly outputTail = new Map<string, string>();
	private readonly compactionNoticed = new Set<string>();
	private readonly compacting = new Map<string, string>();
	private boundSessions = new Set<string>();
	private sessionRefs = new Map<string, SessionRef>();
	private shellWorktrees = new Map<string, string>();
	private harnessTraces = new Map<string, HarnessTrace>();
	private waitingFor = new Map<string, string>();
	private statusSince = new Map<string, number>();
	private agentCwds = new Map<string, string>();
	private viewed: string | undefined;
	private timer: ReturnType<typeof setInterval> | undefined;
	private ticking = false;

	noteData(sessionId: string, data: string): void {
		if (!this.boundSessions.has(sessionId)) {
			return;
		}

		const combined = (this.outputTail.get(sessionId) ?? "") + data;
		const window = combined.length > COMPACTION_SCAN_WINDOW
			? combined.slice(-COMPACTION_SCAN_WINDOW)
			: combined;
		if (matchesCompactionNotice(window)) {
			this.compactionNoticed.add(sessionId);
		}
		this.outputTail.set(sessionId, combined.slice(-OUTPUT_TAIL));
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
		this.commit({
			shellStates: cleared,
			owners: shellOwners(TerminalSessions.list()),
			worktrees: this.shellWorktrees,
			harnessTraces: this.harnessTraces,
			waitingFor: this.waitingFor,
			statusSince: this.statusSince,
		});
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
			this.outputTail.clear();
			this.compactionNoticed.clear();
			this.compacting.clear();
			this.agentCwds.clear();
			this.commit({
				shellStates: new Map(),
				owners,
				worktrees: new Map(),
				harnessTraces: new Map(),
				waitingFor: new Map(),
				statusSince: new Map(),
			});
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
		const childrenOf: ChildrenOf = needsWalk ? await childrenReader() : childless;
		const bindings = await bindShells(foregrounds, livePids, childrenOf);
		this.boundSessions = new Set(bindings.keys());
		this.pruneScans(owners);

		const nextStates = new Map<string, AgentActivityState>();
		const waitingFor = new Map<string, string>();
		const statusSince = new Map<string, number>();
		for (const shell of shells) {
			const boundPid = bindings.get(shell.sessionId);
			const presence = boundPid === undefined ? undefined : liveByPid.get(boundPid);
			const previous = this.shellStates.get(shell.sessionId);
			const next = nextShellActivity(previous, presence?.status, shell.sessionId === this.viewed);
			if (next !== undefined) {
				nextStates.set(shell.sessionId, next);
			}
			if (presence?.waitingFor) {
				waitingFor.set(shell.shellId, presence.waitingFor);
			}

			const since = clockSince({
				previous,
				next,
				held: this.statusSince.get(shell.shellId),
				reported: presence?.statusSince,
			});
			if (since) {
				statusSince.set(shell.shellId, since);
			}
		}

		this.captureSessionRefs(shells, bindings, liveByPid);
		const [worktrees, harnessTraces] = await Promise.all([
			this.observeWorktrees(shells, bindings, liveByPid),
			observeTraces(shells, bindings, liveByPid),
		]);
		this.trackCompaction(shells, bindings, liveByPid, harnessTraces);
		this.commit({ shellStates: nextStates, owners, worktrees, harnessTraces, waitingFor, statusSince });
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

	private pruneScans(present: Map<string, ShellOwner>): void {
		for (const sessionId of this.outputTail.keys()) {
			if (!present.has(sessionId)) {
				this.outputTail.delete(sessionId);
			}
		}
		for (const sessionId of this.compactionNoticed) {
			if (!present.has(sessionId)) {
				this.compactionNoticed.delete(sessionId);
			}
		}

		const shellIds = new Set([...present.values()].map((owner) => owner.shellId));
		for (const shellId of this.compacting.keys()) {
			if (!shellIds.has(shellId)) {
				this.compacting.delete(shellId);
			}
		}
	}

	private trackCompaction(
		shells: { sessionId: string; shellId: string }[],
		bindings: Map<string, number>,
		liveByPid: Map<number, AgentPresence>,
		traces: Map<string, HarnessTrace>,
	): void {
		for (const shell of shells) {
			const boundPid = bindings.get(shell.sessionId);
			const anchor = nextCompactionAnchor({
				anchor: this.compacting.get(shell.shellId),
				noticed: this.compactionNoticed.delete(shell.sessionId),
				recordId: traces.get(shell.shellId)?.recordId,
				bound: boundPid === undefined ? undefined : liveByPid.get(boundPid)?.status,
			});

			if (anchor === undefined) {
				this.compacting.delete(shell.shellId);
				continue;
			}

			this.compacting.set(shell.shellId, anchor);
		}
	}

	private commit({
		shellStates,
		owners,
		worktrees,
		harnessTraces,
		waitingFor,
		statusSince,
	}: {
		shellStates: Map<string, AgentActivityState>;
		owners: Map<string, ShellOwner>;
		worktrees: Map<string, string>;
		harnessTraces: Map<string, HarnessTrace>;
		waitingFor: Map<string, string>;
		statusSince: Map<string, number>;
	}): void {
		const previousStates = this.shellStates;
		const previousWorktrees = this.shellWorktrees;
		const previous = this.projectSnapshots;
		const nextSnapshots = snapshotsByProject({
			shellStates,
			owners,
			worktrees,
			traces: sessionTraces({
				compacting: new Set(this.compacting.keys()),
				harnessTraces,
				waitingFor,
				outputLines: shellOutputLines,
			}),
			statusSince,
		});
		this.shellStates = shellStates;
		this.shellWorktrees = worktrees;
		this.harnessTraces = harnessTraces;
		this.waitingFor = waitingFor;
		this.statusSince = statusSince;
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

		for (const sessionId of turnStartShells(previousStates, shellStates)) {
			const owner = owners.get(sessionId);
			if (!owner) {
				continue;
			}

			const worktree = worktrees.get(owner.shellId);
			stampShell({ ...owner, ...(worktree ? { cwd: worktree } : {}) }).catch((err) =>
				Logger.error("activity:stamp-failed", { ...owner, err: String(err) }),
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
