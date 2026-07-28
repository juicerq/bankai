import { TerminalDataBuffer } from "@main/terminal/TerminalDataBuffer";
import { TerminalRingBuffer } from "@main/terminal/TerminalRingBuffer";
import type { TerminalStreamEvent } from "@shared/terminal";

export interface TerminalProcess {
	pid: number;
	write: (data: string) => void;
	resize: (cols: number, rows: number) => void;
	kill: () => void;
}

export interface ShellAttachment {
	connectionId: string;
	send: (event: TerminalStreamEvent) => void;
}

export interface ShellRef {
	projectId: string;
	shellId: string;
}

export interface TerminalSessionInfo extends ShellRef {
	sessionId: string;
	pid: number;
}

interface ShellProcess extends ShellRef {
	process: TerminalProcess;
	output: TerminalDataBuffer;
	ring: TerminalRingBuffer;
	attachments: Map<string, ShellAttachment>;
	closing: boolean;
}

export class ShellProcesses {
	private readonly sessions = new Map<string, ShellProcess>();

	register(input: ShellRef & { sessionId: string; process: TerminalProcess }): void {
		const { sessionId } = input;

		this.sessions.set(sessionId, {
			projectId: input.projectId,
			shellId: input.shellId,
			process: input.process,
			output: new TerminalDataBuffer((data) => {
				this.broadcast(sessionId, { type: "data", payload: { sessionId, data } });
			}),
			ring: new TerminalRingBuffer(),
			attachments: new Map(),
			closing: false,
		});
	}

	find(ref: ShellRef): string | undefined {
		for (const [sessionId, session] of this.sessions) {
			if (!session.closing && session.projectId === ref.projectId && session.shellId === ref.shellId) {
				return sessionId;
			}
		}

		return undefined;
	}

	attach(sessionId: string, attachment: ShellAttachment): string {
		const session = this.live(sessionId);
		if (!session) {
			return "";
		}

		session.output.flush();
		session.attachments.set(attachment.connectionId, attachment);

		return session.ring.read();
	}

	detach(sessionId: string, connectionId: string): void {
		this.sessions.get(sessionId)?.attachments.delete(connectionId);
	}

	detachConnection(connectionId: string): void {
		for (const session of this.sessions.values()) {
			session.attachments.delete(connectionId);
		}
	}

	noteData(sessionId: string, data: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		session.ring.append(data);
		session.output.append(data);
	}

	noteExit(sessionId: string, exitCode: number): boolean {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return false;
		}

		session.output.dispose();
		this.sessions.delete(sessionId);
		this.broadcastTo(session, { type: "exit", payload: { sessionId, exitCode } });

		return !session.closing;
	}

	write(sessionId: string, data: string): void {
		this.live(sessionId)?.process.write(data);
	}

	resize(sessionId: string, cols: number, rows: number): void {
		this.live(sessionId)?.process.resize(cols, rows);
	}

	close(sessionId: string): void {
		const session = this.live(sessionId);
		if (!session) {
			return;
		}

		session.closing = true;
		session.output.flush();
		session.process.kill();
	}

	closeShell(ref: ShellRef): void {
		const sessionId = this.find(ref);
		if (sessionId) {
			this.close(sessionId);
		}
	}

	list(): TerminalSessionInfo[] {
		const infos: TerminalSessionInfo[] = [];

		for (const [sessionId, session] of this.sessions) {
			infos.push({
				sessionId,
				projectId: session.projectId,
				shellId: session.shellId,
				pid: session.process.pid,
			});
		}

		return infos;
	}

	private live(sessionId: string): ShellProcess | undefined {
		const session = this.sessions.get(sessionId);

		if (session?.closing) {
			return undefined;
		}

		return session;
	}

	private broadcast(sessionId: string, event: TerminalStreamEvent): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			this.broadcastTo(session, event);
		}
	}

	private broadcastTo(session: ShellProcess, event: TerminalStreamEvent): void {
		for (const attachment of session.attachments.values()) {
			attachment.send(event);
		}
	}
}

export const shellProcesses = new ShellProcesses();
