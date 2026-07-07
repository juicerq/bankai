import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { Logger } from "@core/logger";
import { type Project, Projects } from "@core/store/projects";
import { TabSupervisor } from "@core/terminal/TabSupervisor";
import { Ui } from "@ui/components";
import { theme } from "@ui/theme";
import type { TabGroup } from "@ui/types";

type Overlay = { kind: "add" } | { kind: "rename" } | null;

const INITIAL_COLS = 80;
const INITIAL_ROWS = 24;

export function App({ initialProjects }: { initialProjects: Project[] }) {
	const [supervisor] = useState(() => new TabSupervisor());
	const [projects, setProjects] = useState(initialProjects);
	const [activeIndex, setActiveIndex] = useState(0);
	const [groups, setGroups] = useState<Record<string, TabGroup>>({});
	const [focus, setFocus] = useState<"sidebar" | "terminal">("sidebar");
	const [overlay, setOverlay] = useState<Overlay>(null);

	const activeProject = projects[activeIndex];
	const group = activeProject ? groups[activeProject.id] : undefined;
	const activeTabId = group?.tabs[group.active];
	const terminalFocused = focus === "terminal" && activeTabId !== undefined && overlay === null;

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

	const addProject = (cwd: string, name: string) => {
		setOverlay(null);
		Projects.add({ cwd, name })
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

	useKeyboard((key) => {
		if (overlay) {
			return;
		}

		if (key.option) {
			if (key.name === "s") {
				setFocus("sidebar");
				return;
			}
			if (key.name === "left") {
				cycleTab(-1);
				return;
			}
			if (key.name === "right") {
				cycleTab(1);
				return;
			}
			if (key.name.length === 1 && key.name >= "1" && key.name <= "9") {
				switchTab(Number(key.name) - 1);
				return;
			}
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
				setOverlay({ kind: "add" });
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

	return (
		<box style={{ width: "100%", height: "100%", flexDirection: "row", backgroundColor: theme.bg }}>
			<Ui.ProjectSidebar projects={projects} activeIndex={activeIndex} />

			<Ui.TerminalBody
				project={activeProject}
				group={group}
				supervisor={supervisor}
				activeTabId={activeTabId}
				terminalFocused={terminalFocused}
			/>

			{overlay?.kind === "add" && (
				<Ui.ProjectAddOverlay onSubmit={addProject} onCancel={() => setOverlay(null)} />
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
