import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { type IDisposable, type ITerminalOptions, Terminal } from "@xterm/xterm";
import { useCallback, useRef } from "react";
import type { ResumeOutcome } from "@renderer/routes/-utils/resume-state";
import { readTerminalStyle } from "@renderer/routes/-utils/terminal-style";
import type { TerminalCommandErrorEvent } from "@shared/terminal";
import { throttle } from "@shared/throttle";

const TERMINAL_OPTIONS = {
	allowProposedApi: false,
	convertEol: true,
	cursorBlink: true,
	cursorStyle: "bar",
	fontSize: 14,
	fontWeight: "400",
	fontWeightBold: "600",
	lineHeight: 1.35,
	scrollback: 10_000,
} satisfies ITerminalOptions;

const TERMINAL_RESIZE_THROTTLE_MS = 150;
const TERMINAL_COMMAND_FAILURES: Record<TerminalCommandErrorEvent["command"], string> = {
	write: "Terminal input failed",
	resize: "Terminal resize failed",
	close: "Terminal close failed",
};

interface ActiveWebgl {
	addon: WebglAddon;
	contextLoss: IDisposable;
}

export function useTerminalSession(options: {
	projectId: string;
	shellId: string;
	focusRequest: number;
	resizeDeferred: boolean;
	resumeOnMount: boolean;
	onResumeOutcome: (outcome: ResumeOutcome) => void;
}) {
	const { projectId, shellId, focusRequest, resizeDeferred, resumeOnMount } = options;
	const sessionRef = useRef<RendererTerminalSession | null>(null);
	const activeRef = useRef(false);
	const activationRef = useRef<symbol | null>(null);
	const resizeDeferredRef = useRef(resizeDeferred);
	resizeDeferredRef.current = resizeDeferred;
	const resumeOnMountRef = useRef(resumeOnMount);
	resumeOnMountRef.current = resumeOnMount;
	const onResumeOutcomeRef = useRef(options.onResumeOutcome);
	onResumeOutcomeRef.current = options.onResumeOutcome;
	const registerContainer = useCallback((container: HTMLDivElement | null) => {
		if (!container) {
			return;
		}

		let session: RendererTerminalSession | undefined;
		const cancelStart = scheduleAfterPaint(() => {
			session = new RendererTerminalSession(container, {
				projectId,
				shellId,
				resume: resumeOnMountRef.current,
				resizeDeferred: resizeDeferredRef.current,
				onResumeOutcome: (outcome) => onResumeOutcomeRef.current(outcome),
			});
			sessionRef.current = session;
			session.setActive(activeRef.current);
		});

		return () => {
			cancelStart();
			if (!session) {
				return;
			}
			if (sessionRef.current === session) {
				sessionRef.current = null;
			}
			session.dispose();
		};
	}, [projectId, shellId]);
	const retryResume = useCallback(() => sessionRef.current?.retryResume(), []);
	const registerActivation = useCallback(() => {
		const activation = Symbol("terminal-activation");
		activationRef.current = activation;
		activeRef.current = true;
		sessionRef.current?.setActive(true);
		return () => {
			if (activationRef.current !== activation) {
				return;
			}

			activationRef.current = null;
			activeRef.current = false;
			sessionRef.current?.setActive(false);
		};
	}, []);
	const registerFocusRequest = useCallback(() => {
		if (focusRequest > 0) {
			sessionRef.current?.focus();
		}
	}, [focusRequest]);
	const registerResizeDeferral = useCallback((node: HTMLSpanElement | null) => {
		if (node) {
			sessionRef.current?.setResizeDeferred(resizeDeferred);
		}
	}, [resizeDeferred]);

	return { registerContainer, registerActivation, registerFocusRequest, registerResizeDeferral, retryResume };
}

interface RendererTerminalOptions {
	projectId: string;
	shellId: string;
	resume: boolean;
	resizeDeferred: boolean;
	onResumeOutcome: (outcome: ResumeOutcome) => void;
}

export class RendererTerminalSession {
	private readonly terminal = new Terminal({ ...TERMINAL_OPTIONS, ...readTerminalStyle() });
	private readonly fit = new FitAddon();
	private readonly resizeProcess;
	private readonly resizeObserver;
	private readonly input;
	private readonly removeDataListener;
	private readonly removeExitListener;
	private readonly removeCommandErrorListener;
	private sessionId: string | undefined;
	private lastCols: number | undefined;
	private lastRows: number | undefined;
	private webgl: ActiveWebgl | undefined;
	private webglIdle: number | undefined;
	private active = false;
	private disposed = false;
	private lifecycle = 0;
	private resizePending = false;
	private resizeDeferred: boolean;
	private resumeAttempt: boolean;

	constructor(
		private readonly container: HTMLDivElement,
		private readonly options: RendererTerminalOptions,
	) {
		this.resizeDeferred = options.resizeDeferred;
		this.resumeAttempt = options.resume;
		this.terminal.loadAddon(this.fit);
		this.terminal.open(container);
		this.removeDataListener = window.bankaiTerminal.onData((event) => {
			if (event.sessionId === this.sessionId) {
				this.terminal.write(event.data);
			}
		});
		this.removeExitListener = window.bankaiTerminal.onExit((event) => {
			if (event.sessionId === this.sessionId) {
				this.terminal.write(`\r\n\u001B[90m[process exited ${event.exitCode}]\u001B[0m\r\n`);
			}
		});
		this.removeCommandErrorListener = window.bankaiTerminal.onCommandError((event) => {
			if (event.sessionId === this.sessionId) {
				this.fail(TERMINAL_COMMAND_FAILURES[event.command], event.error);
			}
		});
		this.input = this.terminal.onData((data) => {
			if (this.sessionId) {
				window.bankaiTerminal.write(this.sessionId, data);
			}
		});
		this.resizeProcess = throttle(() => this.syncProcessDimensions(), TERMINAL_RESIZE_THROTTLE_MS);
		this.resizeObserver = new ResizeObserver(() => this.handleContainerResize());
		this.resizeObserver.observe(container);
		this.start().catch((err) => this.fail("Failed to open shell", err));
	}

