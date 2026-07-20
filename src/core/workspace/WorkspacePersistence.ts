import type { SessionRef } from "@core/harness/registry";
import { Logger } from "@core/logger";
import { type Workspace, WorkspaceStore } from "@core/store/workspace";
import type { TabGroup } from "@core/workspace/WorkspaceGroup";

export type WorkspacePersistenceInput = {
	projects: { id: string }[];
	groups: Record<string, TabGroup>;
	activeIndex: number;
	focus: Workspace["focus"];
	zen: Workspace["zen"];
	screen: Workspace["screen"];
	reviewSession: SessionRef | null;
	captures: Record<string, Workspace["projects"][number]["tabs"][number]>;
};

function workspaceValue(input: WorkspacePersistenceInput): Workspace {
	const projects = input.projects.flatMap((project) => {
		const group = input.groups[project.id];
		if (!group) {
			return [];
		}

		return [{
			projectId: project.id,
			tabs: group.tabs.map((tab) => ({
				...(input.captures[tab.id] ?? { state: "empty" as const }),
				split: tab.split,
				splitRatio: tab.splitRatio,
			})),
			activeTab: group.active,
		}];
	});
	const focusedProject = input.projects[input.activeIndex];
	const focusedProjectId = focusedProject ? focusedProject.id : null;
	const base = {
		projects,
		focusedProjectId,
		focus: input.focus,
		zen: input.zen,
	};

	return input.screen === "review" && input.reviewSession
		? { ...base, screen: "review", reviewSession: input.reviewSession }
		: { ...base, screen: "command", reviewSession: null };
}

export const WorkspacePersistence = {
	async save(input: WorkspacePersistenceInput): Promise<void> {
		await WorkspaceStore.write(workspaceValue(input))
			.catch((err) => Logger.error("workspace:write-failed", String(err)));
	},
};
