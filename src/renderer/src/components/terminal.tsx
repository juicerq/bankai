import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { bookTerminalTheme } from "@renderer/constants/book-theme";

type TerminalProps = { sessionId: string; onExit?: () => void };

const FONT_FAMILY = '"Maple Mono NF", monospace';
const FONT_SIZE = 13;

export function Terminal({ sessionId, onExit }: TerminalProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;

	useEffect(() => {
		const container = containerRef.current;

		if (!container) {
			return;
		}

		const terminal = new XTerm({
			theme: bookTerminalTheme,
			fontFamily: FONT_FAMILY,
			fontSize: FONT_SIZE,
			cursorBlink: false,
			convertEol: false,
		});

		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(container);

		const fit = () => {
			if (container.clientWidth === 0 || container.clientHeight === 0) {
				return;
			}

			fitAddon.fit();
			window.pty.resize(sessionId, terminal.cols, terminal.rows);
		};

		fit();

		const offData = window.pty.onData(sessionId, (chunk) =>
			terminal.write(chunk),
		);
		const inputDisposable = terminal.onData((data) =>
			window.pty.input(sessionId, data),
		);
		const offExit = window.pty.onExit(sessionId, () => {
			terminal.write("\r\n\u001B[2m[sessão encerrada]\u001B[0m\r\n");
			onExitRef.current?.();
		});

		const observer = new ResizeObserver(() => fit());
		observer.observe(container);

		return () => {
			offData();
			offExit();
			inputDisposable.dispose();
			observer.disconnect();
			terminal.dispose();
		};
	}, [sessionId]);

	return <div ref={containerRef} className="h-full w-full" />;
}
