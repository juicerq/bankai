import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { type IBufferCellPosition, type IDisposable, Terminal } from "@xterm/xterm";
import { useCallback, useRef } from "react";
import { client } from "@renderer/lib/api";
import { streamResync } from "@renderer/lib/stream/resync";
import { terminalStream } from "@renderer/lib/stream/terminal";
import type { ResumeOutcome } from "@renderer/routes/-features/sessions/lifecycle/resume-state";
import {
	TerminalFileLinks,
	type TerminalFileTarget,
} from "@renderer/routes/-features/terminal/terminal-file-links";
import { registerTerminalStyle, TERMINAL_OPTIONS } from "@renderer/routes/-features/terminal/terminal-style";
import type { TerminalAttached, TerminalCommandErrorEvent } from "@shared/terminal";
import { throttle } from "@shared/throttle";

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

interface TerminalLogicalLine {
	text: string;
	positions: IBufferCellPosition[];
}

function terminalLogicalLineAt(terminal: Terminal, row: number): TerminalLogicalLine | undefined {
	const buffer = terminal.buffer.active;
	let firstRow = row - 1;
	if (!buffer.getLine(firstRow)) {
		return;
	}

	while (firstRow > 0 && buffer.getLine(firstRow)?.isWrapped) {
		firstRow -= 1;
	}

	let lastRow = row - 1;
	while (buffer.getLine(lastRow + 1)?.isWrapped) {
		lastRow += 1;
	}

	let text = "";
	const positions: IBufferCellPosition[] = [];
	for (let lineIndex = firstRow; lineIndex <= lastRow; lineIndex += 1) {
		const line = buffer.getLine(lineIndex);
		if (!line) {
			return;
		}

		for (let column = 0; column < Math.min(line.length, terminal.cols); column += 1) {
			const cell = line.getCell(column);
			if (!cell || cell.getWidth() === 0) {
				continue;
			}

			const chars = cell.getChars() || " ";
			text += chars;
			for (let offset = 0; offset < chars.length; offset += 1) {
				positions.push({ x: column + 1, y: lineIndex + 1 });
			}
		}
	}

	const trimmedLength = text.trimEnd().length;

	return { text: text.slice(0, trimmedLength), positions: positions.slice(0, trimmedLength) };
}

