import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { runCommand } from "@core/cli/command";
import { Settings } from "@core/store/settings";
import { TabSupervisor } from "@core/terminal/TabSupervisor";
import { restoreWorkspace } from "@core/workspace/restoreWorkspace";
import { restoreTabRuntime } from "@core/workspace/restoreTabRuntime";
import { WorkspaceRuntime } from "@core/workspace/WorkspaceRuntime";
import { App } from "@ui/app";

const argv = process.argv.slice(2);
if (argv.length > 0) {
	await runCommand(argv).catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
	process.exit(0);
}

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
const settings = await Settings.read();
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
		defaultHarness={settings.defaultHarness}
	/>,
);
