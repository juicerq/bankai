import { Logger } from "@main/infra/logger";
import { TerminalDataBuffer } from "@main/terminal/buffer/terminal-data-buffer";
import { TerminalMirror, type TerminalSize } from "@main/terminal/buffer/terminal-mirror";
import type { TerminalStreamEvent } from "@shared/terminal";

const TERMINAL_KILL_GRACE_MS = 5_000;

const TERMINAL_FORCED_EXIT_CODE = 137;

export interface TerminalProcess {
	pid: number;
	write: (data: string) => void;
	resize: (cols: number, rows: number) => void;
	kill: (signal?: string) => void;
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

interface ShellProcess extends ShellRef, TerminalSize {
	process: TerminalProcess;
	output: TerminalDataBuffer;
	mirror: TerminalMirror;
	attachments: Map<string, ShellAttachment>;
	closing: boolean;
	forceKill: ReturnType<typeof setTimeout> | undefined;
}

export class ShellProcesses {
	private readonly sessions = new Map<string, ShellProcess>();

	constructor(private readonly killGraceMs = TERMINAL_KILL_GRACE_MS) {}

	register(input: ShellRef & TerminalSize & { sessionId: string; process: TerminalProcess }): void {
		const { sessionId } = input;

		this.sessions.set(sessionId, {
			projectId: input.projectId,
			shellId: input.shellId,
			cols: input.cols,
			rows: input.rows,
			process: input.process,
			output: new TerminalDataBuffer((data) => {
				this.broadcast(sessionId, { type: "data", payload: { sessionId, data } });
			}),
			mirror: new TerminalMirror(input),
			attachments: new Map(),
			closing: false,
			forceKill: undefined,
		});
	}

	shellOf(sessionId: string): ShellRef | undefined {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return undefined;
		}

		return { projectId: session.projectId, shellId: session.shellId };
	}

	find(ref: ShellRef): string | undefined {
		for (const [sessionId, session] of this.sessions) {
			if (!session.closing && session.projectId === ref.projectId && session.shellId === ref.shellId) {
				return sessionId;
			}
		}

		return undefined;
	}

	async attach(sessionId: string, attachment: ShellAttachment, size?: TerminalSize): Promise<string | undefined> {
		const session = this.live(sessionId);
		if (!session) {
			return undefined;
		}

		await session.mirror.drain();

		if (!this.live(sessionId)) {
			throw new Error("shell exited during attach");
		}

		if (size) {
			this.resize(sessionId, size.cols, size.rows);
		}

		const replay = await session.mirror.snapshot();
		session.output.flush();
		session.attachments.set(attachment.connectionId, attachment);

		return replay;
	}

	detach(sessionId: string, connectionId: string): void {
		this.sessions.get(sessionId)?.attachments.delete(connectionId);
	}

	noteData(sessionId: string, data: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		session.mirror.write(data);
		session.output.append(data);
	}

	noteExit(sessionId: string, exitCode: number): { spontaneous: boolean } {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return { spontaneous: false };
		}

		clearTimeout(session.forceKill);
		session.output.dispose();
		this.sessions.delete(sessionId);
		this.broadcastTo(session, { type: "exit", payload: { sessionId, exitCode } });

		return { spontaneous: !session.closing };
	}

	write(sessionId: string, data: string): void {
		this.live(sessionId)?.process.write(data);
	}

	resize(sessionId: string, cols: number, rows: number): void {
		const session = this.live(sessionId);
		if (!session || (session.cols === cols && session.rows === rows)) {
			return;
		}

		session.cols = cols;
		session.rows = rows;
		session.process.resize(cols, rows);
		session.mirror.resize({ cols, rows });
	}

	close(sessionId: string): void {
		const session = this.live(sessionId);
		if (!session) {
			return;
		}

		session.closing = true;
		session.output.flush();
		session.process.kill();
		session.forceKill = setTimeout(() => this.forceExit(sessionId), this.killGraceMs);
		session.forceKill.unref();
	}

	closeShell(ref: ShellRef): void {
		const sessionId = this.find(ref);
		if (sessionId) {
			this.close(sessionId);
		}
	}

	noteShutdown(): TerminalSessionInfo[] {
		const shells = this.list();

		for (const session of this.sessions.values()) {
			session.closing = true;
		}

		return shells;
	}

	list(): TerminalSessionInfo[] {
		const infos: TerminalSessionInfo[] = [];

		for (const [sessionId, session] of this.sessions) {
			if (session.closing) {
				continue;
			}

			infos.push({
				sessionId,
				projectId: session.projectId,
				shellId: session.shellId,
				pid: session.process.pid,
			});
		}

		return infos;
	}

	private forceExit(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		Logger.warn("terminal:force-kill", { sessionId, pid: session.process.pid });
		session.process.kill("SIGKILL");
		this.noteExit(sessionId, TERMINAL_FORCED_EXIT_CODE);
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
