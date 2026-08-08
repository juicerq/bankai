import { type FSWatcher, watch } from "node:fs";
import type { AgentPresence } from "@main/agents/harness/harness";
import { Harnesses } from "@main/agents/harness/harnesses";
import { ProcFs } from "@main/infra/proc-fs";
import { SessionBinder } from "@main/agents/session/session-binder";
import { type SessionRef } from "@main/agents/session/session-refs";
import { SessionRefs } from "@main/agents/session/session-refs";
import { ShellFacts } from "@main/agents/session/shell-facts";
import type { Worktree } from "@shared/review";
import { GitProcess } from "@main/git/git-process";
import { ProjectWorktrees } from "@main/git/worktree/project-worktrees";
import { ReviewChanges } from "@main/git/review/review-changes";
import { Worktrees } from "@main/git/worktree/worktrees";
import { Logger } from "@main/infra/logger";
import { NotifyAttention } from "@main/push/notify-attention";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { shellProcesses } from "@main/terminal/shell-processes";
import { DesktopAttention } from "@main/desktop/desktop-attention";
import type { AgentActivityState, ProjectActivitySnapshot } from "@shared/activity";
import type { ContinuityValue } from "@shared/continuity";
import {
	ShellActivity,
	type DoneShell,
	type ShellOwner,
} from "@main/agents/shell-activity";
import { throttle } from "@shared/throttle";

const ACTIVITY_POLL_MS = 1500;

const EVENT_PASS_MS = 150;

type ActivityPass = "full" | "event";

