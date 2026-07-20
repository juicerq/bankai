import type { Workspace, WorkspaceCommand } from "@core/store/workspace";
import type { SessionRef } from "@core/harness/registry";
import { SPLIT_RATIO_DEFAULT } from "@core/workspace/WorkspaceGroup";

type PlannedTab = { split: boolean; splitRatio: number } & (
	| { runningSession: WorkspaceCommand; resumable: boolean }
	| { runningSession?: undefined; resumable?: undefined }
);

type RestorePlanBase = {
	projects: { projectId: string; tabs: PlannedTab[]; activeTab: number }[];
	focusedIndex: number;
	focus: Workspace["focus"];
	zen: Workspace["zen"];
};
export type RestorePlan = RestorePlanBase & (
	| { screen: "command"; reviewSession: null }
	| { screen: "review"; reviewSession: SessionRef }
);

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
	const projectIds = new Set(projects.map((project) => project.id));

	const plannedProjects = workspace.projects.flatMap((wp) => {
		if (!projectIds.has(wp.projectId)) {
			return [];
		}

		return [
			{
				projectId: wp.projectId,
				tabs: wp.tabs.map((tab): PlannedTab => {
					const split = tab.split === true;
					const splitRatio = tab.splitRatio ?? SPLIT_RATIO_DEFAULT;
					if (tab.state === "bound" && tab.running) {
						return {
							split,
							splitRatio,
							runningSession: { session: tab.session, ...tab.running },
							resumable: tabTranscripts.has(`${tab.session.harness}:${tab.session.sessionId}`),
						};
					}

					return { split, splitRatio };
				}),
				activeTab: clampActive(wp.activeTab, wp.tabs.length),
			},
		];
	});

	const focusedIndex = workspace.focusedProjectId === null
		? 0
		: Math.max(0, plannedProjects.findIndex((project) => project.projectId === workspace.focusedProjectId));

	const base = {
		projects: plannedProjects,
		focusedIndex,
		focus: workspace.focus,
		zen: workspace.zen,
	};
	if (workspace.screen === "review" && reviewTranscriptExists) {
		return { ...base, screen: "review", reviewSession: workspace.reviewSession };
	}
	return { ...base, screen: "command", reviewSession: null };
}
