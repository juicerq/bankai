import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type IPty, spawn } from "node-pty";
import { Logger } from "@main/infra/logger";
import { TerminalEnv } from "@main/terminal/terminal-env";
import { SHELL } from "@main/terminal/shell-binary";
import { shellProcesses, type ShellRef } from "@main/terminal/shell-processes";
import { SHELL_ID_ENV, ShellAgents } from "@main/terminal/shell-agents";

interface SpawnShellInput extends ShellRef {
	cwd: string;
	cols: number;
	rows: number;
	args: string[];
	killGroup?: boolean;
	onData?: (data: string) => void;
	onExit: (exit: { exitCode: number; spontaneous: boolean }) => void;
}

export interface SpawnedShell {
	sessionId: string;
	pid: number;
}

export const ShellSpawn = {
	run: (input: SpawnShellInput): SpawnedShell => {
		const sessionId = randomUUID();
		const terminal = spawn(SHELL, input.args, {
			name: "xterm-256color",
			cols: input.cols,
			rows: input.rows,
			cwd: input.cwd,
			env: { ...TerminalEnv.of(process.env), [SHELL_ID_ENV]: input.shellId },
		});

		shellProcesses.register({
			sessionId,
			projectId: input.projectId,
			shellId: input.shellId,
			cols: input.cols,
			rows: input.rows,
			process: {
				pid: terminal.pid,
				write: (data) => terminal.write(data),
				resize: (cols, rows) => {
					terminal.resize(cols, rows);
					forwardResizeSignal(terminal.pid);
				},
				kill: (signal) => kill({ terminal, shellId: input.shellId, group: input.killGroup === true, signal }),
			},
		});

		terminal.onData((data) => {
			input.onData?.(data);
			shellProcesses.noteData(sessionId, data);
		});
		terminal.onExit(({ exitCode }) => {
			input.onExit({ exitCode, spontaneous: shellProcesses.noteExit(sessionId, exitCode).spontaneous });
		});

		return { sessionId, pid: terminal.pid };
	},
};

function forwardResizeSignal(shellPid: number): void {
	if (process.platform !== "linux") {
		return;
	}

	readFile(`/proc/${shellPid}/task/${shellPid}/children`, "utf8")
		.then((children) => {
			for (const child of children.split(" ").filter(Boolean)) {
				process.kill(Number(child), "SIGWINCH");
			}
		})
		.catch(() => {});
}

interface KillInput {
	terminal: IPty;
	shellId: string;
	group: boolean;
	signal?: string;
}

function kill(input: KillInput): void {
	if (!input.group) {
		input.terminal.kill(input.signal);

		return;
	}

	killShellAndAgents(input).catch((err) =>
		Logger.warn("terminal:group-kill-failed", { pid: input.terminal.pid, err: String(err) })
	);
}

async function killShellAndAgents({ terminal, shellId, signal }: KillInput): Promise<void> {
	for (const agent of await ShellAgents.of(shellId)) {
		if (agent !== terminal.pid) {
			send(agent, signal ?? "SIGTERM");
		}
	}

	if (!send(-terminal.pid, signal ?? "SIGTERM")) {
		terminal.kill(signal);
	}
}

function send(pid: number, signal: string): boolean {
	try {
		process.kill(pid, signal);

		return true;
	} catch {
		return false;
	}
}
