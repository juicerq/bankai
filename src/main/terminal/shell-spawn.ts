import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type IPty, spawn } from "node-pty";
import { Logger } from "@main/infra/logger";
import { terminalEnv } from "@main/terminal/terminal-env";
import { SHELL } from "@main/terminal/shell-binary";
import { shellProcesses, type ShellRef } from "@main/terminal/shell-processes";

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
			env: terminalEnv(process.env),
		});

		shellProcesses.register({
			sessionId,
			projectId: input.projectId,
			shellId: input.shellId,
			process: {
				pid: terminal.pid,
				write: (data) => terminal.write(data),
				resize: (cols, rows) => {
					terminal.resize(cols, rows);
					forwardResizeSignal(terminal.pid);
				},
				kill: (signal) => kill(terminal, input.killGroup === true, signal),
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

function kill(terminal: IPty, group: boolean, signal?: string): void {
	if (!group) {
		terminal.kill(signal);

		return;
	}

	try {
		process.kill(-terminal.pid, signal ?? "SIGTERM");
	} catch (err) {
		Logger.warn("terminal:group-kill-failed", { pid: terminal.pid, err: String(err) });
		terminal.kill(signal);
	}
}
