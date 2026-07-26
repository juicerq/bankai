import { randomUUID } from "node:crypto";
import { type WebContents } from "electron";
import { type IPty, spawn } from "node-pty";
import { AgentActivity } from "@main/activity/AgentActivity";
import { harnessResume } from "@main/activity/harnesses";
import { Logger } from "@main/logger";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { autostartCommandLine } from "@main/terminal/autostart";
import { shellArgs, shellCommandLine } from "@main/terminal/commandLine";
import { terminalEnv } from "@main/terminal/env";
import { forgetShellOutput, noteShellOutput } from "@main/terminal/ShellOutputLines";
import { forgetShellTitle, noteShellTitle } from "@main/terminal/ShellTitles";
import { TerminalDataBuffer } from "@main/terminal/TerminalDataBuffer";
import type { TerminalEvent, TerminalExitEvent } from "@shared/terminal";

const SHELL = process.platform === "win32"
	? process.env.ComSpec || "cmd.exe"
	: process.env.SHELL || "/bin/sh";

interface Session {
	ownerId: number;
	projectId: string;
	shellId: string;
	pty: IPty;
	output: TerminalDataBuffer;
}

export interface TerminalSessionInfo {
	sessionId: string;
	projectId: string;
	shellId: string;
	pid: number;
}

interface SpawnInput {
	projectId: string;
	shellId: string;
	cwd: string;
	cols: number;
	rows: number;
	launch?: string;
}

const sessions = new Map<string, Session>();
const ownerGenerations = new Map<number, number>();

export const TerminalSessions = {
	open: async (
		owner: WebContents,
		input: { projectId: string; shellId: string; cols: number; rows: number },
	): Promise<string> => {
		const generation = ownerGenerations.get(owner.id) || 0;
		const [project, launch] = await Promise.all([Projects.find(input.projectId), autostartCommandLine()]);

		return spawnSession(owner, generation, {
			projectId: input.projectId,
			shellId: input.shellId,
			cwd: project.path,
			cols: input.cols,
			rows: input.rows,
			launch,
		});
	},
	resume: async (
		owner: WebContents,
		input: { projectId: string; shellId: string; cols: number; rows: number },
	): Promise<string> => {
		const generation = ownerGenerations.get(owner.id) || 0;
		const shell = await Continuity.findShell({ projectId: input.projectId, shellId: input.shellId });
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

		return spawnSession(owner, generation, {
			projectId: input.projectId,
			shellId: input.shellId,
			cwd: session.cwd,
			cols: input.cols,
			rows: input.rows,
			launch: shellCommandLine(command),
		});
	},
	write: (ownerId: number, sessionId: string, data: string) => {
		ownedSession(ownerId, sessionId)?.pty.write(data);
	},
	resize: (ownerId: number, sessionId: string, cols: number, rows: number) => {
		ownedSession(ownerId, sessionId)?.pty.resize(cols, rows);
	},
	close: (ownerId: number, sessionId: string) => {
		const session = ownedSession(ownerId, sessionId);
		if (!session) {
			return;
		}
		session.output.flush();
		sessions.delete(sessionId);
		session.pty.kill();
	},
	list: (): TerminalSessionInfo[] => {
		const infos: TerminalSessionInfo[] = [];
		for (const [sessionId, session] of sessions) {
			infos.push({ sessionId, projectId: session.projectId, shellId: session.shellId, pid: session.pty.pid });
		}
		return infos;
	},
	closeOwner: (ownerId: number) => {
		ownerGenerations.set(ownerId, (ownerGenerations.get(ownerId) || 0) + 1);
		for (const [sessionId, session] of sessions) {
			if (session.ownerId === ownerId) {
				session.output.flush();
				sessions.delete(sessionId);
				try {
					session.pty.kill();
				} catch (err) {
					Logger.error("terminal:owner-close-failed", {
						ownerId,
						sessionId,
						err: String(err),
					});
				}
			}
		}
	},
};

function spawnSession(owner: WebContents, generation: number, input: SpawnInput): string {
	if (owner.isDestroyed() || (ownerGenerations.get(owner.id) || 0) !== generation) {
		throw new Error("Terminal owner is no longer available");
	}

	const sessionId = randomUUID();
	const terminal = spawn(SHELL, shellArgs(SHELL, input.launch), {
		name: "xterm-256color",
		cols: input.cols,
		rows: input.rows,
		cwd: input.cwd,
		env: terminalEnv(process.env),
	});
	const output = new TerminalDataBuffer((data) => {
		sendTerminalEvent(owner, "terminal:data", { sessionId, data });
	});
	sessions.set(sessionId, {
		ownerId: owner.id,
		projectId: input.projectId,
		shellId: input.shellId,
		pty: terminal,
		output,
	});

	terminal.onData((data) => {
		AgentActivity.noteData(sessionId, data);
		noteShellTitle(input.shellId, data);
		noteShellOutput(input.shellId, data);
		output.append(data);
	});
	terminal.onExit(({ exitCode }) => {
		output.dispose();
		const spontaneous = sessions.delete(sessionId);
		forgetShellTitle(input.shellId);
		forgetShellOutput(input.shellId);
		if (spontaneous) {
			Continuity.clearShellSession({ projectId: input.projectId, shellId: input.shellId }).catch((err) =>
				Logger.error("terminal:exit-clear-session-failed", { sessionId, err: String(err) }),
			);
		}
		sendTerminalEvent(owner, "terminal:exit", { sessionId, exitCode });
	});

	return sessionId;
}

function ownedSession(ownerId: number, sessionId: string): Session | undefined {
	const session = sessions.get(sessionId);

	if (session?.ownerId === ownerId) {
		return session;
	}

	return undefined;
}

function sendTerminalEvent(
	owner: WebContents,
	channel: "terminal:data" | "terminal:exit",
	payload: TerminalEvent | TerminalExitEvent,
): void {
	if (owner.isDestroyed()) {
		return;
	}
	try {
		owner.send(channel, payload);
	} catch (err) {
		Logger.error(`${channel}-send-failed`, { ownerId: owner.id, err: String(err) });
	}
}

