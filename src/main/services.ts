import { Logger } from "@main/infra/logger";
import { ProjectCommands } from "@main/store/project-commands";
import { Projects } from "@main/store/projects";
import { TerminalRingBuffer } from "@main/terminal/buffer/terminal-ring-buffer";
import { ShellCommandLine } from "@main/terminal/shell-command-line";
import { shellProcesses } from "@main/terminal/shell-processes";
import { ShellSpawn } from "@main/terminal/shell-spawn";
import type { ServiceState, ServiceStatus } from "@shared/services";

const SERVICE_COLS = 120;
const SERVICE_ROWS = 40;

const states = new Map<string, ServiceState>();
const outputs = new Map<string, TerminalRingBuffer>();
const starting = new Set<string>();
const exitWaiters = new Map<string, Set<() => void>>();
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
		const output = new TerminalRingBuffer();
		outputs.set(command.id, output);

		const { pid } = ShellSpawn.run({
			projectId: command.projectId,
			shellId: command.id,
			cwd: project.path,
			cols: SERVICE_COLS,
			rows: SERVICE_ROWS,
			args: ShellCommandLine.serviceArgs(command.command),
			killGroup: true,
			onData: (data) => output.append(data),
			onExit: ({ exitCode, spontaneous }) => {
				publish({
					commandId: command.id,
					projectId: command.projectId,
					status: exitStatus(spontaneous, exitCode),
					exitCode,
				});

				releaseExitWaiters(command.id);
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

function releaseExitWaiters(commandId: string): void {
	const waiters = exitWaiters.get(commandId);
	if (!waiters) {
		return;
	}

	exitWaiters.delete(commandId);

	for (const resolve of waiters) {
		resolve();
	}
}

function exited(commandId: string): Promise<void> {
	if (states.get(commandId)?.status !== "running") {
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		const waiters = exitWaiters.get(commandId) ?? new Set<() => void>();

		waiters.add(resolve);
		exitWaiters.set(commandId, waiters);
	});
}

async function restart(commandId: string): Promise<void> {
	const stopping = exited(commandId);

	stop(commandId);

	await stopping;
	await start(commandId);
}

export const Services = {
	list: (): ServiceState[] => [...states.values()],

	output: (commandId: string): string | undefined => outputs.get(commandId)?.read(),

	subscribe: (listener: (states: ServiceState[]) => void): (() => void) => {
		listeners.add(listener);

		return () => {
			listeners.delete(listener);
		};
	},

	start,

	stop,

	restart,

	forget: (commandId: string): void => {
		outputs.delete(commandId);
		states.delete(commandId);
	},

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
