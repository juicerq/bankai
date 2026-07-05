import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type IPty, spawn } from "@lydell/node-pty";
import { Hooks } from "@main/hooks/HookGateway";
import type { PtyData, PtyExit } from "@shared/pty";

type Session = { pty: IPty; cwd: string; settingsPath: string };

export class SessionSupervisor {
	private readonly sessions = new Map<string, Session>();
	private readonly dataListeners = new Set<(event: PtyData) => void>();
	private readonly exitListeners = new Set<(event: PtyExit) => void>();
	private claudePath: string | null = null;

	create({ cwd }: { cwd: string }): string {
		const sessionId = randomUUID();
		const settingsPath = this.writeHookSettings(sessionId);

		const pty = spawn(
			this.resolveClaude(),
			["--session-id", sessionId, "--settings", settingsPath],
			{
				name: "xterm-256color",
				cols: 80,
				rows: 24,
				cwd,
				env: { ...process.env, TERM: "xterm-256color" },
			},
		);

		pty.onData((chunk) => this.dispatch(this.dataListeners, { sessionId, chunk }));

		pty.onExit(({ exitCode }) => {
			this.discard(sessionId);
			this.dispatch(this.exitListeners, { sessionId, exitCode });
		});

		this.sessions.set(sessionId, { pty, cwd, settingsPath });

		return sessionId;
	}

	private writeHookSettings(sessionId: string): string {
		const dir = join(tmpdir(), "project-j-hooks");
		mkdirSync(dir, { recursive: true });

		const path = join(dir, `${sessionId}.json`);
		writeFileSync(path, JSON.stringify(Hooks.settingsFor(sessionId)));

		return path;
	}

	private discard(sessionId: string) {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		rmSync(session.settingsPath, { force: true });
		this.sessions.delete(sessionId);
	}

	write(sessionId: string, data: string) {
		this.sessions.get(sessionId)?.pty.write(data);
	}

	resize(sessionId: string, cols: number, rows: number) {
		this.sessions.get(sessionId)?.pty.resize(cols, rows);
	}

	kill(sessionId: string) {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		session.pty.kill();
		this.discard(sessionId);
	}

	list(): { sessionId: string; cwd: string }[] {
		return [...this.sessions].map(([sessionId, { cwd }]) => ({
			sessionId,
			cwd,
		}));
	}

	onData(cb: (event: PtyData) => void) {
		return this.subscribe(this.dataListeners, cb);
	}

	onExit(cb: (event: PtyExit) => void) {
		return this.subscribe(this.exitListeners, cb);
	}

	private subscribe<T>(listeners: Set<T>, cb: T) {
		listeners.add(cb);
		return () => {
			listeners.delete(cb);
		};
	}

	private dispatch<T>(listeners: Set<(event: T) => void>, event: T) {
		for (const listener of listeners) {
			listener(event);
		}
	}

	private resolveClaude(): string {
		if (this.claudePath) {
			return this.claudePath;
		}

		const resolved = this.whichClaude();

		if (!resolved) {
			throw new Error(
				"claude não encontrado no PATH - abra o app pelo terminal ou garanta que `claude` esteja no PATH",
			);
		}

		this.claudePath = resolved;

		return resolved;
	}

	private whichClaude(): string {
		try {
			return execFileSync("which", ["claude"], { encoding: "utf8" }).trim();
		} catch {
			return "";
		}
	}
}

export const Sessions = new SessionSupervisor();
