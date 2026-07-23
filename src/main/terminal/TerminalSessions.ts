import { randomUUID } from "node:crypto";
import { type WebContents } from "electron";
import { type IPty, spawn } from "node-pty";
import { Logger } from "@main/logger";
import { Projects } from "@main/store/projects";
import { TerminalDataBuffer } from "@main/terminal/TerminalDataBuffer";
import type { TerminalEvent, TerminalExitEvent } from "@shared/terminal";

const SHELL = process.platform === "win32"
	? process.env.ComSpec || "cmd.exe"
	: process.env.SHELL || "/bin/sh";

interface Session {
	ownerId: number;
	pty: IPty;
	output: TerminalDataBuffer;
}

const sessions = new Map<string, Session>();
const ownerGenerations = new Map<number, number>();

export const TerminalSessions = {
	open: async (
		owner: WebContents,
		projectId: string,
		cols: number,
		rows: number,
	): Promise<string> => {
		const generation = ownerGenerations.get(owner.id) || 0;
		const project = await Projects.find(projectId);
		if (owner.isDestroyed() || (ownerGenerations.get(owner.id) || 0) !== generation) {
			throw new Error("Terminal owner is no longer available");
		}
		const sessionId = randomUUID();
		const terminal = spawn(SHELL, [], {
			name: "xterm-256color",
			cols,
			rows,
			cwd: project.path,
			env: terminalEnv(),
		});
		const output = new TerminalDataBuffer((data) => {
			sendTerminalEvent(owner, "terminal:data", { sessionId, data });
		});
		sessions.set(sessionId, { ownerId: owner.id, pty: terminal, output });

		terminal.onData((data) => output.append(data));
		terminal.onExit(({ exitCode }) => {
			output.dispose();
			sessions.delete(sessionId);
			sendTerminalEvent(owner, "terminal:exit", { sessionId, exitCode });
		});
		return sessionId;
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

function ownedSession(ownerId: number, sessionId: string): Session | undefined {
	const session = sessions.get(sessionId);
	return session?.ownerId === ownerId ? session : undefined;
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

function terminalEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) {
			env[key] = value;
		}
	}
	return { ...env, TERM: "xterm-256color", COLORTERM: "truecolor", COLORFGBG: "15;0" };
}
