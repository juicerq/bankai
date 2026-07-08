import { homedir } from "node:os";
import { basename } from "node:path";
import { useEffect, useState } from "react";
import type { KeyEvent } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { type DirEntry, listDirs } from "@core/fs/listDirs";
import { HookGateway } from "@core/hooks/HookGateway";
import { Logger } from "@core/logger";
import { ReviewModel, type Turn } from "@core/review/ReviewModel";
import { backfillTurns } from "@core/review/TranscriptBackfill";
import { countUnreviewed } from "@core/review/unreviewed";
import { SessionBinder } from "@core/session/SessionBinder";
import { procFs } from "@core/session/procFs";
import { sessionsFs } from "@core/session/sessionsFs";
import { type Project, Projects } from "@core/store/projects";
import { ReviewState } from "@core/store/review-state";
import { type WorkspaceCommand, WorkspaceStore } from "@core/store/workspace";
import { deriveWorkspace } from "@core/workspace/deriveWorkspace";
import type { RestorePlan } from "@core/workspace/planRestore";
import { buildFreshCommand, buildResumeCommand } from "@core/workspace/resumeCommand";
import { TabSupervisor } from "@core/terminal/TabSupervisor";
import { Ui } from "@ui/components";
import { theme } from "@ui/theme";
import type { TabGroup, TabStatus } from "@ui/types";

type Overlay = { kind: "rename" } | null;
type Screen = "command" | "review";

export type RestoreReview = { sessionId: string; turns: Turn[]; reviewed: string[] };

type AppProps = {
	initialProjects: Project[];
	plan: RestorePlan;
	restoreReview: RestoreReview | null;
};

const INITIAL_COLS = 80;
const INITIAL_ROWS = 24;
const BIND_POLL_MS = 2000;
const HOME = homedir();

function sameCommand(a: WorkspaceCommand, b: WorkspaceCommand): boolean {
	if (a.sessionId !== b.sessionId || a.kind !== b.kind) {
		return false;
	}

	return (a.argv?.join("\0") ?? "") === (b.argv?.join("\0") ?? "");
}

function sameCaptures(a: Record<string, WorkspaceCommand>, b: Record<string, WorkspaceCommand>): boolean {
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) {
		return false;
	}

	for (const key of keys) {
		const left = a[key];
		const right = b[key];
		if (left === undefined || right === undefined || !sameCommand(left, right)) {
			return false;
		}
	}

	return true;
}

async function captureBindings(
	tabs: { tabId: string; pid: number }[],
): Promise<Record<string, WorkspaceCommand>> {
	const resolved = await SessionBinder.resolveMany(procFs, sessionsFs, tabs);
	const captures: Record<string, WorkspaceCommand> = {};

	await Promise.all(
		Object.entries(resolved).map(async ([tabId, binding]) => {
			const command: WorkspaceCommand = { sessionId: binding.sessionId };
			const argv = await procFs.cmdline(binding.pid);
			if (argv) {
				command.argv = argv;
			}
			if (binding.kind !== undefined) {
				command.kind = binding.kind;
			}

			captures[tabId] = command;
		}),
	);

	return captures;
}

