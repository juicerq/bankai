import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { TabSupervisor } from "@core/terminal/TabSupervisor";
import { restoreWorkspace } from "@core/workspace/restoreWorkspace";
import { restoreTabRuntime } from "@core/workspace/restoreTabRuntime";
import { WorkspaceRuntime } from "@core/workspace/WorkspaceRuntime";
import { App } from "@ui/app";

const supervisor = new TabSupervisor();
let workspaceRuntime: WorkspaceRuntime | null = null;
const quit = () => {
	workspaceRuntime?.dispose();
	supervisor.disposeAll();
	process.exit(0);
};
process.on("SIGHUP", quit);
process.on("SIGTERM", quit);

const restored = await restoreWorkspace();
const tabRuntime = restoreTabRuntime(supervisor, restored.projects, restored.plan);
workspaceRuntime = new WorkspaceRuntime(
	supervisor,
	restored.projects,
	restored.plan.focusedIndex,
	tabRuntime.groups,
);
const renderer = await createCliRenderer({ exitOnCtrlC: false, targetFps: 60 });
createRoot(renderer).render(
	<App
		supervisor={supervisor}
		workspaceRuntime={workspaceRuntime}
		plan={restored.plan}
		restoreReview={restored.review}
		initialCaptures={tabRuntime.captures}
	/>,
);