	retryResume() {
		if (this.disposed) {
			return;
		}

		this.lifecycle += 1;
		if (this.sessionId) {
			window.bankaiTerminal.close(this.sessionId);
			this.sessionId = undefined;
		}
		this.resumeAttempt = true;
		this.start().catch((err) => this.fail("Failed to resume shell", err));
	}

	setActive(active: boolean) {
		if (active === this.active) {
			return;
		}

		this.active = active;
		if (!active) {
			return;
		}

		this.terminal.focus();
		this.reportViewed();
		if (this.sessionId && !this.webgl) {
			this.loadWebgl();
		}
	}

	focus() {
		if (!this.disposed) {
			this.terminal.focus();
		}
	}

	setResizeDeferred(deferred: boolean) {
		if (deferred === this.resizeDeferred) {
			return;
		}

		this.resizeDeferred = deferred;
		if (deferred) {
			this.resizeProcess.cancel();
			return;
		}
		if (this.resizePending) {
			this.resizePending = false;
			this.fitToContainer();
		}
	}

	dispose() {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		this.lifecycle += 1;
		if (this.webglIdle !== undefined) {
			cancelIdleCallback(this.webglIdle);
		}
		this.resizeObserver.disconnect();
		this.resizeProcess.cancel();
		this.input.dispose();
		this.removeDataListener();
		this.removeExitListener();
		this.removeCommandErrorListener();
		if (this.sessionId) {
			window.bankaiTerminal.close(this.sessionId);
		}
		this.disposeWebgl();
		this.terminal.dispose();
	}

	private async start() {
		const openingLifecycle = this.lifecycle;
		await document.fonts.ready;
		if (this.lifecycle !== openingLifecycle) {
			return;
		}

		this.fit.fit();
		if (this.webglIdle === undefined) {
			this.webglIdle = requestIdleCallback(() => {
				if (!this.webgl) {
					this.loadWebgl();
				}
			}, { timeout: 1500 });
		}
		this.lastCols = this.terminal.cols;
		this.lastRows = this.terminal.rows;
		const sessionId = await this.spawn();
		if (this.lifecycle !== openingLifecycle) {
			window.bankaiTerminal.close(sessionId);
			return;
		}

		this.sessionId = sessionId;
		this.syncProcessDimensions();
		if (this.active) {
			this.terminal.focus();
			this.reportViewed();
		}
	}

	private async spawn(): Promise<string> {
		const { projectId, shellId } = this.options;
		if (this.resumeAttempt) {
			this.resumeAttempt = false;
			try {
				const sessionId = await window.bankaiTerminal.resume(
					projectId,
					shellId,
					this.terminal.cols,
					this.terminal.rows,
				);
				this.options.onResumeOutcome({ kind: "resumed" });
				return sessionId;
			} catch (err) {
				this.options.onResumeOutcome({ kind: "failed", reason: err instanceof Error ? err.message : String(err) });
			}
		}

		return window.bankaiTerminal.open(projectId, shellId, this.terminal.cols, this.terminal.rows);
	}

	private reportViewed() {
		if (this.active && this.sessionId) {
			window.bankaiActivity.markViewed(this.sessionId);
		}
	}

	private handleContainerResize() {
		if (this.resizeDeferred) {
			this.resizePending = true;
			return;
		}

		this.fitToContainer();
	}

	private fitToContainer() {
		if (this.container.clientWidth === 0 || this.container.clientHeight === 0) {
			return;
		}

		this.fit.fit();
		this.resizeProcess();
	}

	private syncProcessDimensions() {
		if (this.sessionId && (this.terminal.cols !== this.lastCols || this.terminal.rows !== this.lastRows)) {
			this.lastCols = this.terminal.cols;
			this.lastRows = this.terminal.rows;
			window.bankaiTerminal.resize(this.sessionId, this.terminal.cols, this.terminal.rows);
		}
	}

	private loadWebgl() {
		if (this.webgl) {
			return;
		}

		try {
			const addon = new WebglAddon();
			const contextLoss = addon.onContextLoss(() => this.disposeWebgl(addon));
			this.webgl = { addon, contextLoss };
			this.terminal.loadAddon(addon);
			this.handleContainerResize();
		} catch {
			this.disposeWebgl();
		}
	}

	private disposeWebgl(addon?: WebglAddon) {
		if (!this.webgl || (addon && this.webgl.addon !== addon)) {
			return;
		}

		const { contextLoss, addon: activeAddon } = this.webgl;
		this.webgl = undefined;
		contextLoss.dispose();
		activeAddon.dispose();
		if (!this.disposed) {
			this.handleContainerResize();
		}
	}

	private fail(message: string, err: unknown) {
		if (!this.disposed) {
			this.terminal.write(`\r\n\u001B[31m${message}: ${String(err)}\u001B[0m\r\n`);
		}
	}
}

function scheduleAfterPaint(run: () => void): () => void {
	let frame = requestAnimationFrame(() => {
		frame = requestAnimationFrame(run);
	});

	return () => cancelAnimationFrame(frame);
}
