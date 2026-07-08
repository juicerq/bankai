import type { Workspace, WorkspaceCommand } from "@core/store/workspace";

type PlannedTab =
	| { command: WorkspaceCommand; resumable: boolean }
	| { command?: undefined; resumable?: undefined };

export type RestorePlan = {
	projects: { projectId: string; tabs: PlannedTab[]; activeTab: number }[];
	focusedIndex: number;
	focus: Workspace["focus"];
	zen: Workspace["zen"];
	screen: Workspace["screen"];
	reviewSessionId: Workspace["reviewSessionId"];
};

type PlanInput = {
	workspace: Workspace;
	projects: { id: string }[];
	reviewTranscriptExists: boolean;
	tabTranscripts: Set<string>;
};

function clampActive(active: number, length: number): number {
	if (length === 0 || active < 0) {
		return 0;
	}

	return Math.min(active, length - 1);
}

export function planRestore({ workspace, projects, reviewTranscriptExists, tabTranscripts }: PlanInput): RestorePlan {
	const indexById = new Map(projects.map((project, index) => [project.id, index]));

	const plannedProjects = workspace.projects.flatMap((wp) => {
		if (!indexById.has(wp.projectId)) {
			return [];
		}

		return [
			{
				projectId: wp.projectId,
				tabs: wp.tabs.map((tab): PlannedTab =>
					tab.command ? { command: tab.command, resumable: tabTranscripts.has(tab.command.sessionId) } : {},
				),
				activeTab: clampActive(wp.activeTab, wp.tabs.length),
			},
		];
	});

	const focusedIndex =
		workspace.focusedProjectId === null ? 0 : (indexById.get(workspace.focusedProjectId) ?? 0);

	const reviewAlive =
		workspace.screen === "review" && workspace.reviewSessionId !== null && reviewTranscriptExists;

	return {
		projects: plannedProjects,
		focusedIndex,
		focus: workspace.focus,
		zen: workspace.zen,
		screen: reviewAlive ? "review" : "command",
		reviewSessionId: reviewAlive ? workspace.reviewSessionId : null,
	};
}
