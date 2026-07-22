import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { type IDisposable, type ITerminalOptions, Terminal } from "@xterm/xterm";
import { type RefObject, useEffect, useRef } from "react";
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

type ActiveWebgl = {
	addon: WebglAddon;
	contextLoss: IDisposable;
};

export function useTerminalSession(projectId: string, active: boolean) {
	const containerRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const webglRef = useRef<ActiveWebgl | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const terminal = new Terminal({ ...TERMINAL_OPTIONS, ...readTerminalStyle() });
		terminalRef.current = terminal;
		const fit = new FitAddon();
		terminal.loadAddon(fit);
		terminal.open(container);

		let sessionId: string | undefined;
		let disposed = false;
		const fail = (message: string, err: unknown) => {
			if (!disposed) {
				terminal.write(`\r\n\u001B[31m${message}: ${String(err)}\u001B[0m\r\n`);
			}
		};
		const removeDataListener = window.bankaiTerminal.onData((event) => {
			if (event.sessionId === sessionId) {
				terminal.write(event.data);
			}
		});
		const removeExitListener = window.bankaiTerminal.onExit((event) => {
			if (event.sessionId === sessionId) {
				terminal.write(`\r\n\u001B[90m[process exited ${event.exitCode}]\u001B[0m\r\n`);
			}
		});
		const removeCommandErrorListener = window.bankaiTerminal.onCommandError((event) => {
			if (event.sessionId === sessionId) {
				fail(TERMINAL_COMMAND_FAILURES[event.command], event.error);
			}
		});
		const input = terminal.onData((data) => {
			if (sessionId) {
				window.bankaiTerminal.write(sessionId, data);
			}
		});
		let lastCols: number | undefined;
		let lastRows: number | undefined;
		const resizeTerminal = throttle(() => {
			if (container.clientWidth === 0 || container.clientHeight === 0) {
				return;
			}
			fit.fit();
			if (sessionId && (terminal.cols !== lastCols || terminal.rows !== lastRows)) {
				lastCols = terminal.cols;
				lastRows = terminal.rows;
				window.bankaiTerminal.resize(sessionId, terminal.cols, terminal.rows);
			}
		}, TERMINAL_RESIZE_THROTTLE_MS);
		const resizeObserver = new ResizeObserver(resizeTerminal);
		resizeObserver.observe(container);

		document.fonts.ready
			.then(() => {
				if (disposed) {
					return;
				}
				fit.fit();
				lastCols = terminal.cols;
				lastRows = terminal.rows;
				return window.bankaiTerminal.open(projectId, terminal.cols, terminal.rows);
			})
			.then((openedSessionId) => {
				if (openedSessionId === undefined) {
					return;
				}
				if (disposed) {
					window.bankaiTerminal.close(openedSessionId);
					return;
				}
				sessionId = openedSessionId;
				terminal.focus();
			})
			.catch((err) => fail("Failed to open shell", err));

		return () => {
			disposed = true;
			resizeObserver.disconnect();
			resizeTerminal.cancel();
			input.dispose();
			removeDataListener();
			removeExitListener();
			removeCommandErrorListener();
			if (sessionId) {
				window.bankaiTerminal.close(sessionId);
			}
			disposeWebgl(webglRef);
			terminalRef.current = null;
			terminal.dispose();
		};
	}, [projectId]);

	useEffect(() => {
		const terminal = terminalRef.current;
		if (!active || !terminal) {
			return;
		}

		terminal.focus();
		const webgl = loadWebgl(terminal, webglRef);
		if (!webgl) {
			return;
		}

		return () => disposeWebgl(webglRef, webgl.addon);
	}, [active, projectId]);

	return containerRef;
}

function loadWebgl(
	terminal: Terminal,
	webglRef: RefObject<ActiveWebgl | null>,
): ActiveWebgl | undefined {
	disposeWebgl(webglRef);
	try {
		const addon = new WebglAddon();
		const contextLoss = addon.onContextLoss(() => disposeWebgl(webglRef, addon));
		const webgl = { addon, contextLoss };
		webglRef.current = webgl;
		terminal.loadAddon(addon);
		return webgl;
	} catch {
		disposeWebgl(webglRef);
		return undefined;
	}
}

function disposeWebgl(
	webglRef: RefObject<ActiveWebgl | null>,
	addon?: WebglAddon,
): void {
	const webgl = webglRef.current;
	if (!webgl || (addon && webgl.addon !== addon)) {
		return;
	}
	webglRef.current = null;
	webgl.contextLoss.dispose();
	webgl.addon.dispose();
}
