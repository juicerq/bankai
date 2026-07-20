import type { TabCapture } from "@core/session/TabSessionMonitor";
import type { Project } from "@core/store/projects";
import type { WorkspaceExecution } from "@core/store/workspace";
import type { TabSupervisor } from "@core/terminal/TabSupervisor";
import type { GroupTab, TabGroup } from "@core/workspace/WorkspaceGroup";
import type { RestorePlan } from "@core/workspace/planRestore";
import {
	buildFreshCommand,
	buildResumeCommand,
} from "@core/workspace/resumeCommand";

export type TabRuntime = {
	groups: Record<string, TabGroup>;
	captures: Record<string, TabCapture>;
};

export function restoreTabRuntime(
	supervisor: TabSupervisor,
	projects: Project[],
	plan: RestorePlan,
): TabRuntime {
	const projectsById = new Map(
		projects.map((project) => [project.id, project]),
	);
	const groups: Record<string, TabGroup> = {};
	const captures: Record<string, TabCapture> = {};

	for (const planned of plan.projects) {
		const project = projectsById.get(planned.projectId);
		if (!project) {
			continue;
		}

		const tabs: GroupTab[] = [];
		for (const tab of planned.tabs) {
			const tabId = supervisor.open({ cwd: project.cwd });
			tabs.push({ id: tabId, split: tab.split, splitRatio: tab.splitRatio });

			if (!tab.runningSession) {
				continue;
			}

			const running: WorkspaceExecution = {};
			if (tab.runningSession.argv) {
				running.argv = tab.runningSession.argv;
			}
			if (tab.runningSession.kind !== undefined) {
				running.kind = tab.runningSession.kind;
			}

			const command = tab.resumable
				? buildResumeCommand(tab.runningSession)
				: buildFreshCommand(tab.runningSession);
			if (command) {
				captures[tabId] = {
					state: "bound",
					session: tab.runningSession.session,
					running,
				};
				supervisor.input(tabId, `${command}\n`);
			} else {
				captures[tabId] = {
					state: "bound",
					session: tab.runningSession.session,
				};
			}
		}

		groups[project.id] = { tabs, active: planned.activeTab };
	}

	return { groups, captures };
}
