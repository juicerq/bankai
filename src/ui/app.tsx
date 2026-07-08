import { homedir } from "node:os";
import { basename } from "node:path";
import { useEffect, useState } from "react";
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
import { TabSupervisor } from "@core/terminal/TabSupervisor";
import { Ui } from "@ui/components";
import { theme } from "@ui/theme";
import type { TabGroup, TabStatus } from "@ui/types";

type Overlay = { kind: "rename" } | null;

const INITIAL_COLS = 80;
const INITIAL_ROWS = 24;
const BIND_POLL_MS = 2000;
const HOME = homedir();

export function App({ initialProjects }: { initialProjects: Project[] }) {
	const [supervisor] = useState(() => new TabSupervisor());
	const [reviewModel] = useState(() => new ReviewModel());
	const [gateway] = useState(() => new HookGateway());
	const [projects, setProjects] = useState(initialProjects);
	const [activeIndex, setActiveIndex] = useState(0);
	const [groups, setGroups] = useState<Record<string, TabGroup>>({});
	const [focus, setFocus] = useState<"sidebar" | "terminal">("sidebar");
	const [overlay, setOverlay] = useState<Overlay>(null);
	const [picker, setPicker] = useState<{ entries: DirEntry[] } | null>(null);
	const [bindings, setBindings] = useState<Record<string, string>>({});
	const [reviewed, setReviewed] = useState<Record<string, string[]>>({});
	const [backfill, setBackfill] = useState<Record<string, Turn[]>>({});
	const [review, setReview] = useState<{ sessionId: string | null } | null>(null);
	const [leader, setLeader] = useState(false);
	const [zenMode, setZenMode] = useState(false);
	const [, bumpStatus] = useState(0);

	const activeProject = projects[activeIndex];
	const group = activeProject ? groups[activeProject.id] : undefined;
	const activeTabId = group?.tabs[group.active];
	const terminalFocused =
		focus === "terminal" && activeTabId !== undefined && overlay === null && picker === null;

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
			SessionBinder.resolveMany(procFs, sessionsFs, supervisor.pids())
				.then((resolved) => setBindings((prev) => ({ ...prev, ...resolved })))
				.catch((err) => Logger.error("session:bind-failed", String(err)));
		}, BIND_POLL_MS);

		return () => {
			offEvent();
			offChange();
			clearInterval(poll);
			gateway.stop().catch((err) => Logger.error("hooks:gateway-stop-failed", String(err)));
		};
	}, [gateway, reviewModel, supervisor]);

	const statuses: Record<string, TabStatus> = {};
	for (const tabId of group?.tabs ?? []) {
		const sessionId = bindings[tabId];
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

	const openTab = () => {
		if (!activeProject) {
			return;
		}

		const projectId = activeProject.id;
		const tabId = supervisor.open({ cwd: activeProject.cwd, cols: INITIAL_COLS, rows: INITIAL_ROWS });
		supervisor.onExit(tabId, () => closeTab(projectId, tabId));

		setGroups((prev) => {
			const current = prev[projectId] ?? { tabs: [], active: 0 };
			const tabs = [...current.tabs, tabId];
			return { ...prev, [projectId]: { tabs, active: tabs.length - 1 } };
		});
		setFocus("terminal");
	};

	const closeActiveTab = () => {
		if (activeProject && activeTabId) {
			closeTab(activeProject.id, activeTabId);
		}
	};

	const switchTab = (index: number) => {
		if (!activeProject || !group || index >= group.tabs.length) {
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
		const sessionId = activeTabId ? bindings[activeTabId] : undefined;
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
		if (zenMode) {
			setZenMode(false);
			return;
		}

		if (review) {
			setZenMode(true);
			return;
		}

		if (!activeTabId) {
			return;
		}

		setZenMode(true);
		setFocus("terminal");
	};

	useKeyboard((key) => {
		if (overlay || picker) {
			return;
		}

		if (leader) {
			setLeader(false);

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
					return;
				default:
					if (key.name.length === 1 && key.name >= "1" && key.name <= "9") {
						switchTab(Number(key.name) - 1);
					}
			}

			return;
		}

		if (key.ctrl && key.name === "x") {
			setLeader(true);
			return;
		}

		if (review) {
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
