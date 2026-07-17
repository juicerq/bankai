import type { TabGroup } from "@core/workspace/WorkspaceGroup";

type Groups = Record<string, TabGroup>;

export const WorkspaceGroups = {
	hasTabs(groups: Groups, projectId: string): boolean {
		return !!groups[projectId]?.tabs.length;
	},

	activeTabId(groups: Groups, projectId: string): string | undefined {
		const group = groups[projectId];
		return group?.tabs[group.active];
	},

	add(groups: Groups, projectId: string, tabId: string): Groups {
		const group = groups[projectId] ?? { tabs: [], active: 0 };
		const tabs = [...group.tabs, tabId];
		return {
			...groups,
			[projectId]: { tabs, active: tabs.length - 1 },
		};
	},

	remove(groups: Groups, tabId: string): Groups {
		const entry = Object.entries(groups).find(([, group]) => group.tabs.includes(tabId));
		if (!entry) {
			return groups;
		}

		const [projectId, group] = entry;
		const tabs = group.tabs.filter((candidate) => candidate !== tabId);
		return {
			...groups,
			[projectId]: {
				tabs,
				active: Math.max(0, Math.min(group.active, tabs.length - 1)),
			},
		};
	},

	removeProject(groups: Groups, projectId: string): Groups {
		const next = { ...groups };
		delete next[projectId];
		return next;
	},

	select(groups: Groups, projectId: string, index: number): Groups | null {
		const group = groups[projectId];
		if (!group || index < 0 || index >= group.tabs.length) {
			return null;
		}
		return {
			...groups,
			[projectId]: { ...group, active: index },
		};
	},

	cycle(groups: Groups, projectId: string, direction: -1 | 1): Groups {
		const group = groups[projectId];
		if (!group?.tabs.length) {
			return groups;
		}
		return {
			...groups,
			[projectId]: {
				...group,
				active: (group.active + direction + group.tabs.length) % group.tabs.length,
			},
		};
	},
};