export function App({ initialProjects, plan, restoreReview }: AppProps) {
	const [supervisor] = useState(() => new TabSupervisor());
	const [reviewModel] = useState(() => new ReviewModel());
	const [gateway] = useState(() => new HookGateway());
	const [projects, setProjects] = useState(initialProjects);
	const [activeIndex, setActiveIndex] = useState(plan.focusedIndex);
	const [groups, setGroups] = useState<Record<string, TabGroup>>({});
	const [focus, setFocus] = useState<"sidebar" | "terminal">(plan.focus);
	const [overlay, setOverlay] = useState<Overlay>(null);
	const [picker, setPicker] = useState<{ entries: DirEntry[] } | null>(null);
	const [captures, setCaptures] = useState<Record<string, WorkspaceCommand>>({});
	const [restored, setRestored] = useState(false);
	const [reviewed, setReviewed] = useState<Record<string, string[]>>(
		restoreReview ? { [restoreReview.sessionId]: restoreReview.reviewed } : {},
	);
	const [backfill, setBackfill] = useState<Record<string, Turn[]>>(
		restoreReview ? { [restoreReview.sessionId]: restoreReview.turns } : {},
	);
	const [review, setReview] = useState<{ sessionId: string | null } | null>(
		plan.screen === "review" ? { sessionId: plan.reviewSessionId } : null,
	);
	const [leader, setLeader] = useState(false);
	const [zen, setZen] = useState<Record<Screen, boolean>>(plan.zen);
	const [, bumpStatus] = useState(0);

	const activeProject = projects[activeIndex];
	const group = activeProject ? groups[activeProject.id] : undefined;
	const activeTabId = group?.tabs[group.active];
	const terminalFocused =
		focus === "terminal" && activeTabId !== undefined && overlay === null && picker === null;
	const screen: Screen = review ? "review" : "command";
	const zenMode = zen[screen];

	useEffect(() => {
		gateway.start().catch((err) => Logger.error("hooks:gateway-start-failed", String(err)));

		const offEvent = gateway.onEvent((event) => reviewModel.apply(event));
		const offChange = reviewModel.onChange((sessionId) => {
			bumpStatus((tick) => tick + 1);
			ReviewState.get(sessionId)
				.then((ids) => setReviewed((prev) => ({ ...prev, [sessionId]: ids })))
				.catch((err) => Logger.error("review:reviewed-read-failed", String(err)));
		});

		const poll = setInterval(() => {
			captureBindings(supervisor.pids())
				.then((captures) => {
					setCaptures((prev) => {
						const merged = { ...prev, ...captures };
						return sameCaptures(prev, merged) ? prev : merged;
					});
				})
				.catch((err) => Logger.error("session:bind-failed", String(err)));
		}, BIND_POLL_MS);

		return () => {
			offEvent();
			offChange();
			clearInterval(poll);
			gateway.stop().catch((err) => Logger.error("hooks:gateway-stop-failed", String(err)));
		};
	}, [gateway, reviewModel, supervisor]);

	useEffect(() => {
		const cwdById = new Map(initialProjects.map((project) => [project.id, project.cwd]));
		const nextGroups: Record<string, TabGroup> = {};
		const nextCaptures: Record<string, WorkspaceCommand> = {};

		for (const planned of plan.projects) {
			const cwd = cwdById.get(planned.projectId);
			if (cwd === undefined) {
				continue;
			}

			const tabs: string[] = [];
			for (const tab of planned.tabs) {
				const tabId = spawnTab(planned.projectId, cwd);
				tabs.push(tabId);

				if (tab.command) {
					nextCaptures[tabId] = tab.command;
					const command = tab.resumable ? buildResumeCommand(tab.command) : buildFreshCommand(tab.command);
					supervisor.input(tabId, `${command}\n`);
				}
			}

			nextGroups[planned.projectId] = { tabs, active: planned.activeTab };
		}

		setGroups(nextGroups);
		setCaptures(nextCaptures);
		setRestored(true);
	}, []);

	useEffect(() => {
		if (!restored) {
			return;
		}

		const workspace = deriveWorkspace({ projects, groups, activeIndex, focus, zen, review, captures });
		WorkspaceStore.write(workspace).catch((err) => Logger.error("workspace:write-failed", String(err)));
	}, [restored, projects, groups, activeIndex, focus, zen, review, captures]);

	const statuses: Record<string, TabStatus> = {};
	for (const tabId of group?.tabs ?? []) {
		const sessionId = captures[tabId]?.sessionId;
		if (!sessionId) {
			continue;
		}

		statuses[tabId] = {
			status: reviewModel.getStatus(sessionId),
			unreviewed: countUnreviewed(reviewModel.getTurns(sessionId), reviewed[sessionId] ?? []) > 0,
		};
	}

	const selectProject = (direction: -1 | 1) => {
		if (projects.length === 0) {
			return;
		}

		setActiveIndex((prev) => (prev + direction + projects.length) % projects.length);
	};

	const selectProjectByIndex = (index: number) => {
		const project = projects[index];
		if (!project) {
			return;
		}

		setActiveIndex(index);

		if (groups[project.id]?.tabs.length) {
			setFocus("terminal");
			return;
		}

		openTabFor(project);
	};

	const reorder = (direction: "up" | "down") => {
		if (!activeProject) {
			return;
		}

		const moved = activeProject.id;
		Projects.move({ id: moved, direction })
			.then((list) => {
				setProjects(list);
				setActiveIndex(list.findIndex((p) => p.id === moved));
			})
			.catch((err) => Logger.error("projects:move-failed", String(err)));
	};

	const removeActiveProject = () => {
		if (!activeProject) {
			return;
		}

		const removed = activeProject.id;
		for (const tabId of groups[removed]?.tabs ?? []) {
			supervisor.close(tabId);
		}

		setGroups((prev) => {
			const next = { ...prev };
			delete next[removed];
			return next;
		});
		setFocus("sidebar");

		Projects.remove(removed)
			.then((list) => {
				setProjects(list);
				setActiveIndex((prev) => Math.max(0, Math.min(prev, list.length - 1)));
			})
			.catch((err) => Logger.error("projects:remove-failed", String(err)));
	};

	const openPicker = () => {
		listDirs(HOME)
			.then((entries) => setPicker({ entries }))
			.catch((err) => Logger.error("picker:open-failed", String(err)));
	};

	const pickDir = (cwd: string) => {
		setPicker(null);
		const existing = projects.findIndex((project) => project.cwd === cwd);
		if (existing >= 0) {
			setActiveIndex(existing);
			return;
		}

		Projects.add({ cwd, name: basename(cwd) })
			.then((list) => {
				setProjects(list);
				setActiveIndex(list.length - 1);

				const added = list.at(-1);
				if (added) {
					openTabFor(added);
				}
			})
			.catch((err) => Logger.error("projects:add-failed", String(err)));
	};

	const renameActiveProject = (name: string) => {
		setOverlay(null);
		if (!activeProject) {
			return;
		}

		Projects.rename(activeProject.id, name)
			.then(setProjects)
			.catch((err) => Logger.error("projects:rename-failed", String(err)));
	};

	const closeTab = (projectId: string, tabId: string) => {
		supervisor.close(tabId);
		setGroups((prev) => {
			const current = prev[projectId];
			if (!current) {
				return prev;
			}

			const tabs = current.tabs.filter((id) => id !== tabId);
			return { ...prev, [projectId]: { tabs, active: Math.min(current.active, tabs.length - 1) } };
		});
	};

	const spawnTab = (projectId: string, cwd: string) => {
		const tabId = supervisor.open({ cwd, cols: INITIAL_COLS, rows: INITIAL_ROWS });
		supervisor.onExit(tabId, () => closeTab(projectId, tabId));

		return tabId;
	};

	const openTabFor = (project: Project) => {
		const projectId = project.id;
		const tabId = spawnTab(projectId, project.cwd);

		setGroups((prev) => {
			const current = prev[projectId] ?? { tabs: [], active: 0 };
			const tabs = [...current.tabs, tabId];
			return { ...prev, [projectId]: { tabs, active: tabs.length - 1 } };
		});
		setFocus("terminal");
	};

	const openTab = () => {
		if (!activeProject) {
			return;
		}

		openTabFor(activeProject);
	};

	const closeActiveTab = () => {
		if (activeProject && activeTabId) {
			closeTab(activeProject.id, activeTabId);
		}
	};

	const switchTab = (index: number) => {
		if (!activeProject) {
			return;
		}

		if (!group || index >= group.tabs.length) {
			openTabFor(activeProject);
			return;
		}

		setGroups((prev) => ({ ...prev, [activeProject.id]: { ...group, active: index } }));
		setFocus("terminal");
	};

	const cycleTab = (direction: -1 | 1) => {
		if (!group || group.tabs.length === 0) {
			return;
		}

		switchTab((group.active + direction + group.tabs.length) % group.tabs.length);
	};

	const enterTerminal = () => {
		if (activeTabId) {
			setFocus("terminal");
		} else {
			openTab();
		}
	};

	const openReview = () => {
		const sessionId = activeTabId ? captures[activeTabId]?.sessionId : undefined;
		if (!sessionId) {
			setReview({ sessionId: null });
			return;
		}

		setReview({ sessionId });
		ReviewState.get(sessionId)
			.then((ids) => setReviewed((prev) => ({ ...prev, [sessionId]: ids })))
			.catch((err) => Logger.error("review:reviewed-read-failed", String(err)));

		if (reviewModel.getTurns(sessionId).length === 0) {
			backfillTurns(sessionId)
				.then((turns) => setBackfill((prev) => ({ ...prev, [sessionId]: turns })))
				.catch((err) => Logger.error("review:backfill-failed", String(err)));
		}
	};

	const toggleReviewed = (turnId: string) => {
		const sessionId = review?.sessionId;
		if (!sessionId) {
			return;
		}

		const next = !(reviewed[sessionId] ?? []).includes(turnId);

		ReviewState.setReviewed({ sessionId, turnId, reviewed: next })
			.then((ids) => setReviewed((prev) => ({ ...prev, [sessionId]: ids })))
			.catch((err) => Logger.error("review:toggle-failed", String(err)));
	};

	const liveTurns = review?.sessionId ? reviewModel.getTurns(review.sessionId) : [];
	const reviewTurns =
		liveTurns.length > 0 ? liveTurns : review?.sessionId ? (backfill[review.sessionId] ?? []) : [];

	const toggleZenMode = () => {
		if (screen === "command" && !zenMode && !activeTabId) {
			return;
		}

		setZen((prev) => ({ ...prev, [screen]: !prev[screen] }));

		if (screen === "command" && !zenMode) {
			setFocus("terminal");
		}
	};

	const handleLeaderCommand = (key: KeyEvent) => {
		if (key.name === "f") {
			toggleZenMode();
			return;
		}

		if (key.name === "q") {
			supervisor.disposeAll();
			process.exit(0);
		}

		if (review) {
			return;
		}

		if (key.ctrl && key.name === "x") {
			if (activeTabId) {
				supervisor.input(activeTabId, key.raw);
			}
			return;
		}

		switch (key.name) {
			case "s":
				setFocus("sidebar");
				return;
			case "r":
				openReview();
				return;
			case "n":
				openTab();
				return;
			case "d":
			case "x":
				closeActiveTab();
				return;
			case "left":
				cycleTab(-1);
				return;
			case "right":
			case "tab":
				cycleTab(1);
		}
	};

	useKeyboard((key) => {
		if (overlay || picker) {
			return;
		}

		if (leader) {
			setLeader(false);
			handleLeaderCommand(key);
			return;
		}

		if (key.ctrl && key.name === "x") {
			setLeader(true);
			return;
		}

		if (review) {
			return;
		}

		const numberKey = key.name.length === 1 && key.name >= "1" && key.name <= "9" ? Number(key.name) - 1 : null;

		if (numberKey !== null && key.ctrl) {
			selectProjectByIndex(numberKey);
			return;
		}

		if (numberKey !== null && (key.option || key.meta)) {
			switchTab(numberKey);
			return;
		}

		if (terminalFocused && activeTabId) {
			supervisor.input(activeTabId, key.raw);
			return;
		}

		switch (key.name) {
			case "up":
			case "k":
				if (key.shift) {
					reorder("up");
				} else {
					selectProject(-1);
				}
				return;
			case "down":
			case "j":
				if (key.shift) {
					reorder("down");
				} else {
					selectProject(1);
				}
				return;
			case "return":
			case "right":
			case "l":
				enterTerminal();
				return;
			case "n":
				openTab();
				return;
			case "x":
				closeActiveTab();
				return;
			case "a":
				openPicker();
				return;
			case "r":
				if (activeProject) {
					setOverlay({ kind: "rename" });
				}
				return;
			case "d":
				removeActiveProject();
		}
	});

	if (review) {
		return (
			<Ui.ReviewScreen
				key={review.sessionId ?? "unbound"}
				sessionId={review.sessionId}
				turns={reviewTurns}
				reviewedTurnIds={review.sessionId ? (reviewed[review.sessionId] ?? []) : []}
				onToggleReviewed={toggleReviewed}
				onClose={() => setReview(null)}
				zenMode={zenMode}
			/>
		);
	}

	return (
		<box style={{ width: "100%", height: "100%", flexDirection: "row", backgroundColor: theme.bg }}>
			{!zenMode && <Ui.ProjectSidebar projects={projects} activeIndex={activeIndex} />}

			<Ui.TerminalBody
				project={activeProject}
				group={group}
				supervisor={supervisor}
				activeTabId={activeTabId}
				terminalFocused={terminalFocused}
				statuses={statuses}
				leader={leader}
				zenMode={zenMode}
			/>

			{picker && (
				<Ui.ProjectPicker
					home={HOME}
					initialEntries={picker.entries}
					existingCwds={projects.map((project) => project.cwd)}
					onPick={pickDir}
					onCancel={() => setPicker(null)}
				/>
			)}

			{overlay?.kind === "rename" && activeProject && (
				<Ui.ProjectRenameOverlay
					current={activeProject.name}
					onSubmit={renameActiveProject}
					onCancel={() => setOverlay(null)}
				/>
			)}
		</box>
	);
}
