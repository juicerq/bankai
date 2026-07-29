import { type FSWatcher, watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import {
	COMPACTION_SCAN_WINDOW,
	COMPACTION_TRACE,
	matchesCompactionNotice,
} from "@main/activity/compaction";
import type {
	AgentPresence,
	HarnessReading,
	HarnessTrace,
} from "@main/activity/Harness";
import { hookSpoolDir, pruneSpool } from "@main/activity/HookSource";
import { discoverAgents, harnessReader } from "@main/activity/harnesses";
import { procFs } from "@main/activity/procFs";
import { bindShells } from "@main/activity/SessionBinder";
import {
	reconcileSessionRefs,
	type SessionRef,
} from "@main/activity/SessionRefs";
import { TraceDwell } from "@main/activity/TraceDwell";
import { stampShell } from "@main/continuity/ShellFacts";
import type { Worktree } from "@main/git/contracts";
import { GitProcess } from "@main/git/GitProcess";
import { projectWorktrees } from "@main/git/ProjectWorktrees";
import { ReviewChanges } from "@main/git/ReviewChanges";
import { worktreeContaining } from "@main/git/Worktrees";
import { Logger } from "@main/logger";
import { SessionNamer } from "@main/naming/SessionNamer";
import { pushNeedsAttention, pushTurnDone } from "@main/push/notifyAttention";
import { Continuity, type ContinuityValue } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { shellOutputLines } from "@main/terminal/ShellOutputLines";
import { shellProcesses } from "@main/terminal/ShellProcesses";
import {
	type AgentActivityState,
	DEFAULT_LIVE_TRACE,
	type ProjectActivitySnapshot,
	type ShellAttention,
} from "@shared/activity";
import { throttle } from "@shared/throttle";

const ACTIVITY_POLL_MS = 1500;

const SPOOL_PASS_MS = 150;

const SPOOL_PRUNE_MS = 5 * 60 * 1000;

const OUTPUT_TAIL = 64;

type ActivityPass = "full" | "event";

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
		return "done";
	}

	return undefined;
}

