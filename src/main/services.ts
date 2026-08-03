import { Logger } from "@main/infra/logger";
import { ProjectCommands } from "@main/store/project-commands";
import { Projects } from "@main/store/projects";
import { serviceArgs } from "@main/terminal/shell-command-line";
import { shellProcesses } from "@main/terminal/shell-processes";
import { ShellSpawn } from "@main/terminal/shell-spawn";
import type { ServiceState, ServiceStatus } from "@shared/services";

const SERVICE_COLS = 120;
const SERVICE_ROWS = 40;

const states = new Map<string, ServiceState>();
const starting = new Set<string>();
const listeners = new Set<(states: ServiceState[]) => void>();

function publish(state: ServiceState): void {
	states.set(state.commandId, state);
	const snapshot = [...states.values()];

	for (const listener of listeners) {
		listener(snapshot);
	}
}

function exitStatus(spontaneous: boolean, exitCode: number): ServiceStatus {
	if (spontaneous && exitCode !== 0) {
		return "failed";
	}

	return "stopped";
}

async function start(commandId: string): Promise<void> {
	if (states.get(commandId)?.status === "running" || starting.has(commandId)) {
		return;
	}

	starting.add(commandId);

	try {
		const command = await ProjectCommands.find(commandId);
		if (command.kind !== "service") {
			throw new Error(`Command is not a service: ${commandId}`);
		}

		const project = await Projects.find(command.projectId);
		const { pid } = ShellSpawn.run({
			projectId: command.projectId,
			shellId: command.id,
			cwd: project.path,
			cols: SERVICE_COLS,
			rows: SERVICE_ROWS,
			args: serviceArgs(command.command),
			killGroup: true,
			onExit: ({ exitCode, spontaneous }) => {
				publish({
					commandId: command.id,
					projectId: command.projectId,
					status: exitStatus(spontaneous, exitCode),
					exitCode,
				});
			},
		});

		publish({
			commandId: command.id,
			projectId: command.projectId,
			status: "running",
			pid,
			startedAt: Date.now(),
		});
	} finally {
		starting.delete(commandId);
	}
}

function stop(commandId: string): void {
	const state = states.get(commandId);
	if (state?.status !== "running") {
		return;
	}

	shellProcesses.closeShell({ projectId: state.projectId, shellId: commandId });
}

export const Services = {
	list: (): ServiceState[] => [...states.values()],

	subscribe: (listener: (states: ServiceState[]) => void): (() => void) => {
		listeners.add(listener);

		return () => {
			listeners.delete(listener);
		};
	},

	start,

	stop,

	autostart: async (): Promise<void> => {
		const commands = await ProjectCommands.services();

		await Promise.all(
			commands.filter((command) => command.autostart).map((command) =>
				start(command.id).catch((err) =>
					Logger.error("services:autostart-failed", { commandId: command.id, err: String(err) })
				)
			),
		);
	},

	stopProject: (projectId: string): void => {
		for (const state of states.values()) {
			if (state.projectId === projectId) {
				stop(state.commandId);
			}
		}
	},

	stopAll: (): void => {
		for (const state of states.values()) {
			stop(state.commandId);
		}
	},
};
