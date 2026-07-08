import type { Workspace, WorkspaceCommand } from "@core/store/workspace";

type DeriveInput = {
	projects: { id: string }[];
	groups: Record<string, { tabs: string[]; active: number }>;
	activeIndex: number;
	focus: Workspace["focus"];
	zen: Workspace["zen"];
	review: { sessionId: string | null } | null;
	captures: Record<string, WorkspaceCommand>;
};

export function deriveWorkspace(input: DeriveInput): Workspace {
	const projects = input.projects.flatMap((project) => {
		const group = input.groups[project.id];
		if (!group) {
			return [];
		}

		return [
			{
				projectId: project.id,
				tabs: group.tabs.map((tabId) => {
					const command = input.captures[tabId];
					return command ? { command } : {};
				}),
				activeTab: group.active,
			},
		];
	});

	const focused = input.projects[input.activeIndex];

	return {
		projects,
		focusedProjectId: focused === undefined ? null : focused.id,
		focus: input.focus,
		zen: input.zen,
		screen: input.review ? "review" : "command",
		reviewSessionId: input.review === null ? null : input.review.sessionId,
	};
}
