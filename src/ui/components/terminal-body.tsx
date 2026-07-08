import type { Project } from "@core/store/projects";
import type { TabSupervisor } from "@core/terminal/TabSupervisor";
import { StatusHint } from "@ui/components/status-hint";
import { TabBar } from "@ui/components/tab-bar";
import { TerminalView } from "@ui/components/terminal-view";
import { theme } from "@ui/theme";
import type { TabGroup, TabStatus } from "@ui/types";

export function TerminalBody({
	project,
	group,
	supervisor,
	activeTabId,
	terminalFocused,
	statuses,
	leader,
	zenMode,
}: {
	project: Project | undefined;
	group: TabGroup | undefined;
	supervisor: TabSupervisor;
	activeTabId: string | undefined;
	terminalFocused: boolean;
	statuses: Record<string, TabStatus>;
	leader: boolean;
	zenMode: boolean;
}) {
	if (!project) {
		return (
			<box style={{ flexGrow: 1, flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
				<text style={{ fg: theme.textDim }}>No project selected.</text>
				<text style={{ fg: theme.textFaint }}>Press a to add one.</text>
			</box>
		);
	}

	const mode = terminalFocused ? "terminal" : activeTabId ? "idle" : "empty";

	return (
		<box style={{ flexGrow: 1, flexDirection: "column" }}>
			<TabBar project={project} group={group} statuses={statuses} />

			{!!activeTabId && (
				<TerminalView
					key={activeTabId}
					supervisor={supervisor}
					tabId={activeTabId}
					focused={terminalFocused}
				/>
			)}

			{!activeTabId && (
				<box style={{ flexGrow: 1, flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
					<text style={{ fg: theme.textFaint }}>No terminals in {project.name}.</text>
					<text style={{ fg: theme.textFaint }}>Press n for a new shell.</text>
				</box>
			)}

			{!zenMode && <StatusHint mode={mode} leader={leader} />}
		</box>
	);
}
