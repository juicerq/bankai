import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { bookTerminalTheme } from "@renderer/constants/book-theme";
import { client } from "@renderer/lib/api";

type TerminalProps = { sessionId: string; zoom: number; onExit?: () => void };

const FONT_FAMILY = '"Maple Mono NF", monospace';
const FONT_SIZE = 13;
const FLOW_SIZE_EPSILON = 2;

export function Terminal({ sessionId, zoom, onExit }: TerminalProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;
	const zoomRef = useRef(zoom);
	zoomRef.current = zoom;
	const terminalRef = useRef<XTerm | null>(null);

	// Integração imperativa com o xterm (exceção legítima de useEffect).
	useEffect(() => {
		const container = containerRef.current;

		if (!container) {
			return;
		}

		const terminal = new XTerm({
			theme: bookTerminalTheme,
			fontFamily: FONT_FAMILY,
			fontSize: FONT_SIZE * zoomRef.current,
			cursorBlink: false,
			convertEol: false,
		});
		terminalRef.current = terminal;

		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(container);

		let lastFlow = { width: 0, height: 0 };

		const fit = () => {
			if (container.clientWidth === 0 || container.clientHeight === 0) {
				return;
			}

			const flow = {
				width: container.clientWidth / zoomRef.current,
				height: container.clientHeight / zoomRef.current,
			};

			if (
				Math.abs(flow.width - lastFlow.width) < FLOW_SIZE_EPSILON &&
				Math.abs(flow.height - lastFlow.height) < FLOW_SIZE_EPSILON
			) {
				return;
			}

			lastFlow = flow;
			fitAddon.fit();
			window.pty.resize(sessionId, terminal.cols, terminal.rows);
		};

		fit();

		const inputDisposable = terminal.onData((data) =>
			window.pty.input(sessionId, data),
		);
		const offExit = window.pty.onExit(sessionId, () => {
			terminal.write("\r\n\u001B[2m[sessão encerrada]\u001B[0m\r\n");
			onExitRef.current?.();
		});

		const observer = new ResizeObserver(() => fit());
		observer.observe(container);

		// Reidrata o scrollback do ring buffer do main antes de assinar o stream live,
		// para o histórico não sumir ao remontar (navegação canvas <-> review). A janela
		// entre o snapshot e a assinatura pode perder um chunk, aceitável no remount.
		let disposed = false;
		let offData = () => {};

		client.sessions
			.getBuffer({ sessionId })
			.catch(() => "")
			.then((buffer) => {
				if (disposed) {
					return;
				}

				if (buffer) {
					terminal.write(buffer);
				}

				offData = window.pty.onData(sessionId, (chunk) =>
					terminal.write(chunk),
				);
			});

		return () => {
			disposed = true;
			offData();
			offExit();
			inputDisposable.dispose();
			observer.disconnect();
			terminal.dispose();
			terminalRef.current = null;
		};
	}, [sessionId]);

	// fontSize segue o zoom assentado; integração imperativa com o xterm (ADR 0002).
	useEffect(() => {
		const terminal = terminalRef.current;

		if (!terminal) {
			return;
		}

		terminal.options.fontSize = FONT_SIZE * zoom;
	}, [zoom]);

	return (
		<div className="h-full w-full overflow-hidden">
			<div
				ref={containerRef}
				className="origin-top-left"
				style={{
					width: `${zoom * 100}%`,
					height: `${zoom * 100}%`,
					transform: `scale(${1 / zoom})`,
				}}
			/>
		</div>
	);
}
