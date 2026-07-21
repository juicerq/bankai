import { FitAddon } from "@xterm/addon-fit";
import { type ITerminalOptions, Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { readTerminalStyle } from "@renderer/routes/-utils/terminal-style";

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

export function useTerminalSession(projectId: string) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const terminal = new Terminal({ ...TERMINAL_OPTIONS, ...readTerminalStyle() });
		const fit = new FitAddon();
		terminal.loadAddon(fit);
		terminal.open(container);
		fit.fit();

		let sessionId: string | undefined;
		let disposed = false;
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
		const input = terminal.onData((data) => {
			if (sessionId) {
				window.bankaiTerminal.write(sessionId, data).catch((err) => {
					if (!disposed) {
						terminal.write(`\r\n\u001B[31mTerminal input failed: ${String(err)}\u001B[0m\r\n`);
					}
				});
			}
		});
		let resizeFrame: number | undefined;
		const resizeObserver = new ResizeObserver(() => {
			if (resizeFrame !== undefined) {
				cancelAnimationFrame(resizeFrame);
			}
			resizeFrame = requestAnimationFrame(() => {
				resizeFrame = undefined;
				fit.fit();
				if (sessionId) {
					window.bankaiTerminal.resize(sessionId, terminal.cols, terminal.rows).catch((err) => {
						if (!disposed) {
							terminal.write(`\r\n\u001B[31mTerminal resize failed: ${String(err)}\u001B[0m\r\n`);
						}
					});
				}
			});
		});
		resizeObserver.observe(container);

		window.bankaiTerminal
			.open(projectId, terminal.cols, terminal.rows)
			.then((openedSessionId) => {
				if (disposed) {
					window.bankaiTerminal.close(openedSessionId).catch(() => {});
					return;
				}
				sessionId = openedSessionId;
				terminal.focus();
			})
			.catch((err) => {
				if (!disposed) {
					terminal.write(`\r\n\u001B[31mFailed to open shell: ${String(err)}\u001B[0m\r\n`);
				}
			});

		return () => {
			disposed = true;
			resizeObserver.disconnect();
			if (resizeFrame !== undefined) {
				cancelAnimationFrame(resizeFrame);
			}
			input.dispose();
			removeDataListener();
			removeExitListener();
			if (sessionId) {
				window.bankaiTerminal.close(sessionId).catch(() => {});
			}
			terminal.dispose();
		};
	}, [projectId]);

	return containerRef;
}