function missingPath(err: unknown): boolean {
	return err instanceof Error && "code" in err && err.code === "ENOENT";
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

async function locateWorktree(
	projectPath: string,
	cwd: string,
): Promise<Worktree | undefined> {
	const listed = await ProjectWorktrees.list(projectPath).catch((err) => {
		Logger.error("activity:worktrees-failed", {
			projectPath,
			err: String(err),
		});
		return [];
	});
	const found = Worktrees.containing(listed, cwd);
	if (found) {
		return found;
	}

	const fresh = await ProjectWorktrees.list(projectPath, { fresh: true }).catch(
		() => listed,
	);

	return Worktrees.containing(fresh, cwd);
}


function sameRecord<T>(
	before: Record<string, T>,
	after: Record<string, T>,
): boolean {
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

	return sameRecord(
		before?.harnessByShellId ?? {},
		after?.harnessByShellId ?? {},
	);
}

function emptySnapshot(): ProjectActivitySnapshot {
	return {
		shells: {},
		worktreeByShellId: {},
		statusSinceByShellId: {},
		harnessByShellId: {},
	};
}

type ActivityListener = (snapshot: ProjectActivitySnapshot) => void;

class AgentActivityTracker {
	private shellStates = new Map<string, AgentActivityState>();
	private doneShells = new Map<string, DoneShell>();
	private projectSnapshots = new Map<string, ProjectActivitySnapshot>();
	private readonly listeners = new Map<string, Set<ActivityListener>>();
	private boundSessions = new Set<string>();
	private sessionRefs = new Map<string, SessionRef>();
	private shellWorktrees = new Map<string, string>();
	private statusSince = new Map<string, number>();
	private agentCwds = new Map<string, string>();
	private readonly noteWrite = throttle(() => this.runTick("event"), EVENT_PASS_MS);
	private readonly harnessWatchers = new Map<string, FSWatcher>();
	private timer: ReturnType<typeof setInterval> | undefined;
	private stopped = false;
	private ticking = false;
	private queuedPass: ActivityPass | undefined;
	private tickWaiters: (() => void)[] = [];

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
	}

	stop(): void {
		this.stopped = true;
		clearInterval(this.timer);
		this.timer = undefined;
		this.watchHarnessFiles([]);
	}

	private noteContinuity(value: ContinuityValue): void {
		const next = ShellActivity.doneShells(value);
		if (sameDoneShells(this.doneShells, next)) {
			return;
		}

		this.doneShells = next;
		this.runTick("event");
	}

	private watchHarnessFiles(declared: string[]): void {
		const paths = new Set(declared);

		for (const [path, watcher] of this.harnessWatchers) {
			if (!paths.has(path)) {
				watcher.close();
				this.harnessWatchers.delete(path);
			}
		}

		for (const path of paths) {
			if (this.harnessWatchers.has(path)) {
				continue;
			}

			this.attachWatcher(path);
		}
	}

	private attachWatcher(path: string): void {
		try {
			const watcher = watch(path, () => this.noteWrite());
			watcher.unref();
			watcher.on("error", () => {
				watcher.close();
				this.harnessWatchers.delete(path);
			});
			this.harnessWatchers.set(path, watcher);
		} catch (err) {
			if (!missingPath(err)) {
				Logger.warn("activity:harness-watch-failed", { path, err: String(err) });
			}
		}
	}

	getProjectSnapshot(projectId: string): ProjectActivitySnapshot {
		return this.projectSnapshots.get(projectId) ?? emptySnapshot();
	}

	liveAgentSessions(): ReadonlySet<string> {
		return this.boundSessions;
	}

	refresh(): Promise<void> {
		return new Promise((resolve) => {
			this.tickWaiters.push(resolve);
			this.runTick("full");
		});
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
					return;
				}

				for (const resolve of this.tickWaiters.splice(0)) {
					resolve();
				}
			});
	}

	private async tick(pass: ActivityPass): Promise<void> {
		if (this.stopped) {
			return;
		}

		const shells = shellProcesses.list();
		const owners = ShellActivity.owners(shells);
		if (shells.length === 0) {
			this.boundSessions = new Set();
			this.sessionRefs = new Map();
			this.agentCwds.clear();
			this.watchHarnessFiles([]);
			this.commit({
				shellStates: new Map(),
				owners,
				worktrees: new Map(),
				statusSince: new Map(),
				harnesses: new Map(),
			});
			return;
		}

		const presences = await Harnesses.discoverAgents();
		const liveByPid = new Map<number, AgentPresence>();
		await Promise.all(
			presences.map(async (presence) => {
				const start = await ProcFs.procStart(presence.pid);
				if (start !== null && start === presence.procStart) {
					liveByPid.set(presence.pid, presence);
				}
			}),
		);
		const bindings = await SessionBinder.bind({
			shells,
			agents: liveByPid.keys(),
			parentOf: ProcFs.parent,
		});
		this.boundSessions = new Set(bindings.keys());

		const sessionRefsChanged = this.captureSessionRefs(shells, bindings, liveByPid);
		const worktrees = pass === "full"
			? await this.observeWorktrees(shells, bindings, liveByPid)
			: this.shellWorktrees;

		const nextStates = new Map<string, AgentActivityState>();
		const statusSince = new Map<string, number>();
		const harnesses = new Map<string, string>();
		for (const shell of shells) {
			const boundPid = bindings.get(shell.sessionId);
			const presence =
				boundPid === undefined ? undefined : liveByPid.get(boundPid);
			const status = presence?.status;

			const previous = this.shellStates.get(shell.sessionId);
			const next = ShellActivity.next(previous, status);
			if (next !== undefined) {
				nextStates.set(shell.sessionId, next);
			}
			if (presence) {
				harnesses.set(shell.shellId, presence.harness);
			}

			const since = ShellActivity.clockSince({
				previous,
				next,
				held: this.statusSince.get(shell.shellId),
				reported: presence?.statusSince,
			});
			if (since) {
				statusSince.set(shell.shellId, since);
			}
		}

		if (pass === "full") {
			this.watchHarnessFiles(Harnesses.watchPaths());
		}
		const stateChanged = ShellActivity.turnStarts(this.shellStates, nextStates).length > 0
			|| ShellActivity.doneEntries(this.shellStates, nextStates).length > 0;
		if (pass === "event" || sessionRefsChanged || stateChanged) {
			await this.refreshSessionNames(shells, bindings, liveByPid);
		}
		this.commit({
			shellStates: nextStates,
			owners,
			worktrees,
			statusSince,
			harnesses,
		});
	}

	private async refreshSessionNames(
		shells: { sessionId: string; shellId: string; projectId: string }[],
		bindings: Map<string, number>,
		liveByPid: Map<number, AgentPresence>,
	): Promise<void> {
		await Promise.all(shells.map(async (shell) => {
			const boundPid = bindings.get(shell.sessionId);
			const presence = boundPid === undefined ? undefined : liveByPid.get(boundPid);
			if (!presence?.sessionId) {
				return;
			}

			await ShellFacts.name({
				projectId: shell.projectId,
				shellId: shell.shellId,
				session: { harness: presence.harness, sessionId: presence.sessionId, cwd: presence.cwd },
			}).catch((err) => {
				Logger.error("activity:name-failed", { projectId: shell.projectId, shellId: shell.shellId, err: String(err) });
			});
		}));
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

		return ShellActivity.nextWorktrees(this.shellWorktrees, observed);
	}

	private captureSessionRefs(
		shells: { sessionId: string; shellId: string; projectId: string }[],
		bindings: Map<string, number>,
		liveByPid: Map<number, AgentPresence>,
	): boolean {
		if (this.stopped) {
			return false;
		}

		const observations = shells.map((shell) => {
			const boundPid = bindings.get(shell.sessionId);
			const presence =
				boundPid === undefined ? undefined : liveByPid.get(boundPid);

			return {
				shellId: shell.shellId,
				projectId: shell.projectId,
				agentBound: presence !== undefined,
				session: presence?.sessionId
					? {
							harness: presence.harness,
							sessionId: presence.sessionId,
							cwd: presence.cwd,
						}
					: undefined,
			};
		});

		const { changes, next } = SessionRefs.reconcile(
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

		return changes.some((change) => change.kind === "upsert");
	}

	private commit({
		shellStates,
		owners,
		worktrees,
		statusSince,
		harnesses,
	}: {
		shellStates: Map<string, AgentActivityState>;
		owners: Map<string, ShellOwner>;
		worktrees: Map<string, string>;
		statusSince: Map<string, number>;
		harnesses: Map<string, string>;
	}): void {
		const previousStates = this.shellStates;
		const previousWorktrees = this.shellWorktrees;
		const previous = this.projectSnapshots;
		const nextSnapshots = ShellActivity.snapshotsByProject({
			shellStates,
			owners,
			worktrees,
			statusSince,
			harnesses,
			doneShells: this.doneShells,
		});
		this.shellStates = shellStates;
		this.shellWorktrees = worktrees;
		this.statusSince = statusSince;
		this.projectSnapshots = nextSnapshots;

		const baselines = ShellActivity.turnBaselines({
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

		for (const sessionId of ShellActivity.turnStarts(previousStates, shellStates)) {
			const owner = owners.get(sessionId);
			if (!owner) {
				continue;
			}

			Continuity.startTurn(owner).catch((err) =>
				Logger.error("activity:turn-start-save-failed", { ...owner, err: String(err) }),
			);
			const worktree = worktrees.get(owner.shellId);
			ShellFacts.stamp({
				...owner,
				...(worktree ? { cwd: worktree } : {}),
			}).catch((err) =>
				Logger.error("activity:stamp-failed", { ...owner, err: String(err) }),
			);
		}

		const attentionEntries = ShellActivity.attentionEntries(previousStates, shellStates);
		if (attentionEntries.length > 0) {
			DesktopAttention.request();
		}
		for (const sessionId of attentionEntries) {
			const owner = owners.get(sessionId);
			if (!owner) {
				continue;
			}

			NotifyAttention.needsAttention(owner).catch((err) =>
				Logger.error("push:attention-failed", { ...owner, err: String(err) })
			);
		}

		const doneEntries = ShellActivity.doneEntries(previousStates, shellStates);
		if (doneEntries.length > 0) {
			DesktopAttention.request();
		}
		for (const sessionId of doneEntries) {
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
			NotifyAttention.turnDone(owner).catch((err) => Logger.error("push:done-failed", { ...owner, err: String(err) }));
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