export function useTerminalSession(options: {
	projectId: string;
	shellId: string;
	focusRequest?: number;
	resizeDeferred: boolean;
	resumeOnMount?: boolean;
	attachOnly?: boolean;
	fileLinks?: TerminalFileLinkContext;
	onResumeOutcome?: (outcome: ResumeOutcome) => void;
	onFirstOutput?: () => void;
}) {
	const { projectId, shellId, focusRequest = 0, resizeDeferred, resumeOnMount = false, attachOnly } = options;
	const sessionRef = useRef<RendererTerminalSession | null>(null);
	const activeRef = useRef(false);
	const resizeDeferredRef = useRef(resizeDeferred);
	resizeDeferredRef.current = resizeDeferred;
	const resumeOnMountRef = useRef(resumeOnMount);
	resumeOnMountRef.current = resumeOnMount;
	const onResumeOutcomeRef = useRef(options.onResumeOutcome);
	onResumeOutcomeRef.current = options.onResumeOutcome;
	const onFirstOutputRef = useRef(options.onFirstOutput);
	onFirstOutputRef.current = options.onFirstOutput;
	const fileLinksRef = useRef(options.fileLinks);
	fileLinksRef.current = options.fileLinks;
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
				attachOnly: attachOnly === true,
				resizeDeferred: resizeDeferredRef.current,
				fileLinks: () => fileLinksRef.current,
				onResumeOutcome: (outcome) => onResumeOutcomeRef.current?.(outcome),
				onFirstOutput: () => onFirstOutputRef.current?.(),
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
	}, [projectId, shellId, attachOnly]);
	const retryResume = useCallback(() => sessionRef.current?.retryResume(), []);
	const registerActivation = useCallback((node: HTMLSpanElement | null) => {
		activeRef.current = !!node;
		sessionRef.current?.setActive(!!node);
	}, []);
	const registerFocusRequest = useCallback((node: HTMLSpanElement | null) => {
		if (node && focusRequest > 0) {
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

export interface TerminalFileLinkContext {
	paths: ReadonlySet<string>;
	worktree?: string;
	onOpen: (target: TerminalFileTarget) => void;
}

interface RendererTerminalOptions {
	projectId: string;
	shellId: string;
	resume: boolean;
	attachOnly: boolean;
	resizeDeferred: boolean;
	onResumeOutcome: (outcome: ResumeOutcome) => void;
	onFirstOutput: () => void;
	fileLinks: () => TerminalFileLinkContext | undefined;
}

export class RendererTerminalSession {
	private readonly terminal: Terminal;
	private readonly fit = new FitAddon();
	private readonly resizeProcess;
	private readonly resizeObserver;
	private readonly input;
	private readonly removeDataListener;
	private readonly removeExitListener;
	private readonly removeCommandErrorListener;
	private readonly stopStyle;
	private readonly stopResync;
	private readonly fileLinkProvider;
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
	private painted = false;

	constructor(
		private readonly container: HTMLDivElement,
		private readonly options: RendererTerminalOptions,
	) {
		this.terminal = new Terminal({
			...TERMINAL_OPTIONS,
			cursorBlink: !options.attachOnly,
			disableStdin: options.attachOnly,
		});
		this.stopStyle = registerTerminalStyle(this.terminal);

		this.resizeDeferred = options.resizeDeferred;
		this.resumeAttempt = options.resume;
		this.terminal.loadAddon(this.fit);
		this.terminal.open(container);
		this.terminal.attachCustomKeyEventHandler((event) => this.handleClipboardChord(event));
		this.removeDataListener = terminalStream.onData((event) => {
			if (event.sessionId === this.sessionId) {
				this.paint(event.data);
			}
		});
		this.removeExitListener = terminalStream.onExit((event) => {
			if (event.sessionId === this.sessionId) {
				this.terminal.write(`\r\n\u001B[90m[process exited ${event.exitCode}]\u001B[0m\r\n`);
			}
		});
		this.removeCommandErrorListener = terminalStream.onCommandError((event) => {
			if (event.sessionId === this.sessionId) {
				this.fail(TERMINAL_COMMAND_FAILURES[event.command], event.error);
			}
		});
		this.input = this.terminal.onData((data) => {
			if (this.sessionId && !this.options.attachOnly) {
				terminalStream.write(this.sessionId, data);
			}
		});
		this.fileLinkProvider = this.registerFileLinks();
		this.stopResync = streamResync.register("terminal", () => this.reattach());
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
			terminalStream.close(this.sessionId);
			this.sessionId = undefined;
		}
		this.resumeAttempt = true;
		this.start().catch((err) => this.fail("Failed to resume shell", err));
	}

	private async reattach() {
		if (this.disposed) {
			return;
		}

		this.lifecycle += 1;
		this.sessionId = undefined;
		this.resumeAttempt = false;
		await this.start().catch((err) => this.fail("Failed to reattach shell", err));
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
		this.stopStyle();
		this.stopResync();
		this.fileLinkProvider.dispose();
		if (this.sessionId) {
			terminalStream.detach(this.sessionId);
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
		const { sessionId, replay } = await this.spawn();
		if (this.lifecycle !== openingLifecycle) {
			terminalStream.detach(sessionId);
			return;
		}

		this.sessionId = sessionId;
		if (replay) {
			this.terminal.reset();
			this.paint(replay);
		}
		this.syncProcessDimensions();
		if (this.active) {
			this.terminal.focus();
		}
	}

	private async spawn(): Promise<TerminalAttached> {
		const { projectId, shellId } = this.options;
		if (this.options.attachOnly) {
			return await terminalStream.attach(projectId, shellId);
		}

		if (this.resumeAttempt) {
			this.resumeAttempt = false;
			try {
				const attached = await terminalStream.resume(
					projectId,
					shellId,
					this.terminal.cols,
					this.terminal.rows,
				);
				this.options.onResumeOutcome({ kind: "resumed" });
				return attached;
			} catch (err) {
				this.options.onResumeOutcome({ kind: "failed", reason: err instanceof Error ? err.message : String(err) });
			}
		}

		return await terminalStream.open(projectId, shellId, this.terminal.cols, this.terminal.rows);
	}

	private registerFileLinks() {
		const fileLinks = this.options.fileLinks;

		return this.terminal.registerLinkProvider({
			provideLinks: (row, callback) => {
				const context = fileLinks();
				const logicalLine = terminalLogicalLineAt(this.terminal, row);

				if (!context || !logicalLine?.text) {
					callback([]);
					return;
				}

				const links = TerminalFileLinks.find({
					text: logicalLine.text,
					paths: context.paths,
					worktree: context.worktree,
				});

				callback(links.flatMap(({ start, end, ...target }) => {
					const startPosition = logicalLine.positions[start];
					const endPosition = logicalLine.positions[end - 1];
					if (!startPosition || !endPosition) {
						return [];
					}

					return [{
						range: { start: startPosition, end: endPosition },
						text: logicalLine.text.slice(start, end),
						activate: () => context.onOpen(target),
					}];
				}));
			},
		});
	}

	private handleClipboardChord(event: KeyboardEvent) {
		if (!event.ctrlKey || event.altKey || event.metaKey) {
			return true;
		}

		const isCopy = event.shiftKey && event.code === "KeyC";
		const isPaste = event.code === "KeyV";

		if (!isCopy && !isPaste) {
			return true;
		}

		if (event.type !== "keydown") {
			return false;
		}

		event.preventDefault();

		if (isCopy) {
			this.copySelection();

			return false;
		}

		this.pasteClipboard().catch((err) => this.fail("Paste failed", err));

		return false;
	}

	private copySelection() {
		const selection = this.terminal.getSelection();
		if (!selection) {
			return;
		}

		navigator.clipboard.writeText(selection).catch((err) => this.fail("Copy failed", err));
	}

	private async pasteClipboard() {
		const text = await navigator.clipboard.readText();
		if (text) {
			this.terminal.paste(text);

			return;
		}

		const image = await client.clipboard.image();
		if (image) {
			this.terminal.paste(`${image} `);
		}
	}

	private paint(data: string) {
		this.terminal.write(data);
		if (!this.painted) {
			this.painted = true;
			this.options.onFirstOutput();
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
		if (this.options.attachOnly) {
			return;
		}

		if (this.sessionId && (this.terminal.cols !== this.lastCols || this.terminal.rows !== this.lastRows)) {
			this.lastCols = this.terminal.cols;
			this.lastRows = this.terminal.rows;
			terminalStream.resize(this.sessionId, this.terminal.cols, this.terminal.rows);
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
