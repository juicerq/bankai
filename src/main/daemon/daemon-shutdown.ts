import { app } from "electron";
import { AgentActivity } from "@main/agents/agent-activity";
import { GitProcess } from "@main/git/git-process";
import { Logger } from "@main/infra/logger";
import { Services } from "@main/services";
import { ShellAgents } from "@main/terminal/shell-agents";
import { shellProcesses } from "@main/terminal/shell-processes";

let stopping = false;

async function runDaemonShutdown(): Promise<void> {
	if (stopping) {
		return;
	}

	stopping = true;
	Logger.info("daemon:stopping", { pid: process.pid });

	Services.stopAll();
	GitProcess.close();
	AgentActivity.stop();

	await ShellAgents.terminate({ shells: shellProcesses.noteShutdown() }).catch((err) =>
		Logger.error("daemon:shell-shutdown-failed", { err: String(err) })
	);

	app.exit(0);
}

export const DaemonShutdown = {
	run: runDaemonShutdown,
};
