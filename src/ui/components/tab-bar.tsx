import { TextAttributes } from "@opentui/core";
import { TabChip } from "@ui/components/tab-chip";
import { theme } from "@ui/theme";
import type { SessionTabStatus as TabStatus } from "@core/session/SessionReviews";
import type { TabGroup } from "@core/workspace/WorkspaceGroup";

export function TabBar({
	project,
	group,
	statuses,
}: {
	project: { name: string };
	group: TabGroup | undefined;
	statuses: Record<string, TabStatus>;
}) {
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

			{group?.tabs.map((tab, index) => (
				<TabChip
					key={tab.id}
					index={index}
					active={index === group.active}
					split={tab.split}
					status={statuses[tab.id]}
				/>
			))}

			{(!group || group.tabs.length === 0) && (
				<text style={{ fg: theme.textFaint }}>no shells</text>
			)}
		</box>
	);
}