export function nextShellActivity(
	previous: AgentActivityState | undefined,
	bound?: BoundStatus,
): AgentActivityState | undefined {
	if (bound === "waiting") {
		return "needs-attention";
	}

	return deriveShellActivity(previous, bound);
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

export const ATTENTION_SKEW_MS = 2000;

export function freshAttention(input: {
	attention: ShellAttention | undefined;
	bound: BoundStatus | undefined;
	statusSince: number | undefined;
}): ShellAttention | undefined {
	if (!input.attention || input.bound !== "waiting") {
		return undefined;
	}
	if (input.statusSince !== undefined && input.attention.at < input.statusSince - ATTENTION_SKEW_MS) {
		return undefined;
	}

	return input.attention;
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

export function attentionEntryShells(
	before: ReadonlyMap<string, AgentActivityState>,
	after: ReadonlyMap<string, AgentActivityState>,
): string[] {
	const entered: string[] = [];

	for (const [sessionId, state] of after) {
		if (state === "needs-attention" && before.get(sessionId) !== "needs-attention") {
			entered.push(sessionId);
		}
	}

	return entered;
}

export function doneEntryShells(
	before: ReadonlyMap<string, AgentActivityState>,
	after: ReadonlyMap<string, AgentActivityState>,
): string[] {
	const finished: string[] = [];

	for (const [sessionId, state] of after) {
		if (state === "done" && before.get(sessionId) !== "done") {
			finished.push(sessionId);
		}
	}

	return finished;
}

export interface ShellOwner {
	projectId: string;
	shellId: string;
}

export interface DoneShell {
	projectId: string;
	at: number;
}

export function doneShells(value: ContinuityValue): Map<string, DoneShell> {
	const done = new Map<string, DoneShell>();

	for (const workspace of value.workspaces) {
		for (const shell of workspace.shells) {
			if (shell.doneAt === undefined || shell.archivedAt !== undefined) {
				continue;
			}

			done.set(shell.id, { projectId: workspace.projectId, at: shell.doneAt });
		}
	}

	return done;
}

function sameDoneShells(left: ReadonlyMap<string, DoneShell>, right: ReadonlyMap<string, DoneShell>): boolean {
	if (left.size !== right.size) {
		return false;
	}

	for (const [shellId, done] of left) {
		const other = right.get(shellId);
		if (other?.projectId !== done.projectId || other.at !== done.at) {
			return false;
		}
	}

	return true;
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

async function observeReadings(
	shells: { sessionId: string; shellId: string }[],
	bindings: Map<string, number>,
	liveByPid: Map<number, AgentPresence>,
): Promise<Map<string, HarnessReading>> {
	const readings = new Map<string, HarnessReading>();

	await Promise.all(
		shells.map(async (shell) => {
			const boundPid = bindings.get(shell.sessionId);
			const presence =
				boundPid === undefined ? undefined : liveByPid.get(boundPid);
			if (!presence) {
				return;
			}

			const read = harnessReader(presence.harness);
			if (!read) {
				return;
			}

			readings.set(shell.shellId, await read(presence));
		}),
	);

	return readings;
}

function tracesOf(
	readings: ReadonlyMap<string, HarnessReading>,
): Map<string, HarnessTrace> {
	const traces = new Map<string, HarnessTrace>();

	for (const [shellId, reading] of readings) {
		if (reading.trace) {
			traces.set(shellId, reading.trace);
		}
	}

	return traces;
}

export function turnEnded(
	presence?: { status: BoundStatus; statusSince?: number },
	endedAt?: number,
): boolean {
	if (presence?.status !== "working" || endedAt === undefined) {
		return false;
	}

	return endedAt > (presence.statusSince ?? 0);
}

async function locateWorktree(
	projectPath: string,
	cwd: string,
): Promise<Worktree | undefined> {
	const listed = await projectWorktrees(projectPath).catch((err) => {
		Logger.error("activity:worktrees-failed", {
			projectPath,
			err: String(err),
		});
		return [];
	});
	const found = worktreeContaining(listed, cwd);
	if (found) {
		return found;
	}

	const fresh = await projectWorktrees(projectPath, { fresh: true }).catch(
		() => listed,
	);

	return worktreeContaining(fresh, cwd);
}

function shellOwners(
	shells: { sessionId: string; projectId: string; shellId: string }[],
): Map<string, ShellOwner> {
	return new Map(
		shells.map((shell) => [
			shell.sessionId,
			{ projectId: shell.projectId, shellId: shell.shellId },
		]),
	);
}

export interface ShellTrace {
	label: string;
	since?: number;
}

function anchored(held: ShellTrace | undefined, next: ShellTrace): ShellTrace {
	if (held?.label !== next.label || held.since === undefined) {
		return next;
	}

	return { label: next.label, since: held.since };
}

export function sessionTraces(input: {
	compacting: ReadonlySet<string>;
	harnessTraces: ReadonlyMap<string, HarnessTrace>;
	waitingFor: ReadonlyMap<string, string>;
	statusSince: ReadonlyMap<string, number>;
	outputLines: ReadonlyMap<string, string>;
	agentShells: ReadonlySet<string>;
	held: ReadonlyMap<string, ShellTrace>;
	now: number;
}): Map<string, ShellTrace> {
	const traces = new Map<string, ShellTrace>();
	for (const [shellId, line] of input.outputLines) {
		if (!input.agentShells.has(shellId)) {
			traces.set(shellId, { label: line });
		}
	}
	for (const [shellId, trace] of input.harnessTraces) {
		traces.set(shellId, {
			label: trace.label,
			since: trace.since ?? input.now,
		});
	}
	for (const [shellId, reason] of input.waitingFor) {
		const since = input.statusSince.get(shellId);
		traces.set(shellId, {
			label: reason,
			...(since !== undefined && { since }),
		});
	}
	for (const shellId of input.compacting) {
		traces.set(shellId, { label: COMPACTION_TRACE, since: input.now });
	}

	const anchoredTraces = new Map<string, ShellTrace>();
	for (const [shellId, trace] of traces) {
		anchoredTraces.set(shellId, anchored(input.held.get(shellId), trace));
	}

	return anchoredTraces;
}

export function snapshotsByProject({
	shellStates,
	owners,
	worktrees,
	traces,
	statusSince,
	attention,
	doneShells,
}: {
	shellStates: Map<string, AgentActivityState>;
	owners: Map<string, ShellOwner>;
	worktrees: Map<string, string>;
	traces: ReadonlyMap<string, ShellTrace>;
	statusSince: ReadonlyMap<string, number>;
	attention: ReadonlyMap<string, ShellAttention>;
	doneShells: ReadonlyMap<string, DoneShell>;
}): Map<string, ProjectActivitySnapshot> {
	const projectIds = new Set<string>();
	const shellsByProject = new Map<string, Record<string, AgentActivityState>>();
	for (const [sessionId, state] of shellStates) {
		const owner = owners.get(sessionId);
		if (owner === undefined || (state === "done" && !doneShells.has(owner.shellId))) {
			continue;
		}

		const grouped = shellsByProject.get(owner.projectId) ?? {};
		grouped[owner.shellId] = state;
		shellsByProject.set(owner.projectId, grouped);
		projectIds.add(owner.projectId);
	}

	for (const [shellId, done] of doneShells) {
		const grouped = shellsByProject.get(done.projectId) ?? {};
		if (grouped[shellId] === undefined) {
			grouped[shellId] = "done";
		}
		shellsByProject.set(done.projectId, grouped);
		projectIds.add(done.projectId);
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
		const traceSinceByShellId: Record<string, number> = {};
		const statusSinceByShellId: Record<string, number> = {};
		const attentionByShellId: Record<string, ShellAttention> = {};
		for (const shellId of Object.keys(shells)) {
			const trace = traces.get(shellId);
			if (trace) {
				traceByShellId[shellId] = trace.label;
			}
			if (trace?.since) {
				traceSinceByShellId[shellId] = trace.since;
			}

			const since =
				statusSince.get(shellId) ??
				(shells[shellId] === "done" ? doneShells.get(shellId)?.at : undefined);
			if (since !== undefined) {
				statusSinceByShellId[shellId] = since;
			}

			const waiting = attention.get(shellId);
			if (waiting) {
				attentionByShellId[shellId] = waiting;
			}
		}

		snapshots.set(projectId, {
			shells,
			worktreeByShellId: worktreesByProject.get(projectId) ?? {},
			traceByShellId,
			traceSinceByShellId,
			statusSinceByShellId,
			attentionByShellId,
		});
	}

	return snapshots;
}

function sameRecord<T>(
	before: Record<string, T>,
	after: Record<string, T>,
	same: (left: T | undefined, right: T | undefined) => boolean = (
		left,
		right,
	) => left === right,
): boolean {
	const keys = Object.keys(before);
	if (keys.length !== Object.keys(after).length) {
		return false;
	}

	return keys.every((key) => same(before[key], after[key]));
}

function sameAttention(
	before: ShellAttention | undefined,
	after: ShellAttention | undefined,
): boolean {
	return (
		before?.message === after?.message &&
		before?.at === after?.at &&
		before?.detail === after?.detail
	);
}

function sameSnapshot(
	before: ProjectActivitySnapshot | undefined,
	after: ProjectActivitySnapshot | undefined,
): boolean {
	if (!sameRecord(before?.shells ?? {}, after?.shells ?? {})) {
		return false;
	}
	if (
		!sameRecord(before?.worktreeByShellId ?? {}, after?.worktreeByShellId ?? {})
	) {
		return false;
	}
	if (
		!sameRecord(
			before?.statusSinceByShellId ?? {},
			after?.statusSinceByShellId ?? {},
		)
	) {
		return false;
	}
	if (
		!sameRecord(
			before?.traceSinceByShellId ?? {},
			after?.traceSinceByShellId ?? {},
		)
	) {
		return false;
	}
	if (
		!sameRecord(
			before?.attentionByShellId ?? {},
			after?.attentionByShellId ?? {},
			sameAttention,
		)
	) {
		return false;
	}

	return sameRecord(before?.traceByShellId ?? {}, after?.traceByShellId ?? {});
}

function emptySnapshot(): ProjectActivitySnapshot {
	return {
		shells: {},
		worktreeByShellId: {},
		traceByShellId: {},
		traceSinceByShellId: {},
		statusSinceByShellId: {},
		attentionByShellId: {},
	};
}

type ActivityListener = (snapshot: ProjectActivitySnapshot) => void;

class AgentActivityTracker {
	private shellStates = new Map<string, AgentActivityState>();
	private doneShells = new Map<string, DoneShell>();
	private projectSnapshots = new Map<string, ProjectActivitySnapshot>();
	private readonly listeners = new Map<string, Set<ActivityListener>>();
	private readonly outputTail = new Map<string, string>();
	private readonly compactionNoticed = new Set<string>();
	private readonly compacting = new Map<string, string>();
	private boundSessions = new Set<string>();
	private sessionRefs = new Map<string, SessionRef>();
	private shellWorktrees = new Map<string, string>();
	private traces = new Map<string, ShellTrace>();
	private statusSince = new Map<string, number>();
	private agentCwds = new Map<string, string>();
	private readonly dwell = new TraceDwell();
	private readonly noteSpoolWrite = throttle(
		() => this.runTick("event"),
		SPOOL_PASS_MS,
	);
	private liveTrace = DEFAULT_LIVE_TRACE;
	private timer: ReturnType<typeof setInterval> | undefined;
	private watcher: FSWatcher | undefined;
	private drainTimer: ReturnType<typeof setTimeout> | undefined;
	private ticking = false;
	private queuedPass: ActivityPass | undefined;
	private prunedAt = 0;

	setLiveTrace(enabled: boolean): void {
		this.liveTrace = enabled;
		if (this.timer) {
			this.runTick("event");
		}
	}

	noteData(sessionId: string, data: string): void {
		if (!this.liveTrace || !this.boundSessions.has(sessionId)) {
			return;
		}

		const combined = (this.outputTail.get(sessionId) ?? "") + data;
		const window =
			combined.length > COMPACTION_SCAN_WINDOW
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

		this.timer = setInterval(() => this.runTick("full"), ACTIVITY_POLL_MS);
		this.timer.unref();
		Continuity.subscribe((value) => this.noteContinuity(value));
		Continuity.load()
			.then(({ value }) => this.noteContinuity(value))
			.catch((err) =>
				Logger.error("activity:continuity-load-failed", { err: String(err) }),
			);
		this.watchSpool().catch((err) =>
			Logger.warn("activity:spool-watch-failed", { err: String(err) }),
		);
	}

	private noteContinuity(value: ContinuityValue): void {
		const next = doneShells(value);
		if (sameDoneShells(this.doneShells, next)) {
			return;
		}

		this.doneShells = next;
		this.runTick("event");
	}

	private async watchSpool(): Promise<void> {
		await mkdir(hookSpoolDir(), { recursive: true });
		this.watcher = watch(hookSpoolDir(), () => this.noteSpoolWrite());
		this.watcher.unref();
	}

	private scheduleDrain(wakeIn: number | undefined): void {
		if (wakeIn === undefined || this.drainTimer) {
			return;
		}

		this.drainTimer = setTimeout(
			() => {
				this.drainTimer = undefined;
				this.runTick("event");
			},
			Math.max(wakeIn, 0),
		);
		this.drainTimer.unref();
	}

	getProjectSnapshot(projectId: string): ProjectActivitySnapshot {
		return this.projectSnapshots.get(projectId) ?? emptySnapshot();
	}

	liveAgentSessions(): ReadonlySet<string> {
		return this.boundSessions;
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

	private runTick(pass: ActivityPass): void {
		if (this.ticking) {
			this.queuedPass = this.queuedPass === "full" ? "full" : pass;
			return;
		}

		this.ticking = true;
		this.tick(pass)
			.catch((err) =>
				Logger.error("activity:tick-failed", { err: String(err) }),
			)
			.finally(() => {
				this.ticking = false;
				const queued = this.queuedPass;
				this.queuedPass = undefined;
				if (queued) {
					this.runTick(queued);
				}
			});
	}

	private async tick(pass: ActivityPass): Promise<void> {
		const shells = shellProcesses.list();
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
				attention: new Map(),
				statusSince: new Map(),
				publishedNames: new Map(),
			});
			return;
		}

		const presences = await discoverAgents();
		const liveByPid = new Map<number, AgentPresence>();
		await Promise.all(
			presences.map(async (presence) => {
				const start = await procFs.procStart(presence.pid);
				if (start !== null && start === presence.procStart) {
					liveByPid.set(presence.pid, presence);
				}
			}),
		);
		const bindings = await bindShells(shells, liveByPid.keys(), procFs.parent);
		this.boundSessions = new Set(bindings.keys());
		this.pruneScans(owners);

		this.captureSessionRefs(shells, bindings, liveByPid);
		const [worktrees, readings] = await Promise.all([
			pass === "full"
				? this.observeWorktrees(shells, bindings, liveByPid)
				: this.shellWorktrees,
			this.liveTrace
				? observeReadings(shells, bindings, liveByPid)
				: new Map<string, HarnessReading>(),
		]);
		const harnessTraces = tracesOf(readings);

		const nextStates = new Map<string, AgentActivityState>();
		const waitingFor = new Map<string, string>();
		const attention = new Map<string, ShellAttention>();
		const statusSince = new Map<string, number>();
		const publishedNames = new Map<string, string>();
		const bound = new Map<string, BoundStatus>();
		for (const shell of shells) {
			const boundPid = bindings.get(shell.sessionId);
			const presence =
				boundPid === undefined ? undefined : liveByPid.get(boundPid);
			const endedAt = readings.get(shell.shellId)?.endedAt;
			const ended = turnEnded(presence, endedAt);
			const status = ended ? "idle" : presence?.status;
			if (status) {
				bound.set(shell.shellId, status);
			}

			const previous = this.shellStates.get(shell.sessionId);
			const next = nextShellActivity(previous, status);
			if (next !== undefined) {
				nextStates.set(shell.sessionId, next);
			}
			if (presence?.waitingFor) {
				waitingFor.set(shell.shellId, presence.waitingFor);
			}
			if (presence?.publishedName) {
				publishedNames.set(shell.sessionId, presence.publishedName);
			}

			const since = clockSince({
				previous,
				next,
				held: this.statusSince.get(shell.shellId),
				reported: ended ? endedAt : presence?.statusSince,
			});
			if (since) {
				statusSince.set(shell.shellId, since);
			}

			const asking = freshAttention({
				attention: readings.get(shell.shellId)?.attention,
				bound: status,
				statusSince: since,
			});
			if (asking) {
				attention.set(shell.shellId, asking);
			}
		}

		if (pass === "full") {
			this.prune(new Set(presences.map((presence) => presence.sessionId)));
		}
		if (this.liveTrace) {
			this.trackCompaction(shells, bound, harnessTraces);
		} else {
			this.forgetCompaction();
		}
		this.commit({
			shellStates: nextStates,
			owners,
			worktrees,
			harnessTraces,
			waitingFor,
			attention,
			statusSince,
			publishedNames,
		});
	}

	private prune(live: Set<string>): void {
		const now = Date.now();
		if (now - this.prunedAt < SPOOL_PRUNE_MS) {
			return;
		}

		this.prunedAt = now;
		pruneSpool(live).catch((err) =>
			Logger.warn("activity:spool-prune-failed", { err: String(err) }),
		);
	}

	private async observeWorktrees(
		shells: { sessionId: string; shellId: string; projectId: string }[],
		bindings: Map<string, number>,
		liveByPid: Map<number, AgentPresence>,
	): Promise<Map<string, string>> {
		const observed = await Promise.all(
			shells.map(async (shell) => {
				const boundPid = bindings.get(shell.sessionId);
				const cwd =
					boundPid === undefined ? undefined : liveByPid.get(boundPid)?.cwd;
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
			}),
		);

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
			const presence =
				boundPid === undefined ? undefined : liveByPid.get(boundPid);

			return {
				shellId: shell.shellId,
				projectId: shell.projectId,
				session: presence
					? {
							harness: presence.harness,
							sessionId: presence.sessionId,
							cwd: presence.cwd,
						}
					: undefined,
			};
		});

		const { changes, next } = reconcileSessionRefs(
			this.sessionRefs,
			observations,
		);
		this.sessionRefs = next;

		for (const change of changes) {
			const persist =
				change.kind === "upsert"
					? Continuity.setShellSession({
							projectId: change.projectId,
							shellId: change.shellId,
							session: change.session,
						})
					: Continuity.clearShellSession({
							projectId: change.projectId,
							shellId: change.shellId,
						});
			persist.catch((err) =>
				Logger.error("activity:session-ref-persist-failed", {
					err: String(err),
				}),
			);
		}
	}

	private agentShells(owners: Map<string, ShellOwner>): Set<string> {
		const shellIds = new Set<string>();
		for (const sessionId of this.boundSessions) {
			const owner = owners.get(sessionId);
			if (owner) {
				shellIds.add(owner.shellId);
			}
		}

		return shellIds;
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

		const shellIds = new Set(
			[...present.values()].map((owner) => owner.shellId),
		);
		for (const shellId of this.compacting.keys()) {
			if (!shellIds.has(shellId)) {
				this.compacting.delete(shellId);
			}
		}
	}

	private forgetCompaction(): void {
		this.compactionNoticed.clear();
		this.compacting.clear();
	}

	private trackCompaction(
		shells: { sessionId: string; shellId: string }[],
		bound: ReadonlyMap<string, BoundStatus>,
		traces: ReadonlyMap<string, HarnessTrace>,
	): void {
		for (const shell of shells) {
			const anchor = nextCompactionAnchor({
				anchor: this.compacting.get(shell.shellId),
				noticed: this.compactionNoticed.delete(shell.sessionId),
				recordId: traces.get(shell.shellId)?.recordId,
				bound: bound.get(shell.shellId),
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
		attention,
		statusSince,
		publishedNames,
	}: {
		shellStates: Map<string, AgentActivityState>;
		owners: Map<string, ShellOwner>;
		worktrees: Map<string, string>;
		harnessTraces: Map<string, HarnessTrace>;
		waitingFor: Map<string, string>;
		attention: Map<string, ShellAttention>;
		statusSince: Map<string, number>;
		publishedNames: Map<string, string>;
	}): void {
		const previousStates = this.shellStates;
		const previousWorktrees = this.shellWorktrees;
		const previous = this.projectSnapshots;
		const now = Date.now();
		const traces = sessionTraces({
			compacting: new Set(this.compacting.keys()),
			harnessTraces,
			waitingFor,
			statusSince,
			outputLines: shellOutputLines,
			agentShells: this.agentShells(owners),
			held: this.traces,
			now,
		});
		const { visible, wakeIn } = this.dwell.next({
			traces,
			immediate: new Set([...this.compacting.keys(), ...waitingFor.keys()]),
			now,
		});
		this.scheduleDrain(wakeIn);
		const nextSnapshots = snapshotsByProject({
			shellStates,
			owners,
			worktrees,
			traces: visible,
			statusSince,
			attention,
			doneShells: this.doneShells,
		});
		this.shellStates = shellStates;
		this.shellWorktrees = worktrees;
		this.traces = traces;
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
				Logger.error("activity:turn-baseline-failed", {
					...baseline.owner,
					err: String(err),
				}),
			);
		}

		SessionNamer.forget(
			new Set([...owners.values()].map((owner) => owner.shellId)),
		);

		for (const sessionId of turnStartShells(previousStates, shellStates)) {
			const owner = owners.get(sessionId);
			if (!owner) {
				continue;
			}

			Continuity.startTurn(owner).catch((err) =>
				Logger.error("activity:turn-start-save-failed", { ...owner, err: String(err) }),
			);
			const worktree = worktrees.get(owner.shellId);
			const publishedName = publishedNames.get(sessionId);
			stampShell({
				...owner,
				...(worktree ? { cwd: worktree } : {}),
				...(publishedName ? { publishedName } : {}),
			}).catch((err) =>
				Logger.error("activity:stamp-failed", { ...owner, err: String(err) }),
			);
			SessionNamer.noteTurn(owner);
		}

		for (const sessionId of attentionEntryShells(previousStates, shellStates)) {
			const owner = owners.get(sessionId);
			if (!owner) {
				continue;
			}

			const needsAttention = attention.get(owner.shellId);
			pushNeedsAttention({ ...owner, ...(needsAttention ? { attention: needsAttention } : {}) }).catch((err) =>
				Logger.error("push:attention-failed", { ...owner, err: String(err) })
			);
		}

		for (const sessionId of doneEntryShells(previousStates, shellStates)) {
			const owner = owners.get(sessionId);
			if (!owner) {
				continue;
			}

			Continuity.finishTurn({
				...owner,
				at: statusSince.get(owner.shellId) ?? Date.now(),
			}).catch((err) =>
				Logger.error("activity:turn-finish-save-failed", { ...owner, err: String(err) }),
			);
			pushTurnDone(owner).catch((err) => Logger.error("push:done-failed", { ...owner, err: String(err) }));
		}

		for (const projectId of new Set([
			...previous.keys(),
			...nextSnapshots.keys(),
		])) {
			const before = previous.get(projectId);
			const after = nextSnapshots.get(projectId) ?? emptySnapshot();
			if (!sameSnapshot(before, after)) {
				this.notify(projectId, after);
			}
		}
	}

	private async captureTurnBaseline(baseline: {
		owner: ShellOwner;
		worktree?: string;
	}): Promise<void> {
		const path =
			baseline.worktree ?? (await Projects.find(baseline.owner.projectId)).path;
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
