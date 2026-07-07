import { TextAttributes } from "@opentui/core";
import type { Project } from "@core/store/projects";
import { TabChip } from "@ui/components/tab-chip";
import { theme } from "@ui/theme";
import type { TabGroup } from "@ui/types";

export function TabBar({ project, group }: { project: Project; group: TabGroup | undefined }) {
	return (
		<box
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: 2,
				paddingLeft: 1,
				paddingRight: 1,
				backgroundColor: theme.panel,
				border: ["bottom"],
				borderColor: theme.border,
			}}
		>
			<text style={{ fg: theme.accent, attributes: TextAttributes.BOLD }}>{project.name}</text>

			{group &&
				group.tabs.map((tabId, index) => (
					<TabChip key={tabId} index={index} active={index === group.active} />
				))}

			{(!group || group.tabs.length === 0) && (
				<text style={{ fg: theme.textFaint }}>no shells</text>
			)}
		</box>
	);
}
