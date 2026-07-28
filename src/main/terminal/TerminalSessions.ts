import { randomUUID } from "node:crypto";
import { spawn } from "node-pty";
import { AgentActivity } from "@main/activity/AgentActivity";
import { harnessResume } from "@main/activity/harnesses";
import { Logger } from "@main/logger";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { autostartCommandLine, harnessCommandLine } from "@main/terminal/autostart";
import { shellArgs } from "@main/terminal/commandLine";
import { terminalEnv } from "@main/terminal/env";
import { SHELL } from "@main/terminal/shell";
import { forgetShellOutput, noteShellOutput } from "@main/terminal/ShellOutputLines";
import { type ShellAttachment, shellProcesses, type ShellRef } from "@main/terminal/ShellProcesses";
import { forgetShellTitle, noteShellTitle } from "@main/terminal/ShellTitles";
import type { TerminalAttached } from "@shared/terminal";

interface OpenInput extends ShellRef {
	cols: number;
	rows: number;
}

interface SpawnInput extends OpenInput {
	cwd: string;
	launch?: string;
}

export const TerminalSessions = {
	open: async (attachment: ShellAttachment, input: OpenInput): Promise<TerminalAttached> => {
		const [project, shell] = await Promise.all([Projects.find(input.projectId), Continuity.findShell(input)]);
		const launch = shell?.plain ? undefined : await autostartCommandLine();

		return spawnOrAttach(attachment, { ...input, cwd: project.path, launch });
	},
	resume: async (attachment: ShellAttachment, input: OpenInput): Promise<TerminalAttached> => {
		const shell = await Continuity.findShell(input);
		const session = shell?.session;
		if (!session) {
			throw new Error("No resumable agent session for this shell");
		}

		const resume = harnessResume(session.harness);
		if (!resume) {
			throw new Error(`Resume is not supported for harness "${session.harness}"`);
		}

		const command = resume({ sessionId: session.sessionId });
		if (!command) {
			throw new Error(`Invalid session ref for harness "${session.harness}"`);
		}

		return spawnOrAttach(attachment, {
			...input,
			cwd: session.cwd,
			launch: await harnessCommandLine(command, session.harness),
		});
	},
};

function spawnOrAttach(attachment: ShellAttachment, input: SpawnInput): TerminalAttached {
	const running = shellProcesses.find(input);
	if (running) {
		return attached(running, shellProcesses.attach(running, attachment));
	}

	const sessionId = randomUUID();
	const terminal = spawn(SHELL, shellArgs(SHELL, input.launch), {
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
			resize: (cols, rows) => terminal.resize(cols, rows),
			kill: (signal) => terminal.kill(signal),
		},
	});
	const replay = shellProcesses.attach(sessionId, attachment);

	terminal.onData((data) => {
		AgentActivity.noteData(sessionId, data);
		noteShellTitle(input.shellId, data);
		noteShellOutput(input.shellId, data);
		shellProcesses.noteData(sessionId, data);
	});
	terminal.onExit(({ exitCode }) => {
		forgetShellTitle(input.shellId);
		forgetShellOutput(input.shellId);

		if (shellProcesses.noteExit(sessionId, exitCode).spontaneous) {
			Continuity.clearShellSession({ projectId: input.projectId, shellId: input.shellId }).catch((err) =>
				Logger.error("terminal:exit-clear-session-failed", { sessionId, err: String(err) }),
			);
		}
	});

	return attached(sessionId, replay);
}

function attached(sessionId: string, replay: string | undefined): TerminalAttached {
	if (!replay) {
		return { sessionId };
	}

	return { sessionId, replay };
}
