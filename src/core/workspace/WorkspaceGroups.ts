import {
	SPLIT_RATIO_DEFAULT,
	SPLIT_RATIO_MAX,
	SPLIT_RATIO_MIN,
	type TabGroup,
} from "@core/workspace/WorkspaceGroup";

type Groups = Record<string, TabGroup>;

function clampRatio(value: number): number {
	return Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, value));
}

export const WorkspaceGroups = {
	hasTabs(groups: Groups, projectId: string): boolean {
		return !!groups[projectId]?.tabs.length;
	},

	activeTabId(groups: Groups, projectId: string): string | undefined {
		const group = groups[projectId];
		return group?.tabs[group.active]?.id;
	},

	add(groups: Groups, projectId: string, tabId: string): Groups {
		const group = groups[projectId] ?? { tabs: [], active: 0 };
		const tabs = [...group.tabs, { id: tabId, split: false, splitRatio: SPLIT_RATIO_DEFAULT }];
		return {
			...groups,
			[projectId]: { tabs, active: tabs.length - 1 },
		};
	},

	remove(groups: Groups, tabId: string): Groups {
		const entry = Object.entries(groups).find(([, group]) => group.tabs.some((tab) => tab.id === tabId));
		if (!entry) {
			return groups;
		}

		const [projectId, group] = entry;
		const tabs = group.tabs.filter((tab) => tab.id !== tabId);
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

	toggleSplit(groups: Groups, projectId: string): Groups {
		const group = groups[projectId];
		if (!group?.tabs[group.active]) {
			return groups;
		}
		return {
			...groups,
			[projectId]: {
				...group,
				tabs: group.tabs.map((tab, index) =>
					index === group.active ? { ...tab, split: !tab.split } : tab),
			},
		};
	},

	adjustSplitRatio(groups: Groups, projectId: string, delta: number): Groups {
		const group = groups[projectId];
		if (!group?.tabs[group.active]) {
			return groups;
		}
		return {
			...groups,
			[projectId]: {
				...group,
				tabs: group.tabs.map((tab, index) =>
					index === group.active
						? { ...tab, splitRatio: clampRatio(tab.splitRatio + delta) }
						: tab),
			},
		};
	},
};
